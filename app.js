import { EFFECTS, CATS, FONTS, font, defaultParams, needsMask } from './effects.js';
import { PersonSegmenter } from './segmenter.js';
import { Grader, GRADES } from './grader.js';
import { PRO_EFFECTS } from './effects-pro.js';
import { STYLE_EFFECTS } from './effects-styles.js';
import * as SP from './speech.js';
Object.assign(EFFECTS, PRO_EFFECTS, STYLE_EFFECTS);

let W = 1080, H = 1920; // 輸出解析度（可在設定切 720p）
const $ = s => document.querySelector(s);
const view = $('#view'), ctx = view.getContext('2d');
const video = $('#video');

const frame = mk(W, H), personCv = mk(W, H);
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

const DEFAULT_SETTINGS = { speech: { ...SP.DEFAULT_SPEECH }, grade: 'warmCinema', gradeAmt: .7, letterbox: 'off', brand: '#F5A623', segQuality: 'fast', edge: 0, soft: .2, smooth: .45, res: 1080, safe: 'off' };
const settings = { ...DEFAULT_SETTINGS };
const KEY = 'clipfx.project.v1';
try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && raw.settings) Object.assign(settings, raw.settings); } catch {}
settings.speech = { ...SP.DEFAULT_SPEECH, ...(settings.speech || {}) };
let grader = null;
// 展示素材（B-roll）：另一段只用畫面的影片，給卡片牆、頻道景深、開箱價格用
const broll = { video: null, thumbs: [], name: '' };

function setResolution(w) { // w = 寬度：1080 → 1080×1920、720 → 720×1280
  W = w; H = Math.round(w * 16 / 9);
  for (const c of [view, frame, personCv]) { c.width = W; c.height = H; }
  grader?.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  grader = new Grader(W, H);
  state.segDirty = true;
}
const state = {
  file: null, videoKey: '', tr: null, cuts: [], env: null, samples: null, busy: false,
  effects: [], selected: null, duration: 0, thumbs: [], loaded: false,
  exporting: false, segTime: -1, segDirty: true, muted: false,
};
const images = new Map(); // 圖片參數不存 localStorage，只放記憶體
const seg = new PersonSegmenter();
let uid = Date.now();
setResolution(settings.res);
document.querySelector('#safeZone').hidden = settings.safe !== 'on';

// ───────────── 載入影片 ─────────────
for (const inp of [$('#fileInput'), $('#fileInput2')]) inp.addEventListener('change', e => {
  const f = e.target.files[0]; if (f) loadVideo(f); e.target.value = '';
});

async function loadVideo(file) {
  const url = URL.createObjectURL(file);
  state.file = file; state.videoKey = `${file.name}|${file.size}`; state.tr = null; state.cuts = []; state.env = null; state.samples = null;
  if (video.src) URL.revokeObjectURL(video.src);
  video.src = url; video.muted = false;
  showStatus('讀取影片中…');
  await once(video, 'loadedmetadata');
  if (video.readyState < 2) await once(video, 'loadeddata');
  state.duration = video.duration || 0;
  state.loaded = true;
  $('#empty').hidden = true; $('#controls').hidden = false; $('#replaceBtn').hidden = false; $('#exportBtn').disabled = false;
  video.currentTime = 0.001;
  restore();
  hideStatus();
  makeThumbs(url);
  renderTimeline();
}

// 從影片平均擷取 n 張截圖
async function grabFrames(url, n) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  const out = [];
  try {
    await once(v, 'loadeddata', 8000);
    for (let i = 0; i < n; i++) {
      v.currentTime = Math.min(v.duration - .05, (i + .5) / n * v.duration);
      await once(v, 'seeked', 4000);
      const c = mk(270, 480); coverDraw(c.getContext('2d'), v, 270, 480); out.push(c);
    }
  } catch (e) { console.warn('frames', e); }
  v.removeAttribute('src'); v.load();
  return out;
}

// 擷取 9 張影片截圖（給影片牆、破框而出、頭像用）
async function makeThumbs(url) {
  try {
    state.thumbs = await grabFrames(url, 9);
    $('#lanes .film')?.remove(); renderTimeline();
  } catch (e) { console.warn('thumbs', e); }
}

async function loadBroll(file) {
  const url = URL.createObjectURL(file);
  if (broll.video) { broll.video.pause(); URL.revokeObjectURL(broll.video.src); }
  const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  broll.video = v; broll.name = file.name; broll.thumbs = [];
  showStatus('讀取展示素材中…');
  broll.thumbs = await grabFrames(url, 12);
  hideStatus(); state.segDirty = true;
  if (!video.paused) v.play().catch(() => {});
}
function syncBroll(t) {
  const v = broll.video; if (!v || v.readyState < 2 || !v.duration) return;
  const target = t % v.duration;
  if (video.paused) { if (!v.paused) v.pause(); if (Math.abs(v.currentTime - target) > .05) v.currentTime = target; }
  else { if (v.paused) v.play().catch(() => {}); if (Math.abs(v.currentTime - target) > .4) v.currentTime = target; }
}

function coverDraw(c, src, w, h) {
  const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
  if (!sw) return;
  const s = Math.max(w / sw, h / sh), dw = sw * s, dh = sh * s;
  c.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

// ───────────── 渲染 ─────────────
function render() {
  const t = video.currentTime;
  const fc = frame.getContext('2d');
  syncBroll(t);
  if (audio?.analyser && !video.paused) audio.analyser.getByteFrequencyData(audio.bands);
  if (state.loaded && video.readyState >= 2) {
    fc.fillStyle = '#000'; fc.fillRect(0, 0, W, H); coverDraw(fc, video, W, H);
    const g = grader.apply(frame, settings.grade, settings.gradeAmt, t);
    if (g) fc.drawImage(g, 0, 0);
  }
  const active = state.effects.filter(fx => t >= fx.start && t < fx.start + fx.dur);
  const wantMask = active.some(needsMask);
  if (wantMask) {
    if (seg.state === 'idle') seg.load(onSegState);
    if (seg.state === 'ready' && (!video.paused || state.segDirty || t !== state.segTime)) {
      seg.run(frame, W, H, video.paused); state.segTime = t; state.segDirty = false;
    }
  }
  let personDone = false;
  const env = {
    ctx, W, H, frame, brand: settings.brand, bbox: seg.state === 'ready' ? seg.bbox : null,
    person() {
      if (!wantMask || seg.state !== 'ready') return null;
      if (!personDone) { seg.cutout(frame, personCv); personDone = true; }
      return personCv;
    },
    thumb: i => state.thumbs.length ? state.thumbs[i % state.thumbs.length] : frame,
    broll: i => broll.thumbs.length ? broll.thumbs[i % broll.thumbs.length] : state.thumbs.length ? state.thumbs[i % state.thumbs.length] : frame,
    hasBroll: !!broll.thumbs.length,
    brollLive: broll.video && broll.video.readyState >= 2 ? broll.video : null,
    time: t, total: state.duration,
    audioBands: () => audio?.bands || null,
  };
  ctx.globalAlpha = 1; ctx.drawImage(frame, 0, 0);
  usedMedia.clear();
  const ordered = active.map((fx, i) => ({ fx, i })).sort((a, b) =>
    (EFFECTS[b.fx.type].base ? 1 : 0) - (EFFECTS[a.fx.type].base ? 1 : 0) || a.i - b.i);
  for (const { fx } of ordered) {
    const def = EFFECTS[fx.type]; const lt = t - fx.start;
    const P = { ...fx.params };
    for (const [k, d] of Object.entries(def.params)) if (d.type === 'image' || d.type === 'images' || d.type === 'media') {
      P[k] = images.get(fx.id + k) || null;
      if (d.type === 'media' && P[k]?.tagName === 'VIDEO') { syncMedia(P[k], lt); usedMedia.add(P[k]); }
    }
    ctx.save();
    try {
      def.draw({ ...env, P, lt, dur: fx.dur, p: lt / fx.dur, inK: Math.min(1, lt / .35), outK: Math.max(0, Math.min(1, (fx.dur - lt) / .3)) });
    } catch (e) { console.error(fx.type, e); }
    ctx.restore();
  }
  for (const m of allMedia()) if (!usedMedia.has(m) && !m.paused) m.pause();
  if (settings.letterbox === 'on') { ctx.fillStyle = '#000'; const b = H * .07; ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b); }
}

// 特效裡上傳的影片：跟著主影片同步播放
const usedMedia = new Set();
function allMedia() { const out = []; for (const v of images.values()) if (v?.tagName === 'VIDEO') out.push(v); return out; }
function syncMedia(v, lt) {
  if (v.readyState < 1 || !v.duration) return;
  const target = lt % v.duration;
  if (video.paused) { if (!v.paused) v.pause(); if (Math.abs(v.currentTime - target) > .05) v.currentTime = target; }
  else { if (v.paused) v.play().catch(() => {}); if (Math.abs(v.currentTime - target) > .35) v.currentTime = target; }
}

function onSegState(s, q) {
  if (s === 'loading') showStatus(q === 'hq' ? 'AI 高品質去背模型載入中（約 16MB）…' : 'AI 去背模型載入中…');
  else if (s === 'ready') { hideStatus(); state.segDirty = true; }
  else showStatus('AI 去背載入失敗（請檢查網路）', 4000);
}

function loop() {
  if (state.loaded && !video.paused && !state.exporting && state.cuts.length) {
    const c = SP.cutAt(state.cuts, video.currentTime);
    if (c) { if (c[1] >= state.duration - .05) video.pause(); else video.currentTime = c[1] + .001; }
  }
  render();
  if (state.loaded) updateTime();
  requestAnimationFrame(loop);
}
document.fonts.ready.then(() => requestAnimationFrame(loop));

// ───────────── 播放控制 ─────────────
let audio = null;
function ensureAudio() {
  if (audio) { audio.ctx.resume(); return audio; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const actx = new AC(), src = actx.createMediaElementSource(video), gain = actx.createGain(), dest = actx.createMediaStreamDestination();
    const analyser = actx.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = .6;
    src.connect(gain); gain.connect(actx.destination); src.connect(dest); src.connect(analyser);
    audio = { ctx: actx, gain, dest, analyser, bands: new Uint8Array(analyser.frequencyBinCount) };
    gain.gain.value = state.muted ? 0 : 1;
  } catch (e) { console.warn('audio', e); }
  return audio;
}
$('#playBtn').onclick = () => togglePlay();
function togglePlay(force) {
  if (!state.loaded) return;
  const play = force ?? video.paused;
  if (play) { ensureAudio(); if (video.ended || video.currentTime >= state.duration - .05) video.currentTime = 0; video.play(); }
  else video.pause();
}
video.addEventListener('play', () => $('#playBtn').textContent = '❚❚');
video.addEventListener('pause', () => $('#playBtn').textContent = '▶');
video.addEventListener('seeked', () => state.segDirty = true);
$('#muteBtn').onclick = () => {
  state.muted = !state.muted; $('#muteBtn').textContent = state.muted ? '🔇' : '🔊';
  const a = ensureAudio(); if (a) a.gain.gain.value = state.muted ? 0 : 1; else video.muted = state.muted;
};
$('#canvasWrap').addEventListener('click', e => { if (state.loaded && !e.target.closest('label')) togglePlay(); });

const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
let lastLabel = '';
function updateTime() {
  const t = video.currentTime, cutT = SP.cutTotal(state.cuts);
  const label = `${fmt(t)} / ${fmt(state.duration)}` + (cutT ? `　✂ 成片 ${fmt(state.duration - cutT)}` : '');
  if (label !== lastLabel) { $('#timeLabel').textContent = label; lastLabel = label; }
  const x = PAD + t * pps();
  $('#playhead').style.transform = `translateX(${x}px)`;
  if (!video.paused) {
    const tl = $('#timeline');
    if (x > tl.scrollLeft + tl.clientWidth * .8 || x < tl.scrollLeft) tl.scrollLeft = x - tl.clientWidth * .3;
  }
}

// ───────────── 時間軸 ─────────────
const PAD = 12, LANE_TOP = 30, LANE_H = 30;
const pps = () => Math.max(($('#timeline').clientWidth - PAD * 2) / Math.max(state.duration, .1), 36);

function lanesOf() {
  const ends = [], map = new Map();
  [...state.effects].sort((a, b) => a.start - b.start).forEach(fx => {
    let l = ends.findIndex(e => e <= fx.start + .01); if (l < 0) { l = ends.length; ends.push(0); }
    ends[l] = fx.start + fx.dur; map.set(fx.id, l);
  });
  return { map, count: Math.max(1, ends.length) };
}

function renderTimeline() {
  const D = state.duration, p = pps();
  const track = $('#track'), lanes = $('#lanes'), ruler = $('#ruler');
  track.style.width = `${D * p + PAD * 2}px`;
  const step = p > 80 ? 1 : p > 40 ? 2 : 5;
  let r = '';
  for (let s = 0; s <= D; s += step) r += `<span style="left:${PAD + s * p}px">${s}s</span><i style="left:${PAD + s * p}px"></i>`;
  ruler.innerHTML = r;
  const { map, count } = lanesOf();
  $('#timeline').style.height = `${Math.max(118, 20 + LANE_TOP + count * LANE_H + 8)}px`;
  lanes.innerHTML = '';
  track.querySelectorAll('.cutzone').forEach(x => x.remove());
  for (const [a, b] of state.cuts) {
    const z = document.createElement('div'); z.className = 'cutzone';
    z.style.cssText = `left:${PAD + a * p}px;width:${Math.max(2, (b - a) * p)}px`; track.appendChild(z);
  }
  if (state.thumbs.length) {
    const film = document.createElement('div'); film.className = 'film';
    film.style.cssText = `left:${PAD}px;width:${D * p}px;right:auto;height:20px;display:flex;overflow:hidden`;
    state.thumbs.forEach(c => { const im = document.createElement('img'); im.src = c.toDataURL('image/jpeg', .5); im.style.cssText = 'height:100%;flex:1;object-fit:cover;min-width:0'; film.appendChild(im); });
    lanes.appendChild(film);
  }
  for (const fx of state.effects) {
    const def = EFFECTS[fx.type], b = document.createElement('div');
    b.className = 'block' + (fx.id === state.selected ? ' sel' : '');
    b.style.cssText = `left:${PAD + fx.start * p}px;width:${Math.max(24, fx.dur * p)}px;top:${LANE_TOP + map.get(fx.id) * LANE_H}px;background:${def.color}`;
    b.innerHTML = `${def.icon} ${def.name}${fx.dur * p >= 56 ? '<div class="grip"></div>' : ''}`;
    b.dataset.id = fx.id;
    attachDrag(b, fx);
    lanes.appendChild(b);
  }
}

function attachDrag(el, fx) {
  el.addEventListener('pointerdown', e => {
    e.stopPropagation();
    const resize = e.target.classList.contains('grip');
    const x0 = e.clientX, s0 = fx.start, d0 = fx.dur, p = pps(); let moved = false;
    el.setPointerCapture(e.pointerId);
    const move = ev => {
      const dx = ev.clientX - x0; if (Math.abs(dx) > 6) moved = true; if (!moved) return;
      if (resize) fx.dur = clamp(d0 + dx / p, .3, state.duration - fx.start);
      else fx.start = clamp(s0 + dx / p, 0, Math.max(0, state.duration - fx.dur));
      el.style.left = `${PAD + fx.start * p}px`; el.style.width = `${Math.max(24, fx.dur * p)}px`;
      video.pause(); video.currentTime = resize ? Math.max(fx.start, fx.start + fx.dur - .05) : fx.start + Math.min(.6, fx.dur / 2);
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      if (moved) { save(); renderTimeline(); if (state.selected === fx.id) renderEdit(); }
      else selectFx(fx.id, true);
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
}

$('#track').addEventListener('click', e => {
  if (e.target.closest('.block') || !state.loaded) return;
  const rect = $('#track').getBoundingClientRect();
  video.pause(); video.currentTime = clamp((e.clientX - rect.left - PAD) / pps(), 0, state.duration - .01);
});
window.addEventListener('resize', () => state.loaded && renderTimeline());

// ───────────── 新增特效 ─────────────
const grid = $('#effectGrid');
grid.innerHTML = `<button class="btn add" id="tplBtn" style="margin:4px 0 6px">✨ 一鍵套用爆款範本</button>` + CATS.map(cat => `
  <div class="cat">${cat}</div><div class="grid">
  ${Object.entries(EFFECTS).filter(([, d]) => d.cat === cat).map(([k, d]) => `
    <button class="fx-card" data-type="${k}"><div class="ic" style="background:${d.color}">${d.icon}</div><b>${d.name}</b>${d.ai ? '<span class="ai">AI 去背</span>' : ''}</button>`).join('')}
  </div>`).join('');
grid.addEventListener('click', e => {
  const c = e.target.closest('.fx-card'); if (c) { addFx(c.dataset.type); return; }
  if (e.target.id === 'tplBtn') applyTemplate();
});
$('#addBtn').onclick = () => { video.pause(); openSheet('add'); };

function addFx(type, start = video.currentTime, dur) {
  const def = EFFECTS[type];
  const D = state.duration;
  dur = Math.min(dur ?? def.dur, D);
  start = clamp(start, 0, Math.max(0, D - dur));
  const fx = { id: 'fx' + (uid++), type, start, dur, params: defaultParams(type) };
  state.effects.push(fx); save(); renderTimeline();
  closeSheets();
  selectFx(fx.id, true);
  video.currentTime = start + Math.min(.8, dur * .5);
  loadFonts(fx);
  return fx;
}

function applyTemplate() {
  const D = state.duration;
  const plan = [['orbitCards', 0, .26], ['subtitle', .26, .1], ['depthUI', .36, .2], ['subtitle', .56, .1], ['explainerPanel', .66, .16], ['stickyNote', .82, .18]];
  state.effects = [];
  plan.forEach(([type, s, d]) => addFx(type, s * D, Math.max(.8, d * D)));
  const caps = state.effects.filter(f => f.type === 'subtitle');
  if (caps[1]) Object.assign(caps[1].params, { zh: '馬上 *試試看* 👇', en: 'Try it *now*' });
  closeSheets(); state.selected = null; save(); renderTimeline();
  video.currentTime = .5; togglePlay(true);
}

// ───────────── 編輯特效 ─────────────
function selectFx(id, open) {
  state.selected = id; renderTimeline();
  if (open && id) { renderEdit(); openSheet('edit'); }
}

function renderEdit() {
  const fx = state.effects.find(f => f.id === state.selected); if (!fx) return;
  const def = EFFECTS[fx.type];
  $('#editTitle').textContent = `${def.icon} ${def.name}`;
  const body = $('#editBody'); body.innerHTML = '';
  for (const [k, d] of Object.entries(def.params)) body.appendChild(fieldFor(fx, k, d));
  // 時間
  const tm = document.createElement('div'); tm.className = 'field';
  tm.innerHTML = `<label>時間</label>
    <div class="timing"><button class="icon-btn small" data-a="s-">−</button><span>開始 ${fx.start.toFixed(1)}s</span><button class="icon-btn small" data-a="s+">＋</button>
    <button class="btn ghost" data-a="here">移到播放頭</button></div>
    <div class="field"><label>長度 <b>${fx.dur.toFixed(1)}s</b></label><input type="range" min=".3" max="${Math.max(.4, state.duration - fx.start).toFixed(2)}" step=".1" value="${fx.dur}" data-a="dur"></div>`;
  tm.addEventListener('click', e => {
    const a = e.target.dataset.a; if (!a) return;
    if (a === 's-') fx.start = Math.max(0, fx.start - .1);
    if (a === 's+') fx.start = Math.min(state.duration - fx.dur, fx.start + .1);
    if (a === 'here') fx.start = clamp(video.currentTime, 0, Math.max(0, state.duration - fx.dur));
    video.currentTime = fx.start + .05; save(); renderTimeline(); renderEdit();
  });
  tm.querySelector('[data-a=dur]').addEventListener('input', e => {
    fx.dur = parseFloat(e.target.value); tm.querySelector('b').textContent = fx.dur.toFixed(1) + 's'; save(); renderTimeline();
  });
  body.appendChild(tm);
  const acts = document.createElement('div'); acts.className = 'row-actions';
  acts.innerHTML = `<button class="btn ghost" data-a="play">▶ 預覽</button><button class="btn ghost" data-a="dup">複製</button><button class="btn danger" data-a="del">刪除</button>`;
  acts.addEventListener('click', e => {
    const a = e.target.dataset.a;
    if (a === 'play') { video.currentTime = fx.start; togglePlay(true); }
    if (a === 'dup') { const n = addFx(fx.type, fx.start + fx.dur, fx.dur); n.params = structuredClone(fx.params); save(); }
    if (a === 'del') { state.effects = state.effects.filter(f => f !== fx); state.selected = null; save(); renderTimeline(); closeSheets(); }
  });
  body.appendChild(acts);
}

function fieldFor(fx, k, d) {
  const wrap = document.createElement('div'); wrap.className = 'field';
  const set = v => { fx.params[k] = v; state.segDirty = true; save(); loadFonts(fx); };
  const v = fx.params[k];
  if (d.type === 'text' || d.type === 'textarea') {
    wrap.innerHTML = `<label>${d.label}</label>` + (d.type === 'text' ? `<input type="text">` : `<textarea></textarea>`);
    const inp = wrap.querySelector('input,textarea'); inp.value = v; inp.addEventListener('input', () => set(inp.value));
  } else if (d.type === 'select') {
    wrap.innerHTML = `<label>${d.label}</label><div class="seg">${d.options.map(([val, l]) => `<button data-v="${val}" class="${val === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    wrap.querySelector('.seg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      wrap.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); set(b.dataset.v);
    });
  } else if (d.type === 'range') {
    wrap.innerHTML = `<label>${d.label}</label><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}">`;
    wrap.querySelector('input').addEventListener('input', e => set(parseFloat(e.target.value)));
  } else if (d.type === 'color') {
    wrap.innerHTML = `<label>${d.label}</label><div class="swatches">${(d.swatches || []).map(c => `<button style="background:${c}" data-c="${c}" class="${c.toLowerCase() === String(v).toLowerCase() ? 'on' : ''}"></button>`).join('')}<input type="color" value="${v}"></div>`;
    const pick = c => { wrap.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x.dataset.c.toLowerCase() === c.toLowerCase())); set(c); };
    wrap.querySelector('.swatches').addEventListener('click', e => { const c = e.target.dataset.c; if (c) { pick(c); wrap.querySelector('input').value = c; } });
    wrap.querySelector('input').addEventListener('input', e => pick(e.target.value));
  } else if (d.type === 'media') {
    // 圖片或影片
    const show = () => {
      const cur = images.get(fx.id + k), isV = cur?.tagName === 'VIDEO';
      wrap.innerHTML = `<label>${d.label}</label><div class="img-pick">
        ${cur ? (isV ? `<video src="${cur.src}" muted playsinline style="width:44px;height:44px;border-radius:10px;object-fit:cover"></video>` : `<img src="${cur.src}" style="border-radius:10px">`) : '<img alt="" style="border-radius:10px">'}
        <label class="btn ghost">${cur ? '更換' : '選擇圖片／影片'}<input type="file" accept="image/*,video/*" hidden></label>
        ${cur ? '<button class="btn ghost" data-clear>清除</button>' : ''}</div>`;
      wrap.querySelector('input').addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        const url = URL.createObjectURL(f), old = images.get(fx.id + k);
        if (old?.tagName === 'VIDEO') { old.pause(); usedMedia.delete(old); }
        if (f.type.startsWith('video/')) {
          const vEl = document.createElement('video'); vEl.muted = true; vEl.loop = true; vEl.playsInline = true; vEl.preload = 'auto'; vEl.src = url;
          vEl.addEventListener('loadeddata', () => { state.segDirty = true; }, { once: true });
          images.set(fx.id + k, vEl); show();
        } else {
          const im = new Image(); im.onload = () => { images.set(fx.id + k, im); show(); }; im.src = url;
        }
      });
      const c = wrap.querySelector('[data-clear]');
      if (c) c.onclick = () => { const o = images.get(fx.id + k); if (o?.tagName === 'VIDEO') o.pause(); images.delete(fx.id + k); show(); };
    };
    show();
  } else if (d.type === 'image') {
    const cur = images.get(fx.id + k);
    wrap.innerHTML = `<label>${d.label}</label><div class="img-pick"><img alt=""><label class="btn ghost">選擇圖片<input type="file" accept="image/*" hidden></label><button class="btn ghost" data-clear>清除</button></div>`;
    const img = wrap.querySelector('img'); if (cur) img.src = cur.src;
    wrap.querySelector('input').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const im = new Image(); im.onload = () => {
        images.set(fx.id + k, im); img.src = im.src;
        if (d.autoSet) { Object.assign(fx.params, d.autoSet); save(); renderEdit(); }
      }; im.src = URL.createObjectURL(f);
    });
    wrap.querySelector('[data-clear]').onclick = () => { images.delete(fx.id + k); img.removeAttribute('src'); };
  }
  else if (d.type === 'images') {
    const draw = () => {
      const list = images.get(fx.id + k) || [];
      wrap.innerHTML = `<label>${d.label}</label><div class="img-list">${list.map((im, i) => `<div class="thumb"><img src="${im.src}"><button data-i="${i}">✕</button></div>`).join('')}
        <label class="thumb add">＋<input type="file" accept="image/*" multiple hidden></label></div>`;
      wrap.querySelector('input').addEventListener('change', async e => {
        const files = [...e.target.files];
        const loaded = await Promise.all(files.map(f => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = URL.createObjectURL(f); })));
        images.set(fx.id + k, [...(images.get(fx.id + k) || []), ...loaded.filter(Boolean)]); draw();
      });
      wrap.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
        const l = [...(images.get(fx.id + k) || [])]; l.splice(+b.dataset.i, 1);
        l.length ? images.set(fx.id + k, l) : images.delete(fx.id + k); draw();
      });
    };
    draw();
  }
  return wrap;
}

// 中文字型是按需下載的，先觸發載入，canvas 才畫得出正確字型
function loadFonts(fx) {
  const txt = Object.values(fx.params).filter(v => typeof v === 'string').join(' ') + 'ABCabc123';
  for (const k of Object.keys(FONTS)) document.fonts.load(font(k, 40), txt).catch(() => {});
}

// ───────────── 調色與設定 ─────────────
$('#setBtn').onclick = () => { video.pause(); renderSettings(); openSheet('settings'); };

function applySegSettings() {
  seg.opts.edge = settings.edge; seg.opts.soft = settings.soft; seg.opts.smooth = settings.smooth;
  seg.setQuality(settings.segQuality, onSegState);
  state.segDirty = true;
}

function renderSettings() {
  const b = $('#settingsBody');
  b.innerHTML = `
    <div class="section-title">影片調色</div>
    <div class="grade-grid">${Object.entries(GRADES).map(([k, g]) => `<button data-g="${k}" class="${k === settings.grade ? 'on' : ''}"><canvas width="120" height="120"></canvas><span>${g.name}</span></button>`).join('')}</div>
    <div class="field"><label>調色強度 <b id="gaL">${Math.round(settings.gradeAmt * 100)}%</b></label><input type="range" min="0" max="1" step=".05" value="${settings.gradeAmt}" id="ga"></div>
    <div class="field"><label>電影黑邊</label><div class="seg" id="lb"><button data-v="off" class="${settings.letterbox === 'off' ? 'on' : ''}">關</button><button data-v="on" class="${settings.letterbox === 'on' ? 'on' : ''}">開</button></div></div>

    <div class="section-title">品牌色</div>
    <p class="note">雙語字幕裡用 *星號* 包住的字、或「英文整條品牌色」會用這個顏色。</p>
    <div class="field"><div class="swatches" id="brand">${['#F5A623', '#FF5C8A', '#7C5CFF', '#2ECC71', '#E8322F', '#1E90FF', '#F5E27A'].map(c => `<button style="background:${c}" data-c="${c}" class="${c.toLowerCase() === settings.brand.toLowerCase() ? 'on' : ''}"></button>`).join('')}<input type="color" value="${settings.brand}"></div></div>

    <div class="section-title">展示素材（B-roll）</div>
    <p class="note">另外拍一段只用畫面的影片（商品、操作畫面、生活片段）。環繞卡片牆、頻道景深、開箱價格、分屏對比會優先用它，不會跟口播畫面一模一樣。</p>
    <div class="field"><div class="img-pick"><label class="btn ghost">${broll.name ? '更換展示素材' : '＋ 加入展示素材影片'}<input type="file" accept="video/*" id="brollInput" hidden></label><span class="note" id="brollName">${broll.name || '尚未加入'}</span></div></div>

    <div class="section-title">輸出與版面</div>
    <div class="field"><label>輸出解析度</label><div class="seg" id="resSeg">
      <button data-v="1080" class="${settings.res === 1080 ? 'on' : ''}">1080×1920（建議）</button>
      <button data-v="720" class="${settings.res === 720 ? 'on' : ''}">720×1280（舊手機較順）</button></div></div>
    <div class="field"><label>顯示平台安全區（不會輸出）</label><div class="seg" id="safeSeg">
      <button data-v="off" class="${settings.safe === 'off' ? 'on' : ''}">關</button><button data-v="on" class="${settings.safe === 'on' ? 'on' : ''}">開</button></div></div>
    <p class="note">重要文字放在上方 240px 以下、底部 420px 以上，避開 IG / TikTok 的按鈕。</p>

    <div class="section-title">AI 去背精準度</div>
    <div class="field"><label>模型</label><div class="seg" id="sq">
      <button data-v="fast" class="${settings.segQuality === 'fast' ? 'on' : ''}">快速</button>
      <button data-v="hq" class="${settings.segQuality === 'hq' ? 'on' : ''}">高品質（頭髮更準，16MB）</button></div></div>
    <div class="field"><label>邊緣 <b id="edL"></b></label><input type="range" min="-.3" max=".3" step=".02" value="${settings.edge}" id="ed"></div>
    <div class="field"><label>柔邊 <b id="sfL"></b></label><input type="range" min=".04" max=".5" step=".02" value="${settings.soft}" id="sf"></div>
    <div class="field"><label>防閃爍 <b id="smL"></b></label><input type="range" min="0" max=".85" step=".05" value="${settings.smooth}" id="sm"></div>
    <p class="note">邊緣往右收緊（少吃背景）、往左放寬（不切到頭髮手臂）。<br>拍攝時：光線充足、背景和衣服顏色差異大、不要背光，去背會準很多。</p>
    <div class="row-actions"><button class="btn ghost" id="segReset">恢復預設</button></div>`;
  // 色調縮圖
  b.querySelectorAll('.grade-grid button').forEach(btn => {
    const c = btn.querySelector('canvas'), cx = c.getContext('2d');
    const src = state.thumbs[0] || frame; coverDraw(cx, src, 120, 120);
    const tmp = mk(120, 120); tmp.getContext('2d').drawImage(c, 0, 0);
    const mini = new Grader(120, 120); const g = mini.apply(tmp, btn.dataset.g, 1, 1);
    if (g) cx.drawImage(g, 0, 0);
    mini.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  const lbl = () => {
    $('#edL').textContent = settings.edge > 0 ? `收緊 ${Math.round(settings.edge * 100)}` : settings.edge < 0 ? `放寬 ${Math.round(-settings.edge * 100)}` : '標準';
    $('#sfL').textContent = Math.round(settings.soft * 100); $('#smL').textContent = Math.round(settings.smooth * 100) + '%';
  };
  lbl();
  const commit = () => { applySegSettings(); save(); lbl(); };
  b.querySelector('.grade-grid').onclick = e => { const btn = e.target.closest('button'); if (!btn) return; settings.grade = btn.dataset.g; b.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', x === btn)); save(); };
  $('#ga').oninput = e => { settings.gradeAmt = +e.target.value; $('#gaL').textContent = Math.round(settings.gradeAmt * 100) + '%'; save(); };
  $('#lb').onclick = e => { const v = e.target.dataset.v; if (!v) return; settings.letterbox = v; $('#lb').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === v)); save(); };
  const setBrand = c => { settings.brand = c; $('#brand').querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x.dataset.c.toLowerCase() === c.toLowerCase())); save(); };
  $('#brand').onclick = e => { if (e.target.dataset.c) { setBrand(e.target.dataset.c); $('#brand input').value = e.target.dataset.c; } };
  $('#brand input').oninput = e => setBrand(e.target.value);
  $('#sq').onclick = e => { const v = e.target.dataset.v; if (!v) return; settings.segQuality = v; $('#sq').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === v)); commit(); };
  $('#ed').oninput = e => { settings.edge = +e.target.value; commit(); };
  $('#sf').oninput = e => { settings.soft = +e.target.value; commit(); };
  $('#sm').oninput = e => { settings.smooth = +e.target.value; commit(); };
  $('#brollInput').onchange = async e => { const f = e.target.files[0]; if (!f) return; $('#brollName').textContent = '讀取中…'; await loadBroll(f); renderSettings(); };
  $('#resSeg').onclick = e => { const v = +e.target.dataset.v; if (!v) return; settings.res = v; setResolution(v); $('#resSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.v === v)); save(); };
  $('#safeSeg').onclick = e => { const v = e.target.dataset.v; if (!v) return; settings.safe = v; $('#safeZone').hidden = v !== 'on'; $('#safeSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === v)); save(); };
  $('#segReset').onclick = () => { Object.assign(settings, { segQuality: settings.segQuality, edge: 0, soft: .2, smooth: .45 }); commit(); renderSettings(); };
}

// ───────────── 批次字幕 ─────────────
$('#subBtn').onclick = () => { video.pause(); openSheet('batch'); };
$('#batchDur').oninput = e => $('#batchDurLabel').textContent = (+e.target.value).toFixed(1) + 's';
$('#batchGo').onclick = () => {
  const rows = $('#batchText').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!rows.length) return;
  const dur = +$('#batchDur').value;
  const last = [...state.effects].reverse().find(f => f.type === 'subtitle');
  let t = video.currentTime;
  for (const r of rows) {
    if (t >= state.duration - .1) break;
    const [zh, en = ''] = r.split(/\s*[\/｜|]\s*/);
    const d = Math.min(dur, state.duration - t);
    const params = { ...defaultParams('subtitle'), ...(last ? last.params : {}), zh, en };
    const fx = { id: 'fx' + (uid++), type: 'subtitle', start: t, dur: d, params };
    state.effects.push(fx); loadFonts(fx); t += d;
  }
  save(); renderTimeline(); closeSheets(); $('#batchText').value = '';
  showStatus(`已加入 ${rows.length} 句字幕`, 2000);
};

// ───────────── 語音剪輯：辨識、剪氣口、語氣詞、重複 ─────────────
const TR_SUB_STYLES = [['subtitle', '雙語字幕'], ['minimalWhite', '極簡白字'], ['karaoke', '卡拉OK'], ['handwrittenNote', '手寫筆記'], ['monoContrast', '黑白高反差']];
let trUI = { open: new Set(), subStyle: 'subtitle', progress: null };
$('#cutBtn').onclick = () => { video.pause(); renderTr(); openSheet('tr'); };

function recomputeCuts(doSave = true) {
  state.cuts = SP.computeCuts(state.tr, settings.speech, state.duration || 0);
  if (state.loaded) renderTimeline();
  if (doSave) save();
}

async function ensureSamples() {
  if (state.samples) return;
  setTrProgress('decode', 0, '讀取影片聲音中…');
  state.samples = await SP.decodeAudio16k(state.file);
  state.env = SP.envelope(state.samples);
}

// 依目前規則重新標記（手動改過的保留）
function applyRules() {
  const tr = state.tr, o = settings.speech; if (!tr) return;
  if (state.env) {
    const old = tr.silences || [];
    const { silences, threshold } = SP.detectSilences(state.env, o);
    for (const n of silences) {
      const m = old.find(x => x.manual && x.s < n.e && x.e > n.s);
      if (m) { n.cut = m.cut; n.manual = true; } else n.cut = o.cutSilence;
    }
    tr.silences = silences; tr.threshold = threshold;
  } else for (const sl of tr.silences || []) if (!sl.manual) sl.cut = o.cutSilence;
  if (tr.words?.length) {
    SP.markWords(tr.words, o);
    if (!tr.srt) {
      const overrides = new Map((tr.sents || []).filter(x => x.text != null).map(x => [x.idx[0], x.text]));
      tr.sents = SP.buildSentences(tr.words, o);
      for (const st of tr.sents) if (overrides.has(st.idx[0])) st.text = overrides.get(st.idx[0]);
    }
  }
  recomputeCuts();
}

function setTrProgress(stage, ratio, text) {
  trUI.progress = stage ? { stage, ratio, text } : null;
  const el = $('#trProg');
  if (el && trUI.progress) { el.hidden = false; el.querySelector('.bar div').style.width = `${Math.round((ratio || 0) * 100)}%`; el.querySelector('p').textContent = text; }
  else if (el) el.hidden = true;
}

async function runSilenceOnly() {
  if (state.busy) return; state.busy = true; renderTr();
  try {
    await ensureSamples();
    const keep = state.tr?.words?.length ? state.tr : null;
    state.tr = keep || { words: [], sents: [], silences: [], manualCuts: [], level: 'none' };
    applyRules();
    showStatus(`找到 ${state.tr.silences.length} 個氣口`, 2500);
  } catch (e) { console.error(e); alertTr('讀取聲音失敗：' + e.message); }
  state.busy = false; setTrProgress(null); renderTr();
}

async function runASR() {
  if (state.busy) return; state.busy = true; renderTr();
  const o = settings.speech;
  try {
    await ensureSamples();
    setTrProgress('download', 0, '下載語音辨識模型（第一次比較久，之後會快取）…');
    const res = await SP.transcribe(state.samples, o, p => {
      if (p.stage === 'download') setTrProgress('download', p.ratio, `下載模型 ${Math.round(p.ratio * 100)}%（${(p.loaded / 1e6).toFixed(0)} / ${(p.total / 1e6).toFixed(0)} MB）`);
      else if (p.stage === 'load') setTrProgress('load', .99, `載入模型中（${p.device === 'webgpu' ? 'GPU 加速' : 'CPU'}）…`);
      else if (p.stage === 'transcribe') setTrProgress('transcribe', .5, `辨識中…約需影片長度的 ${p.device === 'webgpu' ? '0.2' : '1'} 倍時間`);
    });
    let words = res.level === 'word' ? SP.wordsFromChunks(res.chunks, state.duration)
      : res.chunks.flatMap(c => SP.splitSegment(c.text || '', c.timestamp?.[0] ?? 0, c.timestamp?.[1] ?? (c.timestamp?.[0] ?? 0) + 2));
    if (o.traditional && words.length) {
      const conv = (await SP.toTraditional(words.map(w => w.t).join('\u0001'))).split('\u0001');
      words.forEach((w, i) => { if (conv[i] != null) w.t = conv[i]; });
    }
    state.tr = { words, sents: [], silences: state.tr?.silences || [], manualCuts: [], level: res.level };
    applyRules();
    showStatus(`辨識完成：${words.length} 個字詞`, 2500);
  } catch (e) {
    console.error(e);
    alertTr(/fetch|network|Failed|load|404|CORS|import/i.test(e.message)
      ? '語音辨識模型下載失敗。在 Claude 預覽頁裡沒辦法連到模型伺服器（Hugging Face），網站放到正式網址（例如 Netlify、GitHub Pages）就能用。現在可以先用「只剪氣口」或「匯入 SRT 字幕檔」。'
      : '辨識失敗：' + e.message);
  }
  state.busy = false; setTrProgress(null); renderTr();
}

async function importSRT(file) {
  const items = SP.parseSRT(await file.text());
  if (!items.length) { alertTr('這個檔案裡沒有找到字幕'); return; }
  const words = [], sents = [];
  for (const it of items) {
    const ws = SP.splitSegment(it.text, it.s, it.e), start = words.length;
    words.push(...ws); sents.push({ idx: ws.map((_, i) => start + i), text: it.text });
  }
  state.tr = { words, sents, silences: state.tr?.silences || [], manualCuts: [], level: 'srt', srt: true };
  try { await ensureSamples(); } catch {}
  applyRules(); setTrProgress(null); renderTr();
}

function alertTr(msg) { trUI.error = msg; renderTr(); }

function generateSubs() {
  const tr = state.tr; if (!tr?.sents?.length) return;
  const type = trUI.subStyle;
  const style = [...state.effects].reverse().find(f => f.type === type);
  state.effects = state.effects.filter(f => f.auto !== 'sub');
  const list = tr.sents.map(st => ({ r: SP.sentenceRange(st, tr.words), t: SP.sentenceText(st, tr.words) })).filter(x => x.r && x.t);
  list.forEach((x, i) => {
    const next = list[i + 1];
    const end = next ? Math.min(next.r.s, x.r.e + .25) : Math.min(state.duration, x.r.e + .3);
    const params = { ...defaultParams(type), ...(style ? style.params : {}) };
    if (type === 'subtitle') { params.zh = x.t; params.en = ''; } else params.text = x.t;
    const fx = { id: 'fx' + (uid++), type, start: x.r.s, dur: Math.max(.5, end - x.r.s), params, auto: 'sub' };
    state.effects.push(fx);
  });
  if (state.effects.length) loadFonts(state.effects[state.effects.length - 1]);
  save(); renderTimeline(); showStatus(`已產生 ${list.length} 句字幕`, 2500);
}

async function exportSRT() {
  const tr = state.tr; if (!tr?.sents?.length) return;
  const text = SP.toSRT(tr.sents, tr.words), name = (state.file?.name || 'areelup').replace(/\.[^.]+$/, '') + '.srt';
  const dl = window.claude?.use ? await Promise.race([window.claude.use('downloads'), new Promise(r => setTimeout(() => r(null), 3000))]).catch(() => null) : null;
  if (dl) { dl.save({ filename: name.replace(/\.srt$/, '.txt'), data: text }).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click();
}

const fmtT = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function renderTr() {
  const b = $('#trBody'); if (!b) return;
  const o = settings.speech, tr = state.tr, has = !!tr;
  const cutT = SP.cutTotal(state.cuts);
  const seg = (id, val, opts) => `<div class="seg" data-set="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(val) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  let h = '';
  if (trUI.error) h += `<div class="tr-summary" style="border:1px solid #803"><div class="grow" style="color:#ffb3b3">${trUI.error}</div><button class="mini btn ghost" data-act="dismiss">知道了</button></div>`;
  h += `<div class="tr-actions">
    <button class="btn primary" data-act="asr" ${state.busy ? 'disabled' : ''}>🎙️ ${tr?.words?.length && tr.level !== 'srt' ? '重新語音辨識' : '語音辨識＋自動剪輯'}</button>
    <div class="row-actions" style="margin:0">
      <button class="btn ghost" data-act="silence" ${state.busy ? 'disabled' : ''}>⏸ 只剪氣口</button>
      <label class="btn ghost">📄 匯入 SRT<input type="file" accept=".srt,.vtt,text/*" id="srtInput" hidden></label>
    </div></div>
    <div id="trProg" class="tr-progress" ${trUI.progress ? '' : 'hidden'}><div class="bar"><div style="width:${Math.round((trUI.progress?.ratio || 0) * 100)}%"></div></div><p>${trUI.progress?.text || ''}</p></div>`;
  h += `<details class="rules" ${has ? '' : 'open'}><summary>辨識設定</summary>
    <div class="field"><label>模型</label>${seg('model', o.model, Object.entries(SP.MODELS).map(([k, m]) => [k, m.label]))}</div>
    <div class="field"><label>語言</label>${seg('language', o.language, [['chinese', '中文'], ['english', '英文'], ['auto', '自動']])}</div>
    <div class="field"><label>簡體轉繁體</label>${seg('traditional', o.traditional, [[true, '開'], [false, '關']])}</div>
    <p class="note">影片聲音只在你的手機上辨識，不會上傳。模型第一次要下載，之後會記住。</p></details>`;
  if (has) {
    h += `<div class="tr-summary"><div><b>${state.cuts.length}</b> 處</div><div class="grow">已剪掉 ${cutT.toFixed(1)} 秒<br>成片 ${fmtT(state.duration - cutT)}（原本 ${fmtT(state.duration)}）</div>
      <button class="btn primary" data-act="preview">▶ 預覽</button></div>
      <details class="rules"><summary>自動剪輯規則（可微調）</summary>
      <div class="field"><label>剪掉氣口</label>${seg('cutSilence', o.cutSilence, [[true, '開'], [false, '關']])}</div>
      <div class="field"><label>氣口長度：超過 <b>${o.minGap.toFixed(2)}</b> 秒才剪</label><input type="range" min=".15" max="1.5" step=".05" value="${o.minGap}" data-range="minGap"></div>
      <div class="field"><label>安靜門檻 <b>${o.thresholdDb === 'auto' ? `自動（${(tr.threshold ?? -40).toFixed(0)} dB）` : o.thresholdDb + ' dB'}</b></label>
        ${seg('thrMode', o.thresholdDb === 'auto' ? 'auto' : 'manual', [['auto', '自動'], ['manual', '手動']])}
        ${o.thresholdDb === 'auto' ? '' : `<input type="range" min="-65" max="-15" step="1" value="${o.thresholdDb}" data-range="thresholdDb">`}
        <p class="note">背景比較吵、剪不到氣口 → 門檻往右調；剪太多、切到小聲的字 → 往左調。</p></div>
      <div class="field"><label>剪接處前後保留 <b>${Math.round(o.pad * 1000)}</b> 毫秒（越大越自然）</label><input type="range" min="0" max=".3" step=".01" value="${o.pad}" data-range="pad"></div>
      ${tr.words?.length ? `
      <div class="field"><label>剪掉語氣詞</label>${seg('cutFiller', o.cutFiller, [[true, '開'], [false, '關']])}</div>
      <div class="field"><label>語氣詞清單（逗號分開，可自己加）</label><input type="text" value="${o.fillers}" data-text="fillers" style="width:100%;background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:9px 10px;font-size:16px"></div>
      <div class="field"><label>剪掉重複（我我我、我覺得我覺得）</label>${seg('cutRepeat', o.cutRepeat, [[true, '開'], [false, '關']])}</div>
      <div class="field"><label>字幕每句最多 <b>${o.maxChars}</b> 字</label><input type="range" min="6" max="24" step="1" value="${o.maxChars}" data-range="maxChars"></div>` : ''}
      <div class="row-actions"><button class="btn ghost" data-act="resetManual">還原所有手動修改</button><button class="btn danger" data-act="clear">清除剪輯</button></div>
      </details>`;
    if (tr.words?.length) {
      h += `<div class="field"><label>產生字幕樣式</label>${seg('subStyle', trUI.subStyle, TR_SUB_STYLES)}</div>
        <div class="row-actions" style="margin-top:4px"><button class="btn primary" data-act="subs">💬 產生字幕</button><button class="btn ghost" data-act="srt">⬇ 匯出 SRT</button></div>`;
    }
    h += `<div class="legend"><span style="--c:#ff7b7b">已剪掉（點一下還原）</span><span style="--c:#f6ad55">語氣詞</span><span style="--c:#b794f4">重複</span><span style="--c:#666">⏸ 氣口</span></div>
      <p class="note">點任何字詞或氣口就能切換剪掉／保留；點時間可以從那裡播放；✎ 可以改字幕文字和微調時間。</p>`;
    h += renderTrList(tr);
  }
  b.innerHTML = h;
}

function renderTrList(tr) {
  const words = tr.words || [], sils = (tr.silences || []).map((x, i) => ({ ...x, i }));
  const silChip = x => `<span class="chip sil ${x.cut ? 'cut' : ''}" data-sil="${x.i}">⏸ ${(x.e - x.s).toFixed(1)}s</span>`;
  if (!words.length) {
    if (!sils.length) return '<p class="note">沒有找到超過門檻的氣口，可以把氣口長度調短或門檻調高。</p>';
    return sils.map(x => `<div class="sent"><div class="sent-head"><button class="t" data-seek="${Math.max(0, x.s - 1)}">${fmtT(x.s)} ▶</button><span class="sp"></span></div><div class="chips">${silChip(x)}</div></div>`).join('');
  }
  let h = '', si = 0;
  tr.sents.forEach((st, k) => {
    const ws = st.idx.map(i => ({ w: words[i], i }));
    const s0 = ws[0].w.s, e0 = ws[ws.length - 1].w.e;
    while (si < sils.length && sils[si].e <= s0 + .05) { h += `<div class="chips" style="margin:6px 0">${silChip(sils[si])}</div>`; si++; }
    const dead = ws.every(x => x.w.cut), open = trUI.open.has(k);
    let chips = '';
    for (const { w, i } of ws) {
      while (si < sils.length && sils[si].s < w.s && sils[si].s >= s0) { chips += silChip(sils[si]); si++; }
      chips += `<span class="chip ${w.kind || ''} ${w.cut ? 'cut' : ''}" data-w="${i}">${w.t.replace(/</g, '&lt;')}</span>`;
    }
    const r = SP.sentenceRange(st, words) || { s: s0, e: e0 };
    h += `<div class="sent ${dead ? 'dead' : ''}"><div class="sent-head"><button class="t" data-seek="${Math.max(0, s0 - .3)}">${fmtT(s0)} ▶</button><span class="sp"></span>
      <button class="mini" data-act="edit" data-k="${k}">✎ 修改</button><button class="mini" data-act="cutSent" data-k="${k}">${dead ? '↺ 還原整句' : '✂ 剪整句'}</button></div>
      <div class="chips">${chips}</div>
      ${open ? `<div class="sent-edit"><input type="text" data-k="${k}" data-sent-text placeholder="字幕文字" value="${(SP.sentenceText(st, words)).replace(/"/g, '&quot;')}">
        <div class="nudge">開始 ${fmtT(r.s)} <button data-nudge="s" data-d="-.05" data-k="${k}">−</button><button data-nudge="s" data-d=".05" data-k="${k}">＋</button>
        　結束 ${fmtT(r.e)} <button data-nudge="e" data-d="-.05" data-k="${k}">−</button><button data-nudge="e" data-d=".05" data-k="${k}">＋</button>
        ${st.text != null ? `<button data-act="autoText" data-k="${k}">還原自動文字</button>` : ''}</div></div>` : ''}
    </div>`;
  });
  while (si < sils.length) { h += `<div class="chips" style="margin:6px 0">${silChip(sils[si])}</div>`; si++; }
  return h;
}

$('#trBody').addEventListener('click', e => {
  const t = e.target, tr = state.tr, o = settings.speech;
  const segBtn = t.closest('[data-set] button');
  if (segBtn) {
    const key = segBtn.parentElement.dataset.set; let v = segBtn.dataset.v;
    if (v === 'true') v = true; else if (v === 'false') v = false;
    if (key === 'subStyle') trUI.subStyle = v;
    else if (key === 'thrMode') o.thresholdDb = v === 'auto' ? 'auto' : Math.round(tr?.threshold ?? -40);
    else o[key] = v;
    if (['cutSilence', 'cutFiller', 'cutRepeat', 'thrMode'].includes(key)) applyRules();
    save(); renderTr(); return;
  }
  if (t.dataset.w != null) { const w = tr.words[+t.dataset.w]; w.cut = !w.cut; w.manual = true; recomputeCuts(); renderTr(); video.pause(); video.currentTime = Math.max(0, w.s - .05); return; }
  if (t.dataset.sil != null) { const s = tr.silences[+t.dataset.sil]; s.cut = !s.cut; s.manual = true; recomputeCuts(); renderTr(); return; }
  if (t.dataset.seek != null) { video.currentTime = +t.dataset.seek; togglePlay(true); return; }
  if (t.dataset.nudge) {
    const st = tr.sents[+t.dataset.k], kept = st.idx.map(i => tr.words[i]).filter(w => !w.cut); if (!kept.length) return;
    const d = +t.dataset.d;
    if (t.dataset.nudge === 's') kept[0].s = Math.max(0, Math.min(kept[0].e - .05, kept[0].s + d));
    else kept[kept.length - 1].e = Math.min(state.duration, Math.max(kept[kept.length - 1].s + .05, kept[kept.length - 1].e + d));
    recomputeCuts(); renderTr(); return;
  }
  const act = t.dataset.act; if (!act) return;
  if (act === 'asr') runASR();
  else if (act === 'silence') runSilenceOnly();
  else if (act === 'dismiss') { trUI.error = null; renderTr(); }
  else if (act === 'preview') { closeSheets(); video.currentTime = 0; togglePlay(true); }
  else if (act === 'subs') generateSubs();
  else if (act === 'srt') exportSRT();
  else if (act === 'edit') { const k = +t.dataset.k; trUI.open.has(k) ? trUI.open.delete(k) : trUI.open.add(k); renderTr(); }
  else if (act === 'autoText') { tr.sents[+t.dataset.k].text = null; save(); renderTr(); }
  else if (act === 'cutSent') {
    const st = tr.sents[+t.dataset.k], ws = st.idx.map(i => tr.words[i]), dead = ws.every(w => w.cut);
    ws.forEach(w => { w.cut = !dead; w.manual = true; }); recomputeCuts(); renderTr();
  }
  else if (act === 'resetManual') {
    for (const w of tr.words || []) { w.manual = false; w.cut = false; w.auto = false; }
    for (const s of tr.silences || []) s.manual = false;
    applyRules(); renderTr();
  }
  else if (act === 'clear') { state.tr = null; state.cuts = []; save(); renderTimeline(); renderTr(); }
});
$('#trBody').addEventListener('input', e => {
  const t = e.target, o = settings.speech;
  if (t.dataset.range) {
    o[t.dataset.range] = +t.value;
    const lbl = t.previousElementSibling?.querySelector('b');
    if (lbl) lbl.textContent = t.dataset.range === 'pad' ? Math.round(o.pad * 1000) : t.dataset.range === 'minGap' ? o.minGap.toFixed(2) : t.dataset.range === 'thresholdDb' ? o.thresholdDb + ' dB' : o[t.dataset.range];
    clearTimeout(trUI.deb); trUI.deb = setTimeout(() => { applyRules(); renderTr(); }, 250);
  } else if (t.dataset.text === 'fillers') {
    o.fillers = t.value; clearTimeout(trUI.deb); trUI.deb = setTimeout(() => { applyRules(); renderTr(); }, 600);
  } else if (t.dataset.sentText != null) {
    state.tr.sents[+t.dataset.k].text = t.value; save();
  }
});
$('#trBody').addEventListener('change', e => { if (e.target.id === 'srtInput' && e.target.files[0]) importSRT(e.target.files[0]); });

// ───────────── Sheet ─────────────
function openSheet(which) {
  closeSheets(false);
  const el = $({ add: '#addSheet', edit: '#editSheet', settings: '#settingsSheet', batch: '#batchSheet', tr: '#trSheet' }[which]);
  if (which === 'add' || which === 'batch') $('#backdrop').hidden = false;
  else document.body.classList.add('editing');
  el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
}
function closeSheets(clearSel = true) {
  document.querySelectorAll('.sheet').forEach(s => { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); });
  $('#backdrop').hidden = true; document.body.classList.remove('editing');
  if (clearSel && state.selected) { state.selected = null; renderTimeline(); }
}
$('#backdrop').onclick = () => closeSheets();
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeSheets());

// ───────────── 匯出 ─────────────
let rec = null, cancelled = false;
$('#exportBtn').onclick = exportVideo;

function pickMime() {
  const list = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return list.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

async function exportVideo() {
  if (!state.loaded || state.exporting) return;
  if (!window.MediaRecorder || !view.captureStream) { alert('這個瀏覽器不支援匯出，請用最新版 Chrome 或 Safari'); return; }
  closeSheets(); video.pause(); state.exporting = true; cancelled = false;
  const modal = $('#exportModal'); modal.hidden = false;
  $('#exportTitle').textContent = '匯出中…'; $('#exportBar').style.width = '0';
  $('#exportHint').textContent = '請保持此頁面開啟，不要切換 App（需要約影片長度的時間）';
  $('#exportActions').innerHTML = ''; $('#exportActions').appendChild(cancelBtn());

  // 先把需要 AI 去背的模型載好
  if (state.effects.some(needsMask) && seg.state !== 'ready') {
    $('#exportTitle').textContent = '載入 AI 去背模型…';
    seg.load(); await seg.ready;
    $('#exportTitle').textContent = '匯出中…';
  }
  const a = ensureAudio();
  const stream = view.captureStream(30);
  a?.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const mime = pickMime();
  const chunks = [];
  rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: W >= 1080 ? 12_000_000 : 8_000_000, audioBitsPerSecond: 192_000 });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => rec.onstop = r);
  const wasMuted = state.muted;
  if (a) a.gain.gain.value = 0; // 匯出時喇叭靜音，錄音軌不受影響

  const cuts = state.cuts, outTotal = state.duration - SP.cutTotal(cuts);
  const seekTo = async t => { video.currentTime = t; await once(video, 'seeked', 3000).catch(() => {}); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); };
  const startCut = SP.cutAt(cuts, 0);
  await seekTo(startCut ? startCut[1] + .001 : 0);
  rec.start(250);
  await video.play();
  let jumping = false;
  const tick = async () => {
    if (rec.state === 'inactive') return;
    const t = video.currentTime;
    const done = cuts.filter(c => c[1] <= t).reduce((a, c) => a + c[1] - c[0], 0);
    $('#exportBar').style.width = `${Math.min(100, (t - done) / outTotal * 100).toFixed(1)}%`;
    if (video.ended || t >= state.duration - .03) { rec.stop(); return; }
    const c = !jumping && SP.cutAt(cuts, t);
    if (c) {
      // 跳過要剪掉的段落：先暫停錄影，跳過去、畫面更新後再繼續錄
      if (c[1] >= state.duration - .05) { rec.stop(); return; }
      jumping = true; rec.pause(); video.pause();
      await seekTo(c[1] + .001);
      if (cancelled || rec.state === 'inactive') return;
      rec.resume(); await video.play(); jumping = false;
    }
    requestAnimationFrame(tick);
  };
  tick();
  video.addEventListener('ended', () => rec.state === 'recording' && rec.stop(), { once: true });
  await stopped;
  video.pause(); stream.getVideoTracks().forEach(t => t.stop());
  if (a) a.gain.gain.value = wasMuted ? 0 : 1;
  state.exporting = false;
  if (cancelled) { modal.hidden = true; return; }

  const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type });
  const url = URL.createObjectURL(blob);
  const file = new File([blob], `areelup-${Date.now()}.${ext}`, { type });
  $('#exportBar').style.width = '100%';
  $('#exportTitle').textContent = '完成 🎉';
  $('#exportHint').textContent = ext === 'mp4' ? '可以直接上傳到 Reels / TikTok' : '已輸出 WebM 檔（部分平台需轉成 MP4）';
  const acts = $('#exportActions'); acts.innerHTML = '';
  // 在 Claude 預覽頁裡，下載要透過平台的 downloads 功能
  const dlCap = window.claude?.use ? await Promise.race([window.claude.use('downloads'), new Promise(r => setTimeout(() => r(null), 3000))]).catch(() => null) : null;
  if (dlCap) {
    const sv = document.createElement('button'); sv.className = 'btn primary'; sv.textContent = '儲存影片';
    sv.onclick = () => dlCap.save({ filename: file.name, data: blob }).then(() => { $('#exportHint').textContent = '已儲存 ✅'; })
      .catch(err => { if (err?.code !== 'declined') $('#exportHint').textContent = '無法儲存：' + (err?.message || err?.code); });
    acts.appendChild(sv);
  } else if (navigator.canShare?.({ files: [file] })) {
    const sh = document.createElement('button'); sh.className = 'btn primary'; sh.textContent = '分享 / 存到相簿';
    sh.onclick = () => navigator.share({ files: [file] }).catch(() => {}); acts.appendChild(sh);
  }
  const dl = document.createElement('a'); dl.className = 'btn ghost'; dl.textContent = '下載'; dl.href = url; dl.download = file.name; acts.appendChild(dl);
  if (!dlCap) { const pv = document.createElement('video'); pv.src = url; pv.controls = true; pv.playsInline = true; pv.style.cssText = 'width:100%;max-height:40dvh;border-radius:12px;margin-bottom:10px;background:#000'; acts.before(pv); pv.dataset.result = '1'; }
  const close = document.createElement('button'); close.className = 'btn ghost'; close.textContent = '關閉';
  close.onclick = () => { modal.hidden = true; document.querySelectorAll('video[data-result]').forEach(v => v.remove()); }; acts.appendChild(close);
}
function cancelBtn() { const b = document.createElement('button'); b.id = 'cancelExport'; b.className = 'btn ghost'; b.textContent = '取消'; b.onclick = () => { cancelled = true; rec?.state === 'recording' && rec.stop(); video.pause(); }; return b; }

// ───────────── 儲存 ─────────────
function save() { try { localStorage.setItem(KEY, JSON.stringify({ effects: state.effects, settings, tr: state.tr, trKey: state.videoKey })); } catch {} }
function restore() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    const list = Array.isArray(raw) ? raw : raw.effects || [];
    if (raw.settings) Object.assign(settings, raw.settings);
    settings.speech = { ...SP.DEFAULT_SPEECH, ...(settings.speech || {}) };
    if (raw.tr && raw.trKey === state.videoKey) { state.tr = raw.tr; recomputeCuts(false); }
    applySegSettings();
    state.effects = list.filter(f => EFFECTS[f.type] && f.start < state.duration).map(f => ({
      ...f, dur: Math.min(f.dur, state.duration - f.start), params: { ...defaultParams(f.type), ...f.params },
    }));
    state.effects.forEach(loadFonts);
  } catch { state.effects = []; }
}

// ───────────── 小工具 ─────────────
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function once(el, ev, timeout = 0) {
  return new Promise((res, rej) => {
    let to; const h = () => { clearTimeout(to); res(); };
    el.addEventListener(ev, h, { once: true });
    if (timeout) to = setTimeout(() => { el.removeEventListener(ev, h); rej(new Error(ev + ' timeout')); }, timeout);
  });
}
let stTimer;
function showStatus(msg, ms) { const s = $('#status'); s.textContent = msg; s.hidden = false; clearTimeout(stTimer); if (ms) stTimer = setTimeout(hideStatus, ms); }
function hideStatus() { $('#status').hidden = true; }

// 開發/測試用
window.__clipfx = { state, addFx, render, seg, settings, SP, applyRules, recomputeCuts, renderTr };
