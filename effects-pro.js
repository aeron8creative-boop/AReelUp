// ───────────────── 6 個爆款版型 ─────────────────
// 依照「6 個 Reels 剪輯 Skill」規格改寫成即時 canvas 特效。
// 規格以 1080×1920 為基準，這裡用 k = W / 1080 換算，所以 720p / 1080p 都適用。
import {
  FONTS, clamp, easeOut, easeInOut, lerp, rr, drawCover, fmtNum, blurred, shadow, noShadow,
  T, TA, C, S, R, IMG, IMGS, MEDIA,
} from './effects.js';
// 上傳的影片要載入完成才能畫
const ready = m => (m && (m.tagName !== 'VIDEO' || m.readyState >= 2) ? m : null);

const SANS = '"Noto Sans TC","Inter",sans-serif';
const INTER = '"Inter","Noto Sans TC",sans-serif';
const SERIF = FONTS.zhSerif;
const ANTON = '"Anton","Noto Sans TC",sans-serif';
const MARKER = '"Permanent Marker","Caveat",cursive';
const F = (w, px, fam) => `${w} ${Math.round(px)}px ${fam}`;
const ACCENTS = ['#FF9F43', '#FFD23F', '#FF5C8A', '#7C5CFF', '#4FD1C5', '#F5A623'];

// Chrome 支援 canvas 模糊；Safari 不支援時就只做淡入＋上移
const FILTER_OK = (() => { try { const c = document.createElement('canvas').getContext('2d'); c.filter = 'blur(1px)'; return c.filter === 'blur(1px)'; } catch { return false; } })();

// 規格進場：0.42 秒「淡入＋上移 35px＋模糊 8px→0」，ease-out 三次方，不彈跳不旋轉
function enter(ctx, lt, delay, k, d = .42) {
  const e = easeOut((lt - delay) / d);
  ctx.globalAlpha *= e;
  ctx.translate(0, (1 - e) * 35 * k);
  if (FILTER_OK && e > 0 && e < 1) ctx.filter = `blur(${((1 - e) * 8 * k).toFixed(1)}px)`;
  return e;
}

function fitF(ctx, text, weight, fam, maxW, maxPx) {
  let px = maxPx; ctx.font = F(weight, px, fam);
  const w = ctx.measureText(text).width;
  if (w > maxW) { px *= maxW / w; ctx.font = F(weight, px, fam); }
  return px;
}
// 中文按字、英文按空格斷行
function wrap(ctx, text, maxW) {
  const tokens = /\s/.test(text) ? text.split(/(\s+)/) : [...text];
  const out = []; let line = '';
  for (const t of tokens) {
    if (ctx.measureText(line + t).width > maxW && line.trim()) { out.push(line.trim()); line = t.trimStart(); }
    else line += t;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}
const list = s => String(s || '').split(/[,，]/).map(x => x.trim()).filter(Boolean);
// "380K" → {n:380, suf:'K'}
const parseNum = s => { const m = String(s).replace(/,/g, '').match(/^([^\d.-]*)([\d.]+)(.*)$/); return m ? { pre: m[1], n: parseFloat(m[2]), suf: m[3], dec: (m[2].split('.')[1] || '').length } : { pre: '', n: 0, suf: String(s), dec: 0 }; };
const fmtVal = (v, dec) => dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US');

// 展示素材的不同調色版本（黑白 / 暖色 / 高飽和），只對小縮圖做並快取
const tintCache = new WeakMap();
function tinted(src, mode) {
  if (!src || mode === 'orig' || !(src instanceof HTMLCanvasElement) || src.width > 600) return src;
  let m = tintCache.get(src); if (!m) tintCache.set(src, m = {});
  if (m[mode]) return m[mode];
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], l = .299 * r + .587 * g + .114 * b;
    if (mode === 'bw') { const v = (l - 128) * 1.15 + 128; d[i] = d[i + 1] = d[i + 2] = v; }
    else if (mode === 'warm') { d[i] = r * 1.08 + 18; d[i + 1] = g * 1.02 + 6; d[i + 2] = b * .85; }
    else if (mode === 'sat') { d[i] = l + (r - l) * 1.6; d[i + 1] = l + (g - l) * 1.6; d[i + 2] = l + (b - l) * 1.6; }
  }
  x.putImageData(img, 0, 0);
  return (m[mode] = c);
}

// 封面卡：0 米白＋紙條標題｜1 粉底＋宋體大字｜2 深色＋重點色英文｜3 文字貼文｜4 黑底＋馬克筆
function coverCard(ctx, kind, text, x, y, w, h, accent) {
  const u = w / 300;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (kind === 0) {
    ctx.fillStyle = '#F3EDE2'; ctx.fillRect(x, y, w, h);
    ctx.translate(x + w / 2, y + h * .45); ctx.rotate(-.05);
    shadow(ctx, 8 * u, 'rgba(0,0,0,.15)', 2 * u); ctx.fillStyle = '#fff'; ctx.fillRect(-w * .42, -34 * u, w * .84, 68 * u); noShadow(ctx);
    ctx.fillStyle = '#222'; fitF(ctx, text, 700, SANS, w * .74, 38 * u); ctx.fillText(text, 0, 0);
  } else if (kind === 1) {
    ctx.fillStyle = '#F7C6D0'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#3B1F2B'; ctx.font = F(900, 64 * u, SERIF);
    const ls = wrap(ctx, text, w * .8).slice(0, 3);
    ls.forEach((l, i) => ctx.fillText(l, x + w / 2, y + h / 2 + (i - (ls.length - 1) / 2) * 76 * u));
  } else if (kind === 2) {
    ctx.fillStyle = '#141414'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accent; ctx.font = F(800, 58 * u, INTER);
    const ls = wrap(ctx, text.toUpperCase(), w * .8).slice(0, 3);
    ls.forEach((l, i) => ctx.fillText(l, x + w / 2, y + h / 2 + (i - (ls.length - 1) / 2) * 62 * u));
  } else if (kind === 3) {
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(x + 44 * u, y + 60 * u, 20 * u, 0, 7); ctx.fill();
    ctx.fillStyle = '#eee'; rr(ctx, x + 74 * u, y + 52 * u, 120 * u, 16 * u, 8 * u); ctx.fill();
    ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.font = F(700, 34 * u, SANS);
    wrap(ctx, text, w * .8).slice(0, 4).forEach((l, i) => ctx.fillText(l, x + 26 * u, y + 130 * u + i * 46 * u));
    ctx.fillStyle = '#eee'; for (let i = 0; i < 3; i++) { rr(ctx, x + 26 * u, y + h - (120 - i * 30) * u, w * (.8 - i * .15), 14 * u, 7 * u); ctx.fill(); }
  } else {
    ctx.fillStyle = '#0D0D0D'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff'; ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-.08);
    fitF(ctx, text, 400, MARKER, w * .8, 70 * u); ctx.fillText(text, 0, 0);
  }
  ctx.restore();
}

// 共用暫存畫布
const _tmp = document.createElement('canvas');
function tmp(w, h) { if (_tmp.width !== w || _tmp.height !== h) { _tmp.width = w; _tmp.height = h; } const c = _tmp.getContext('2d'); c.clearRect(0, 0, w, h); return c; }

// ══════════════════════════════════════════════
export const PRO_EFFECTS = {

  // 01 環繞卡片牆
  orbitCards: {
    name: '環繞卡片牆', icon: '🎠', cat: '爆款版型', color: '#FFB86B', dur: 5, base: true, ai: () => true,
    params: {
      line1: T('標題第一行（白字）', '我用 AI 剪了'),
      line2: T('標題第二行（白底黑字）', '這 10 支 Reels'),
      center: T('最前面卡片的大字', '超簡單'),
      centerSub: T('最前面卡片的小字幕', '三個步驟就完成'),
      covers: T('封面卡文字（逗號分開）', '剪輯秘訣,爆款公式,grow fast,今天分享我的剪片流程,Step 3'),
      jump: T('跳字（空格分開，每 0.22 秒換一個）', '剪片 變得 超級 簡單'),
      photos: IMGS('卡片照片（選用；不選就用展示素材）'),
      speed: R('轉速（弧度/秒）', 1.7, .3, 3),
      accent: C('重點色', '#FF9F43', ACCENTS),
      bgZoom: S('背景放大 1.25 倍上移（臉在上、卡片在胸口）', 'on', [['on', '開'], ['off', '關']]),
    },
    draw(e) {
      const { ctx, W, H, P, lt, frame } = e, k = W / 1080;
      const z = P.bgZoom === 'on' ? 1.25 : 1, oy = P.bgZoom === 'on' ? -H * .12 : 0;
      const xf = fn => { ctx.save(); ctx.translate(W / 2, oy); ctx.scale(z, z); ctx.translate(-W / 2, 0); fn(); ctx.restore(); };
      xf(() => ctx.drawImage(frame, 0, 0));
      const n = 10, cy = 1270 * k, rx = 590 * k, ry = 240 * k;
      const slots = ['bw', 0, 'warm', 1, 'orig', 2, 'sat', 3, 'orig', 4];
      const covers = list(P.covers); const photos = P.photos?.length ? P.photos : null;
      const cards = [];
      for (let i = 0; i < n; i++) {
        const th = -P.speed * lt + i / n * Math.PI * 2;
        cards.push({ i, th, c: Math.cos(th), s: Math.sin(th) });
      }
      const frontIdx = cards.reduce((a, b) => (b.c > a.c ? b : a)).i;
      const drawCard = cd => {
        const sc = .45 + .6 * (cd.c + 1) / 2;
        const w = 300 * k * sc, h = 530 * k * sc;
        const x = W / 2 + rx * cd.s, y = cy + ry * cd.c;
        const order = Math.round(Math.abs(cd.i - (n - 1) / 2)); // 從中間往兩邊依序淡入
        ctx.save();
        const a = easeOut((lt - order * .05) / .42); if (a <= 0) { ctx.restore(); return; }
        ctx.globalAlpha *= a * e.outK;
        ctx.translate(x, y + (1 - a) * 35 * k);
        ctx.scale(Math.max(.12, Math.cos(50 * Math.PI / 180 * cd.s)), 1); // rotateY(-50°·sinθ)
        shadow(ctx, 30 * k * sc, 'rgba(0,0,0,.35)', 12 * k * sc);
        ctx.fillStyle = '#fff'; rr(ctx, -w / 2, -h / 2, w, h, 30 * k * sc); ctx.fill(); noShadow(ctx);
        const b = 5 * k * sc;
        ctx.save(); rr(ctx, -w / 2 + b, -h / 2 + b, w - b * 2, h - b * 2, 26 * k * sc); ctx.clip();
        const slot = slots[cd.i];
        if (typeof slot === 'string') {
          const src = photos ? photos[cd.i % photos.length] : tinted(e.broll(cd.i), slot);
          drawCover(ctx, src, -w / 2, -h / 2, w, h);
        } else coverCard(ctx, slot, covers[slot % Math.max(1, covers.length)] || '', -w / 2, -h / 2, w, h, P.accent);
        if (cd.i === frontIdx) {
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          if (P.center) { shadow(ctx, 16 * k * sc, 'rgba(0,0,0,.5)', 3 * k); ctx.fillStyle = '#fff'; fitF(ctx, P.center, 900, SANS, w * .85, 70 * k * sc); ctx.fillText(P.center, 0, -h * .05); noShadow(ctx); }
          if (P.centerSub) {
            ctx.font = F(700, 20 * k * sc, SANS); const tw = Math.min(w * .85, ctx.measureText(P.centerSub).width + 24 * k * sc);
            ctx.fillStyle = '#fff'; rr(ctx, -tw / 2, h * .28, tw, 34 * k * sc, 6 * k * sc); ctx.fill();
            ctx.fillStyle = '#111'; ctx.fillText(P.centerSub, 0, h * .28 + 17 * k * sc, w * .8);
          }
        }
        ctx.restore();
        if (cd.c < 0) { ctx.fillStyle = `rgba(0,0,0,${.28 * Math.min(1, -cd.c * 2)})`; rr(ctx, -w / 2, -h / 2, w, h, 30 * k * sc); ctx.fill(); } // 後排亮度 72%
        ctx.restore();
      };
      cards.filter(c => c.c < 0).sort((a, b) => a.c - b.c).forEach(drawCard);
      const person = e.person(); if (person) xf(() => ctx.drawImage(person, 0, 0));
      // 跳字：每 0.22 秒換一個詞，胸口高度
      const ws = String(P.jump || '').trim().split(/\s+/).filter(Boolean);
      if (ws.length && lt > .3) {
        const w = ws[Math.floor((lt - .3) / .22) % ws.length];
        ctx.save(); ctx.globalAlpha *= e.outK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        shadow(ctx, 20 * k, 'rgba(0,0,0,.45)', 4 * k); ctx.fillStyle = '#fff';
        fitF(ctx, w, 900, SANS, W * .8, 75 * k); ctx.fillText(w, W / 2, cy - 30 * k); ctx.restore();
      }
      cards.filter(c => c.c >= 0).sort((a, b) => a.c - b.c).forEach(drawCard);
      // 標題
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (P.line1) { ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, 0, k); shadow(ctx, 18 * k, 'rgba(0,0,0,.35)', 3 * k); ctx.fillStyle = '#fff'; fitF(ctx, P.line1, 700, SANS, W * .9, 78 * k); ctx.fillText(P.line1, W / 2, 170 * k); ctx.restore(); }
      if (P.line2) {
        ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, .12, k);
        const px = fitF(ctx, P.line2, 900, SANS, W * .85, 75 * k), tw = ctx.measureText(P.line2).width;
        ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 - tw / 2 - 30 * k, 215 * k, tw + 60 * k, px * 1.35);
        ctx.fillStyle = '#111'; ctx.fillText(P.line2, W / 2, 215 * k + px * .7); ctx.restore();
      }
      ctx.restore();
    },
  },

  // 02 等級排名
  ranking: {
    name: '等級排名', icon: '🏆', cat: '爆款版型', color: '#F2A33A', dur: 6, base: true,
    params: {
      title: T('標題', 'AI 剪輯工具排名'),
      items: TA('項目（一行一個：名稱 等級）', 'Claude S\nCapCut A\n小紅書 C'),
      colors: T('項目代表色（逗號分開，選用）', '#D97757,#2B2B2B,#FF2442'),
    },
    draw(e) {
      const { ctx, W, H, P, lt, frame } = e, k = W / 1080;
      ctx.drawImage(frame, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(0, 0, W, H); // 壓暗到 80%
      let g = ctx.createLinearGradient(0, H * .5, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)'); ctx.fillStyle = g; ctx.fillRect(0, H * .5, W, H * .5);
      g = ctx.createLinearGradient(0, 0, 0, 380 * k); g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 380 * k);
      // 標題：橘色斜體＋深橘硬陰影
      if (P.title) {
        ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, 0, k);
        ctx.translate(W / 2, 200 * k); ctx.transform(1, 0, Math.tan(-9 * Math.PI / 180), 1, 0, 0);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitF(ctx, P.title, 900, SANS, W * .88, 68 * k);
        ctx.fillStyle = '#8A4A10'; ctx.fillText(P.title, 2 * k, 2 * k);
        shadow(ctx, 18 * k, 'rgba(0,0,0,.4)', 4 * k); ctx.fillStyle = '#F2A33A'; ctx.fillText(P.title, 0, 0); ctx.restore();
      }
      const TIERS = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
      const TC = ['#FF5C6C', '#FF9F43', '#FFD84D', '#7BE08A', '#5DB7FF', '#A78BFA', '#F472B6'];
      const tw = 790 * k, rh = 66 * k, x0 = (W - tw) / 2, y0 = 820 * k, sw = 84 * k;
      const items = String(P.items || '').split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
        const m = l.match(/^(.*?)\s+([SABCDEF])$/i); const cols = list(P.colors);
        return { name: m ? m[1] : l, tier: m ? m[2].toUpperCase() : 'C', color: cols[i] || ['#D97757', '#4A5568', '#FF2442', '#1E90FF', '#2ECC71'][i % 5] };
      });
      ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, .1, k);
      ctx.fillStyle = '#0B0B0B'; ctx.fillRect(x0, y0, tw, rh * 7); ctx.strokeStyle = '#2A2A2A'; ctx.lineWidth = 1; ctx.strokeRect(x0 + .5, y0 + .5, tw - 1, rh * 7 - 1);
      TIERS.forEach((t, i) => {
        ctx.fillStyle = TC[i]; ctx.fillRect(x0, y0 + i * rh, sw, rh - 1);
        ctx.fillStyle = '#111'; ctx.font = F(700, 33 * k, INTER); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x0 + sw / 2, y0 + i * rh + rh / 2);
        if (i) { ctx.fillStyle = '#1E1E1E'; ctx.fillRect(x0 + sw, y0 + i * rh, tw - sw, 1); }
      });
      ctx.restore();
      if (!items.length) return;
      const per = Math.max(.6, (e.dur - .3) / items.length), cur = Math.min(items.length - 1, Math.floor(lt / per));
      const chipPos = idx => {
        const it = items[idx], row = TIERS.indexOf(it.tier);
        const before = items.slice(0, idx).filter(x => x.tier === it.tier).length;
        return { x: x0 + sw + 12 * k + before * 160 * k, y: y0 + row * rh + 8 * k, w: 150 * k, h: rh - 16 * k };
      };
      const icon = (it, cx, cy, s, glow) => {
        ctx.save(); if (glow) shadow(ctx, s * .35, it.color, 0);
        ctx.fillStyle = it.color; rr(ctx, cx - s / 2, cy - s / 2, s, s, s * .24); ctx.fill(); noShadow(ctx);
        ctx.fillStyle = '#fff'; ctx.font = F(800, s * .5, INTER); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText([...it.name][0].toUpperCase(), cx, cy + s * .02); ctx.restore();
      };
      // 已排好的縮小留在列裡
      for (let i = 0; i < cur; i++) {
        const p = chipPos(i), it = items[i];
        ctx.save(); ctx.globalAlpha *= e.outK;
        ctx.fillStyle = 'rgba(255,255,255,.06)'; rr(ctx, p.x, p.y, p.w, p.h, 8 * k); ctx.fill();
        icon(it, p.x + p.h / 2 + 4 * k, p.y + p.h / 2, p.h - 10 * k);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; fitF(ctx, it.name, 600, INTER, p.w - p.h - 14 * k, 22 * k);
        ctx.fillText(it.name, p.x + p.h + 8 * k, p.y + p.h / 2); ctx.restore();
      }
      // 目前的項目卡
      const it = items[cur], local = lt - cur * per, row = TIERS.indexOf(it.tier);
      const cw = 320 * k, ch = 330 * k;
      const cx = x0 + tw - cw / 2 - 20 * k, cyy = clamp(y0 + row * rh + rh / 2, y0 + ch / 2 - 60 * k, y0 + rh * 7 - ch / 2 + 60 * k);
      ctx.save(); ctx.globalAlpha *= e.outK;
      ctx.save(); enter(ctx, local, 0, k, .35);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitF(ctx, `放在 ${it.tier} 級`, 600, INTER, tw, 48 * k); ctx.fillText(`放在 ${it.tier} 級`, W / 2, y0 - 60 * k);
      ctx.restore();
      enter(ctx, local, .05, k, .35);
      const gg = ctx.createLinearGradient(0, cyy - ch / 2, 0, cyy + ch / 2); gg.addColorStop(0, '#1B2C55'); gg.addColorStop(1, '#060B18');
      shadow(ctx, 40 * k, 'rgba(0,0,0,.5)', 14 * k); ctx.fillStyle = gg; rr(ctx, cx - cw / 2, cyy - ch / 2, cw, ch, 26 * k); ctx.fill(); noShadow(ctx);
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5 * k; rr(ctx, cx - cw / 2, cyy - ch / 2, cw, ch, 26 * k); ctx.stroke();
      icon(it, cx, cyy - 50 * k, 130 * k, true);
      ctx.fillStyle = '#FFD23F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitF(ctx, it.name, 400, ANTON, cw * .86, 76 * k); ctx.fillText(it.name, cx, cyy + 95 * k);
      ctx.restore();
    },
  },

  // 03 頻道景深
  depthUI: {
    name: '頻道景深', icon: '📺', cat: '爆款版型', color: '#FF6B6B', dur: 5, base: true, ai: () => true,
    params: {
      channel: T('頻道名稱', 'A ReelUp Studio'),
      bigNum: T('大數字', '400,000'),
      subFrom: T('訂閱數起點', '380K'),
      subTo: T('訂閱數終點', '421K'),
      covers: T('封面縮圖文字（逗號分開）', '剪輯教學,Step 3,我的一天,grow fast'),
      tab: S('目前分頁', '影片', [['首頁', '首頁'], ['影片', '影片'], ['Shorts', 'Shorts'], ['播放清單', '播放清單']]),
      avatar: IMG('頭像（選用）'),
      photos: IMGS('縮圖照片（選用；不選就用展示素材）'),
      accent: C('重點色', '#FF9F43', ACCENTS),
    },
    draw(e) {
      const { ctx, W, H, P, lt, frame } = e, k = W / 1080;
      // 背景：模糊壓暗 45% ＋ 上緣淡掉的清楚畫面（亮度 60%）
      ctx.drawImage(blurred(frame, 18), 0, 0, W, H); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
      const t = tmp(W, H); t.drawImage(frame, 0, 0); t.fillStyle = 'rgba(0,0,0,.4)'; t.fillRect(0, 0, W, H);
      t.globalCompositeOperation = 'destination-in';
      const gm = t.createLinearGradient(0, H * .25, 0, H * .55); gm.addColorStop(0, 'rgba(0,0,0,0)'); gm.addColorStop(1, 'rgba(0,0,0,1)'); t.fillStyle = gm; t.fillRect(0, 0, W, H);
      t.globalCompositeOperation = 'source-over'; ctx.drawImage(_tmp, 0, 0);
      // 頻道視窗
      const ww = 930 * k, wh = 660 * k, wx = (W - ww) / 2, wy = 160 * k;
      ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, 0, k);
      shadow(ctx, 60 * k, 'rgba(0,0,0,.6)', 24 * k); ctx.fillStyle = '#0F0F0F'; rr(ctx, wx, wy, ww, wh, 30 * k); ctx.fill(); noShadow(ctx);
      ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; rr(ctx, wx + .5, wy + .5, ww - 1, wh - 1, 30 * k); ctx.stroke();
      const tabs = ['首頁', '影片', 'Shorts', '播放清單']; let tx = wx + 40 * k;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      tabs.forEach(tb => {
        const on = tb === P.tab; ctx.font = F(on ? 700 : 500, 28 * k, SANS); ctx.fillStyle = on ? '#fff' : '#8a8a8a';
        ctx.fillText(tb, tx, wy + 52 * k); const w = ctx.measureText(tb).width;
        if (on) { ctx.fillStyle = '#fff'; ctx.fillRect(tx, wy + 76 * k, w, 3 * k); }
        tx += w + 44 * k;
      });
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(wx, wy + 80 * k, ww, 1);
      const gx = wx + 26 * k, gy = wy + 100 * k, gw = ww - 52 * k, gh = wh - 124 * k, gap = 14 * k;
      const cw = (gw - gap * 2) / 3, chh = (gh - gap * 2) / 3, off = (lt * 15 * k) % (chh + gap);
      const covers = list(P.covers), photos = P.photos?.length ? P.photos : null, tints = ['bw', 'orig', 'warm'];
      ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, gh); ctx.clip();
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
        const i = r * 3 + c, x = gx + c * (cw + gap), y = gy + r * (chh + gap) - off;
        ctx.save(); rr(ctx, x, y, cw, chh, 10 * k); ctx.clip();
        if (i % 2 === 0) drawCover(ctx, photos ? photos[(i / 2) % photos.length] : tinted(e.broll(i), tints[(i / 2) % 3]), x, y, cw, chh);
        else coverCard(ctx, [0, 4, 1, 2][((i - 1) / 2) % 4], covers[((i - 1) / 2) % Math.max(1, covers.length)] || '', x, y, cw, chh, P.accent);
        ctx.restore();
      }
      ctx.restore(); ctx.restore();
      // 人物蓋在視窗前面（景深感）
      const person = e.person(); if (person) ctx.drawImage(person, 0, 0);
      // 大數字
      if (P.bigNum) {
        ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, .25, k);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; shadow(ctx, 20 * k, 'rgba(0,0,0,.4)', 4 * k); ctx.fillStyle = '#fff';
        fitF(ctx, P.bigNum, 600, INTER, W * .85, 86 * k); ctx.fillText(P.bigNum, W / 2, 1150 * k); ctx.restore();
      }
      // 訂閱條
      const bw = 770 * k, bh = 124 * k, bx = (W - bw) / 2, by = 1240 * k;
      ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, .4, k);
      ctx.save(); rr(ctx, bx, by, bw, bh, 30 * k); ctx.clip(); ctx.drawImage(blurred(frame, 10), 0, 0, W, H);
      ctx.fillStyle = 'rgba(16,16,16,.82)'; ctx.fillRect(bx, by, bw, bh); ctx.restore();
      const ar = 42 * k, ax = bx + 30 * k + ar, ay = by + bh / 2;
      ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, ar, 0, 7); ctx.clip(); ctx.fillStyle = P.accent; ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
      drawCover(ctx, P.avatar || e.thumb(0), ax - ar, ay - ar, ar * 2, ar * 2, .5, .25); ctx.restore();
      const a = parseNum(P.subFrom), b = parseNum(P.subTo), q = easeOut((lt - .55) / .9);
      const subs = `${b.pre}${fmtVal(lerp(a.n, b.n, q), b.dec)}${b.suf} 位訂閱者`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; fitF(ctx, P.channel, 700, SANS, bw * .45, 32 * k); ctx.fillText(P.channel, ax + ar + 22 * k, ay - 18 * k);
      ctx.fillStyle = '#aaa'; ctx.font = F(500, 24 * k, SANS); ctx.fillText(subs, ax + ar + 22 * k, ay + 22 * k);
      const pw = 150 * k, ph = 64 * k, px = bx + bw - pw - 28 * k;
      ctx.fillStyle = '#fff'; rr(ctx, px, ay - ph / 2, pw, ph, ph / 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.font = F(700, 28 * k, SANS); ctx.fillText('訂閱', px + pw / 2, ay + 1);
      ctx.restore();
    },
  },

  // 04 對比拼貼
  cutoutGrid: {
    name: '對比拼貼', icon: '🔲', cat: '爆款版型', color: '#9F7AEA', dur: 4, base: true, ai: () => true,
    params: {
      img1: IMG('左上圖'), img2: IMG('右上圖'), img3: IMG('左下圖'), img4: IMG('右下圖'),
      labels: T('沒放圖時的示意文字（逗號分開）', '一塊錢,一百萬,蠟筆畫,美術館'),
      caption: T('字幕', '一塊錢 對比 一百萬'),
      size: R('人像寬度', 555 / 1080, .35, .8),
    },
    draw(e) {
      const { ctx, W, H, P, lt, bbox } = e, k = W / 1080;
      const imgs = [P.img1, P.img2, P.img3, P.img4], labels = list(P.labels);
      const pal = [['#3A3A3A', '#1A1A1A', '#fff'], ['#FFD700', '#B8860B', '#3B2A00'], ['#F4EFE6', '#D9CFC0', '#333'], ['#3A2A1A', '#C9A227', '#fff']];
      const kb = 1 + .05 * easeInOut(lt / 1.2); // Ken Burns 推近 5%
      for (let i = 0; i < 4; i++) {
        const x = (i % 2) * W / 2, y = Math.floor(i / 2) * H / 2, w = W / 2, h = H / 2;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.translate(x + w / 2, y + h / 2); ctx.scale(kb, kb); ctx.translate(-(x + w / 2), -(y + h / 2));
        if (imgs[i]) drawCover(ctx, imgs[i], x, y, w, h);
        else {
          const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, pal[i][0]); g.addColorStop(1, pal[i][1]);
          ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
          ctx.fillStyle = pal[i][2]; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          fitF(ctx, labels[i] || '', 900, SANS, w * .8, 72 * k); ctx.fillText(labels[i] || '', x + w / 2, y + h * .32);
          ctx.globalAlpha = .55; ctx.font = F(500, 26 * k, SANS); ctx.fillText('點特效 → 上傳圖片', x + w / 2, y + h * .32 + 70 * k);
        }
        ctx.restore();
      }
      // 中間抠像：頭到肩膀，下緣漸層淡掉，有陰影、沒有白邊
      const person = e.person(); let bottom = H * .62;
      if (person && bbox) {
        const rw = Math.min(W, bbox.w * 1.05), sx = bbox.x + bbox.w / 2 - rw / 2, sy = Math.max(0, bbox.y - rw * .08), sh = Math.min(H - sy, rw * 1.15);
        const tw = Math.round(P.size * W), th = Math.round(tw * sh / rw);
        const t = tmp(tw, th); t.drawImage(person, sx, sy, rw, sh, 0, 0, tw, th);
        t.globalCompositeOperation = 'destination-in';
        const g = t.createLinearGradient(0, th * .62, 0, th); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        t.fillStyle = g; t.fillRect(0, 0, tw, th); t.globalCompositeOperation = 'source-over';
        const dx = (W - tw) / 2, dy = H / 2 - th * .55;
        ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, .1, k);
        shadow(ctx, 45 * k, 'rgba(0,0,0,.5)', 25 * k); ctx.drawImage(_tmp, dx, dy); ctx.restore();
        bottom = dy + th * .78;
      }
      if (P.caption) {
        ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, .25, k);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; shadow(ctx, 14 * k, 'rgba(0,0,0,.6)', 3 * k); ctx.fillStyle = '#fff';
        fitF(ctx, P.caption, 600, SANS, W * .86, 45 * k); ctx.fillText(P.caption, W / 2, Math.min(bottom, H - 440 * k)); ctx.restore();
      }
    },
  },

  // 05 數字對比面板
  explainerPanel: {
    name: '數字對比面板', icon: '💹', cat: '爆款版型', color: '#FFAA6E', dur: 4, base: true,
    params: {
      idx: T('編號', '01'), title: T('分頁標題', '對比'),
      prefix: T('貨幣符號', '$'), from: T('起點數字', '1'), to: T('終點數字', '1000000'), suffix: T('單位（選用）', ''),
      caption: T('字幕', '一百萬'),
      accent: C('重點色', '#FF9F43', ACCENTS),
      window: S('下方影片小窗', 'on', [['on', '開'], ['off', '關']]),
      media: MEDIA('小窗內容：圖片或影片（不選就用口播畫面）'),
    },
    draw(e) {
      const { ctx, W, H, P, lt, frame } = e, k = W / 1080;
      ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
      // 點陣：每 35px 一點，中間亮四周淡
      const sp = 35 * k, md = Math.hypot(W / 2, H / 2); ctx.fillStyle = '#fff';
      for (let y = sp / 2; y < H; y += sp) for (let x = sp / 2; x < W; x += sp) {
        const a = .08 * Math.max(0, 1 - Math.hypot(x - W / 2, y - H / 2) / md * 1.2); if (a < .005) continue;
        ctx.globalAlpha = a; ctx.fillRect(x, y, 2.4 * k, 2.4 * k);
      }
      ctx.globalAlpha = 1;
      // 光暈
      const gl = ctx.createRadialGradient(W / 2, 830 * k, 0, W / 2, 830 * k, 320 * k);
      gl.addColorStop(0, 'rgba(255,170,110,.75)'); gl.addColorStop(.5, 'rgba(255,140,80,.25)'); gl.addColorStop(1, 'rgba(255,140,80,0)');
      ctx.save(); ctx.globalAlpha = e.outK * easeOut(lt / .6); ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H); ctx.restore();
      // 分頁條
      const tw = 760 * k, th = 100 * k, tx = (W - tw) / 2, ty = 250 * k;
      ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, 0, k);
      const tg = ctx.createLinearGradient(0, ty, 0, ty + th); tg.addColorStop(0, '#3A3A3A'); tg.addColorStop(1, '#1E1E1E');
      ctx.fillStyle = tg; rr(ctx, tx, ty, tw, th, 18 * k); ctx.fill();
      ctx.save(); rr(ctx, tx, ty, tw, th, 18 * k); ctx.clip(); ctx.fillStyle = P.accent; ctx.fillRect(tx, ty, 8 * k, th); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; rr(ctx, tx + .5, ty + .5, tw - 1, th - 1, 18 * k); ctx.stroke();
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = P.accent; ctx.font = F(700, 34 * k, INTER); ctx.fillText(P.idx, tx + 36 * k, ty + th / 2);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; fitF(ctx, P.title, 600, SANS, tw * .6, 40 * k); ctx.fillText(P.title, W / 2, ty + th / 2);
      ctx.restore();
      // 兩個玻璃數字框
      const a = parseNum(P.from), b = parseNum(P.to);
      const q = Math.pow(clamp((lt - .45) / .8), 2.2); // 前慢後快
      const box = (x, y, w, h, text, delay) => {
        ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, delay, k);
        shadow(ctx, 30 * k, 'rgba(0,0,0,.6)', 14 * k);
        const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#2C2C2C'); g.addColorStop(1, '#141414');
        ctx.fillStyle = g; rr(ctx, x, y, w, h, 22 * k); ctx.fill(); noShadow(ctx);
        ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1; rr(ctx, x + .5, y + .5, w - 1, h - 1, 22 * k); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x + 22 * k, y + 2 * k, w - 44 * k, 1.5 * k);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fitF(ctx, text, 700, INTER, w * .86, 75 * k); ctx.fillText(text, x + w / 2, y + h / 2); ctx.restore();
      };
      const lw = 300 * k, rw = 470 * k, gap = 30 * k, bx = (W - lw - gap - rw) / 2, by = 440 * k, bh = 185 * k;
      box(bx, by, lw, bh, `${P.prefix}${fmtVal(a.n, a.dec)}${P.suffix}`, .12);
      box(bx + lw + gap, by, rw, bh, `${P.prefix}${fmtVal(q >= 1 ? b.n : a.n + (b.n - a.n) * q, b.dec)}${P.suffix}`, .2);
      if (P.caption) {
        ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, .35, k);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; shadow(ctx, 14 * k, 'rgba(0,0,0,.5)', 3 * k); ctx.fillStyle = '#fff';
        fitF(ctx, P.caption, 600, SANS, W * .86, 53 * k); ctx.fillText(P.caption, W / 2, 900 * k); ctx.restore();
      }
      if (P.window === 'on') {
        const vw = 700 * k, vh = 460 * k, vx = (W - vw) / 2, vy = 1010 * k;
        ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, .3, k);
        shadow(ctx, 40 * k, 'rgba(0,0,0,.6)', 16 * k); ctx.fillStyle = '#111'; rr(ctx, vx, vy, vw, vh, 35 * k); ctx.fill(); noShadow(ctx);
        rr(ctx, vx, vy, vw, vh, 35 * k); ctx.clip(); const m = ready(P.media); drawCover(ctx, m || frame, vx, vy, vw, vh, .5, m ? .5 : .3); ctx.restore();
      }
    },
  },

  // 06 開箱價格
  productPrice: {
    name: '開箱價格', icon: '🏷️', cat: '爆款版型', color: '#48BB78', dur: 4, base: true,
    params: {
      product: IMG('商品照片（不選就用展示素材）'),
      currency: T('貨幣', 'NT$'),
      from: T('起跳價格', '266'),
      price: T('最終價格（請填真實價格）', '500'),
      seam: T('接縫大字（留空 = 顯示價格）', ''),
      accent: C('重點色', '#FFD23F', ACCENTS),
    },
    draw(e) {
      const { ctx, W, H, P, lt, frame, bbox } = e, k = W / 1080;
      // 上半：商品畫面慢慢推近 6%
      const src = P.product || e.brollLive || (e.hasBroll ? e.broll(0) : null);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H / 2); ctx.clip();
      const s = 1 + .06 * clamp(lt / e.dur);
      ctx.translate(W / 2, H / 4); ctx.scale(s, s); ctx.translate(-W / 2, -H / 4);
      if (src) drawCover(ctx, src, 0, 0, W, H / 2);
      else {
        ctx.fillStyle = '#EDE7DD'; ctx.fillRect(0, 0, W, H / 2);
        ctx.fillStyle = '#999'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = F(600, 36 * k, SANS);
        ctx.fillText('點特效 → 上傳商品照片', W / 2, H / 4); ctx.font = F(500, 26 * k, SANS); ctx.fillText('或在「調色」裡加入展示素材影片', W / 2, H / 4 + 56 * k);
      }
      ctx.restore();
      // 下半：口播，臉放在下半的中上
      const sh = H / 2, faceY = bbox ? bbox.y + Math.min(bbox.w, bbox.h) * .35 : H * .32;
      const sy = clamp(faceY - sh * .35, 0, H - sh);
      ctx.drawImage(frame, 0, sy, W, sh, 0, H / 2, W, sh);
      // 價格
      const a = parseFloat(String(P.from).replace(/,/g, '')) || 0, b = parseFloat(String(P.price).replace(/,/g, '')) || 0;
      const v = lerp(a, b, easeOut((lt - .4) / .55));
      const priceTxt = `${P.currency}${Math.round(v).toLocaleString('en-US')}`;
      // 價格吊牌
      ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, 0, k);
      ctx.font = F(700, 75 * k, INTER); const tw = ctx.measureText(priceTxt).width;
      const w = tw + 120 * k, h = 130 * k, cx = Math.min(W - w / 2 - 40 * k, 760 * k), cy = 330 * k;
      ctx.translate(cx, cy); ctx.rotate(-6 * Math.PI / 180);
      const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2, tip = 46 * k;
      shadow(ctx, 24 * k, 'rgba(0,0,0,.3)', 8 * k); ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(x0 + tip, y0); ctx.lineTo(x1 - 10 * k, y0); ctx.quadraticCurveTo(x1, y0, x1, y0 + 10 * k); ctx.lineTo(x1, y1 - 10 * k);
      ctx.quadraticCurveTo(x1, y1, x1 - 10 * k, y1); ctx.lineTo(x0 + tip, y1); ctx.lineTo(x0, 0); ctx.closePath(); ctx.fill(); noShadow(ctx);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x0 + tip * .75, 0, 10 * k, 0, 7); ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = F(700, 75 * k, INTER); ctx.fillText(priceTxt, x0 + tip + (w - tip) / 2, 4 * k);
      ctx.restore();
      // 接縫大字
      const seam = P.seam || priceTxt;
      ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, .15, k);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitF(ctx, seam, 800, INTER, W * .86, 80 * k);
      ctx.lineJoin = 'round'; ctx.lineWidth = 8 * k; ctx.strokeStyle = 'rgba(0,0,0,.75)'; shadow(ctx, 20 * k, 'rgba(0,0,0,.5)', 5 * k);
      ctx.strokeText(seam, W / 2, H / 2); noShadow(ctx); ctx.fillStyle = P.accent; ctx.fillText(seam, W / 2, H / 2);
      ctx.restore();
    },
  },
};

export { ready, enter, fitF, wrap, list, parseNum, fmtVal, tinted, coverCard, tmp, F, SANS, INTER, SERIF, ANTON, MARKER, FILTER_OK };
