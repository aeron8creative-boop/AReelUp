// ───────────── 語音：辨識、氣口偵測、語氣詞/重複偵測、剪輯清單 ─────────────

export const DEFAULT_SPEECH = {
  model: 'base',          // base | small
  language: 'chinese',    // chinese | english | auto
  traditional: true,      // 簡轉繁
  cutSilence: true, cutFiller: true, cutRepeat: true,
  minGap: .35,            // 超過幾秒算氣口（規格 0.3 秒）
  thresholdDb: 'auto',    // 'auto' 或數字（dB）
  pad: .08,               // 剪掉時前後保留的緩衝（秒）
  fillers: '嗯,呃,啊,欸,喔,哦,唔,那個,就是說,然後呢,對對對,um,uh,uhm,erm',
  maxChars: 14,           // 字幕一句最多幾個字
};

export const MODELS = {
  base: { id: 'Xenova/whisper-base', label: '標準（約 80MB）' },
  small: { id: 'Xenova/whisper-small', label: '高準確（約 250MB，中文較準）' },
};

// 把影片檔解碼成 16kHz 單聲道（Whisper 要的格式）
export async function decodeAudio16k(file) {
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const tmp = new AC();
  let decoded;
  try { decoded = await tmp.decodeAudioData(buf); } finally { tmp.close?.(); }
  const len = Math.ceil(decoded.duration * 16000);
  const off = new OfflineAudioContext(1, len, 16000);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

// 每 20ms 一格的音量（dB）
export function envelope(samples, rate = 16000, hop = .02) {
  const n = Math.floor(samples.length / (rate * hop)), step = Math.floor(rate * hop), db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0; const o = i * step;
    for (let j = 0; j < step; j++) { const v = samples[o + j]; s += v * v; }
    db[i] = 10 * Math.log10(s / step + 1e-10);
  }
  return { db, hop };
}

// 自動門檻：底噪（第 10 百分位）+ 10dB，限制在 -55 ~ -25dB
export function autoThreshold(db) {
  const sorted = Float32Array.from(db).sort();
  const floor = sorted[Math.floor(sorted.length * .1)] ?? -60;
  return Math.max(-55, Math.min(-25, floor + 10));
}

// 找出氣口（安靜段落）
export function detectSilences(env, opts) {
  const thr = opts.thresholdDb === 'auto' ? autoThreshold(env.db) : +opts.thresholdDb;
  const out = []; let start = -1;
  for (let i = 0; i <= env.db.length; i++) {
    const quiet = i < env.db.length && env.db[i] < thr;
    if (quiet && start < 0) start = i;
    if (!quiet && start >= 0) {
      const s = start * env.hop, e = i * env.hop;
      if (e - s >= opts.minGap) out.push({ s, e, cut: true });
      start = -1;
    }
  }
  return { silences: out, threshold: thr };
}

const PUNCT = /[\s，。、！？!?,.;；:：「」『』“”"'（）()…—\-]/g;
export const norm = t => String(t || '').replace(PUNCT, '').toLowerCase();

// Whisper 的 chunks → 字詞清單
export function wordsFromChunks(chunks, duration) {
  const words = [];
  for (const c of chunks) {
    const text = c.text || ''; if (!norm(text)) continue;
    let [s, e] = c.timestamp || [0, 0];
    if (e == null || isNaN(e)) e = Math.min(duration, s + .5);
    words.push({ t: text.trim(), s, e: Math.max(e, s + .05), cut: false, kind: null });
  }
  return words;
}

// 只有句子層級時間碼時：把一句平均拆成字（英文按空格）
export function splitSegment(text, s, e) {
  const t = text.trim(); if (!t) return [];
  const toks = /[a-zA-Z]/.test(t) && /\s/.test(t) ? t.split(/\s+/) : [...t.replace(/\s+/g, '')];
  const unit = (e - s) / Math.max(1, toks.length);
  return toks.map((x, i) => ({ t: x, s: s + i * unit, e: s + (i + 1) * unit, cut: false, kind: null }));
}

// 標出語氣詞與重複
export function markWords(words, opts) {
  const fillers = new Set(String(opts.fillers).split(/[,，\s]+/).map(norm).filter(Boolean));
  for (const w of words) if (w.kind === 'filler' || w.kind === 'repeat') { w.kind = null; if (w.auto) { w.cut = false; w.auto = false; } }
  const N = words.map(w => norm(w.t));
  // 語氣詞：整個詞是語氣詞，或由語氣詞的字組成（嗯嗯、啊啊）
  const fillerChars = new Set([...fillers].filter(f => [...f].length === 1));
  words.forEach((w, i) => {
    const n = N[i]; if (!n) return;
    if (fillers.has(n) || [...n].every(c => fillerChars.has(c))) w.kind = 'filler';
  });
  // 多字語氣詞跨好幾個 token（例如「那 個」）
  for (const f of fillers) {
    const L = [...f].length; if (L < 2) continue;
    for (let i = 0; i < N.length; i++) {
      let acc = '', j = i;
      while (j < N.length && acc.length < f.length) acc += N[j++];
      if (acc === f && j - i > 1) for (let k = i; k < j; k++) words[k].kind = 'filler';
    }
  }
  // 重複：緊接著重複的 1~4 個詞（我我我、我覺得我覺得）→ 保留最後一次
  for (let n = 4; n >= 1; n--) {
    for (let i = 0; i + 2 * n <= words.length; i++) {
      const a = N.slice(i, i + n).join(''), b = N.slice(i + n, i + 2 * n).join('');
      if (a && a === b && words[i + n].s - words[i + n - 1].e < 1.2) for (let k = i; k < i + n; k++) if (!words[k].kind) words[k].kind = 'repeat';
    }
  }
  for (const w of words) {
    if (w.manual) continue; // 使用者手動改過就不動
    const want = (w.kind === 'filler' && opts.cutFiller) || (w.kind === 'repeat' && opts.cutRepeat);
    if (want) { w.cut = true; w.auto = true; }
  }
  return words;
}

// 依停頓、標點、字數把字詞分成句子（字幕單位）
export function buildSentences(words, opts) {
  const out = []; let cur = null;
  const flush = () => { if (cur && cur.idx.length) out.push(cur); cur = null; };
  words.forEach((w, i) => {
    if (!cur) cur = { idx: [], text: null };
    const prev = cur.idx.length ? words[cur.idx[cur.idx.length - 1]] : null;
    const len = cur.idx.reduce((a, j) => a + (words[j].cut ? 0 : norm(words[j].t).length), 0); // 只算保留的字
    if (prev && (w.s - prev.e > .5 || (!w.cut && len + norm(w.t).length > opts.maxChars))) { flush(); cur = { idx: [], text: null }; }
    cur.idx.push(i);
    if (/[。！？!?.]$/.test(w.t)) flush();
  });
  flush();
  return out;
}

export function sentenceText(sent, words, keepCut = false) {
  if (sent.text != null) return sent.text;
  const parts = sent.idx.map(i => words[i]).filter(w => keepCut || !w.cut).map(w => w.t.replace(/[，。,.]$/, ''));
  let t = ''; for (const p of parts) t += (/[a-zA-Z0-9]$/.test(t) && /^[a-zA-Z0-9]/.test(p) ? ' ' : '') + p;
  return t.trim();
}
export function sentenceRange(sent, words, onlyKept = true) {
  const ws = sent.idx.map(i => words[i]).filter(w => !onlyKept || !w.cut);
  if (!ws.length) return null;
  return { s: Math.min(...ws.map(w => w.s)), e: Math.max(...ws.map(w => w.e)) };
}

// 全部要剪掉的區段（來源影片時間），合併重疊
export function computeCuts(tr, opts, duration) {
  const raw = [];
  if (tr) {
    for (const s of tr.silences || []) if (s.cut) raw.push([s.s + opts.pad, s.e - opts.pad]);
    for (const w of tr.words || []) if (w.cut) raw.push([w.s, w.e]);
    for (const c of tr.manualCuts || []) raw.push([c.s, c.e]);
  }
  const list = raw.filter(([a, b]) => b - a > .04).map(([a, b]) => [Math.max(0, a), Math.min(duration, b)]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of list) { const last = out[out.length - 1]; if (last && r[0] <= last[1] + .12) last[1] = Math.max(last[1], r[1]); else out.push([...r]); }
  return out;
}
export const cutTotal = cuts => cuts.reduce((a, [s, e]) => a + e - s, 0);
export function cutAt(cuts, t) { for (const c of cuts) { if (t >= c[0] && t < c[1]) return c; if (c[0] > t) break; } return null; }

// SRT / VTT 匯入
export function parseSRT(text) {
  const toS = x => { const m = x.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/); return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0; };
  const out = [];
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
    const ls = block.split('\n').filter(Boolean); const ti = ls.findIndex(l => l.includes('-->')); if (ti < 0) continue;
    const [a, b] = ls[ti].split('-->'); const t = ls.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (t) out.push({ text: t, s: toS(a), e: toS(b) });
  }
  return out;
}
export function toSRT(sents, words) {
  const f = t => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).replace('.', ',').padStart(6, '0')}`; };
  let n = 0; return sents.map(st => { const r = sentenceRange(st, words); const t = sentenceText(st, words); if (!r || !t) return ''; n++; return `${n}\n${f(r.s)} --> ${f(r.e)}\n${t}\n`; }).filter(Boolean).join('\n');
}

// 簡體轉繁體（台灣用語）
let _cc = null;
export async function toTraditional(text) {
  if (!_cc) { const m = await import('./vendor/opencc-cn2t.js'); _cc = m.Converter({ from: 'cn', to: 'twp' }); }
  return _cc(text);
}

// 語音辨識（在 Web Worker 裡跑 Whisper）
export function transcribe(samples, opts, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./transcribe-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress?.(data);
      else if (data.type === 'done') { resolve(data); w.terminate(); }
      else if (data.type === 'error') { reject(new Error(data.message)); w.terminate(); }
    };
    w.onerror = e => { reject(new Error('無法載入語音辨識程式（network/load）：' + (e.message || 'worker'))); w.terminate(); };
    const copy = new Float32Array(samples);
    w.postMessage({ samples: copy, model: MODELS[opts.model]?.id || MODELS.base.id, language: opts.language }, [copy.buffer]);
    transcribe.cancel = () => { w.terminate(); reject(new Error('已取消')); };
  });
}
