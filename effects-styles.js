// ───────────────── 20 種剪輯風格 ─────────────────
// 依照「20 個剪輯風格 Skill」規格改寫成即時 canvas 特效（基準 1080×1920，k = W/1080）。
import { safeY, subK, FONTS, clamp, easeOut, easeInOut, lerp, rand, rr, drawCover, parseMarks, blurred, shadow, noShadow, T, TA, C, S, R, IMG, MEDIA } from './effects.js';
import { ready, enter, fitF, wrap, tmp, F, SANS, INTER, SERIF, MARKER } from './effects-pro.js';

const WENKAI = FONTS.wenkai, BODONI = FONTS.bodoni, VT = FONTS.vt323;
const ON_OFF = [['on', '開'], ['off', '關']];
const lns = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

// 字距加寬的文字
function spaced(ctx, text, x, y, sp, align = 'center') {
  const chars = [...text], ws = chars.map(c => ctx.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const pa = ctx.textAlign; ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += ws[i] + sp; });
  ctx.textAlign = pa; return total;
}
// 分段文字（*星號* 標重點）逐段畫出，回傳每段位置
function measureSegs(ctx, segs) { return segs.map(g => ({ ...g, w: ctx.measureText(g.t).width })); }

// 人物外加描邊（貼紙感）
const _ol = document.createElement('canvas');
function outlined(person, color, r) {
  if (_ol.width !== person.width || _ol.height !== person.height) { _ol.width = person.width; _ol.height = person.height; }
  const c = _ol.getContext('2d'); c.clearRect(0, 0, _ol.width, _ol.height);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; c.drawImage(person, Math.cos(a) * r, Math.sin(a) * r); }
  c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, _ol.width, _ol.height);
  c.globalCompositeOperation = 'source-over'; c.drawImage(person, 0, 0);
  return _ol;
}
// 黑白（Safari 也支援的混合模式）
function mono(ctx, W, H, contrast = 0) {
  ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
  if (contrast > 0) { ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = contrast; ctx.fillStyle = '#808080'; }
  ctx.restore();
}
// 顆粒：預先產生幾張雜訊圖輪流用
const NOISE = [];
function noise(i) {
  if (!NOISE.length) for (let n = 0; n < 4; n++) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), d = x.createImageData(256, 256);
    for (let j = 0; j < d.data.length; j += 4) { const v = Math.random() * 255; d.data[j] = d.data[j + 1] = d.data[j + 2] = v; d.data[j + 3] = 255; }
    x.putImageData(d, 0, 0); NOISE.push(c);
  }
  return NOISE[i % NOISE.length];
}
function grain(ctx, W, H, amt, t) {
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = amt;
  ctx.fillStyle = ctx.createPattern(noise(Math.floor(t * 30)), 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
}
function sparkle(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .22 : s, a = i / 8 * Math.PI * 2 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
// 簡單字幕列（很多風格共用）：回傳是否畫了
function caption(ctx, e, text, opt) {
  const { W, lt, outK } = e, k = W / 1080;
  const segs = parseMarks(text); if (!segs.length) return;
  const px = opt.px * k * subK(e); ctx.font = F(opt.weight || 700, px, opt.fam || SANS);
  let ms = measureSegs(ctx, segs); let tw = ms.reduce((a, g) => a + g.w, 0);
  if (tw > W * .86) { const s = W * .86 / tw; ctx.font = F(opt.weight || 700, px * s, opt.fam || SANS); ms = measureSegs(ctx, segs); tw = W * .86; }
  const y = safeY(e, opt.y * e.H, px * 1.6);
  ctx.save(); ctx.globalAlpha *= outK; enter(ctx, lt, opt.delay || 0, k, opt.d || .42);
  if (opt.bar) { ctx.fillStyle = opt.bar; rr(ctx, W / 2 - tw / 2 - 24 * k, y - px * .78, tw + 48 * k, px * 1.56, opt.barR ?? 10 * k); ctx.fill(); }
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  let x = W / 2 - tw / 2;
  for (const g of ms) {
    if (opt.shadow) shadow(ctx, px * .25, 'rgba(0,0,0,.55)', px * .04); else noShadow(ctx);
    if (opt.stroke) { ctx.lineWidth = opt.stroke * k; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.strokeText(g.t, x, y); }
    ctx.fillStyle = g.b && opt.mark ? opt.mark : opt.color || '#fff'; ctx.fillText(g.t, x, y);
    if (g.b && opt.underline) { noShadow(ctx); ctx.fillRect(x, y + px * .62, g.w, Math.max(1, 2 * k)); }
    x += g.w;
  }
  ctx.restore();
}

export const STYLE_EFFECTS = {

  // 01 手撕紙條風
  paperStrip: {
    name: '手撕紙條', icon: '📜', cat: '剪輯風格', color: '#F5EBDD', dur: 4,
    params: {
      strips: TA('紙條標題（一行一張）', '我用 AI\n剪片三個月'),
      marker: T('馬克筆英文小字', 'how to'),
      big: T('重點大字（不放紙條）', '爆紅了'),
      bigColor: C('重點字顏色（跟影片主色）', '#E8553F', ['#E8553F', '#F5A623', '#2ECC71', '#1E90FF', '#FF5C8A', '#FFFFFF']),
      quip: T('粉色手寫吐槽', '（真的假的？）'),
      y: R('垂直位置', .12, .05, .6),
    },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      let y = P.y * H;
      if (P.marker) { ctx.save(); ctx.globalAlpha *= outK; enter(ctx, lt, 0, k); ctx.fillStyle = '#fff'; shadow(ctx, 10 * k, 'rgba(0,0,0,.4)', 2 * k); ctx.font = F(400, 46 * k, MARKER); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(P.marker, W * .1, y); ctx.restore(); y += 60 * k; }
      lns(P.strips).forEach((t, i) => {
        ctx.save(); ctx.globalAlpha *= outK; enter(ctx, lt, .1 + i * .12, k);
        ctx.font = F(900, 78 * k, SERIF); const tw = Math.min(W * .8, ctx.measureText(t).width), sw = tw + 70 * k, sh = 118 * k;
        ctx.translate(W / 2 + (i % 2 ? 20 : -20) * k, y + sh / 2); ctx.rotate((i % 2 ? 1.5 : -1.2) * Math.PI / 180);
        const r = rand(i + 3); shadow(ctx, 14 * k, 'rgba(0,0,0,.25)', 5 * k); ctx.fillStyle = '#FBFAF6'; ctx.beginPath();
        ctx.moveTo(-sw / 2, -sh / 2); for (let x = -sw / 2; x <= sw / 2; x += 12 * k) ctx.lineTo(x, -sh / 2 + (r() - .5) * 8 * k);
        ctx.lineTo(sw / 2, sh / 2); for (let x = sw / 2; x >= -sw / 2; x -= 12 * k) ctx.lineTo(x, sh / 2 + (r() - .5) * 8 * k);
        ctx.closePath(); ctx.fill(); noShadow(ctx);
        ctx.strokeStyle = 'rgba(90,140,200,.18)'; ctx.lineWidth = 1.5 * k; for (let ly = -sh / 2 + 30 * k; ly < sh / 2; ly += 30 * k) { ctx.beginPath(); ctx.moveTo(-sw / 2, ly); ctx.lineTo(sw / 2, ly); ctx.stroke(); }
        ctx.fillStyle = '#332B2B'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitF(ctx, t, 900, SERIF, sw - 50 * k, 78 * k); ctx.fillText(t, 0, 4 * k);
        ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = .12; const r2 = rand(i + 9); // 做舊
        for (let n = 0; n < 60; n++) { ctx.beginPath(); ctx.arc((r2() - .5) * sw, (r2() - .5) * sh, r2() * 3 * k, 0, 7); ctx.fill(); }
        ctx.restore(); y += sh + 14 * k;
      });
      if (P.big) { ctx.save(); ctx.globalAlpha *= outK; enter(ctx, lt, .4, k); ctx.fillStyle = P.bigColor; shadow(ctx, 18 * k, 'rgba(0,0,0,.3)', 4 * k); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; fitF(ctx, P.big, 900, SANS, W * .86, 150 * k); ctx.fillText(P.big, W / 2, y + 10 * k); ctx.restore(); }
      if (P.quip) { ctx.save(); ctx.globalAlpha *= outK; enter(ctx, lt, .7, k); ctx.fillStyle = '#FF7FB0'; shadow(ctx, 8 * k, 'rgba(0,0,0,.35)', 2 * k); ctx.font = F(700, 50 * k, WENKAI); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.translate(W * .92, H * .56); ctx.rotate(-.06); ctx.fillText(P.quip, 0, 0); ctx.restore(); }
    },
  },

  // 02 霓虹發光風
  neonGlow: {
    name: '霓虹發光', icon: '🌃', cat: '剪輯風格', color: '#FF5FAE', dur: 3, base: true,
    params: { text: T('發光大字', 'NIGHT VIBES'), sub: T('綠色副標', '今晚就出發'), frame: S('霓虹外框', 'on', ON_OFF) },
    draw(e) {
      const { ctx, W, H, P, lt, frame } = e, k = W / 1080;
      ctx.drawImage(frame, 0, 0); ctx.fillStyle = 'rgba(0,0,10,.42)'; ctx.fillRect(0, 0, W, H);
      const v = ctx.createRadialGradient(W / 2, H / 2, W * .3, W / 2, H / 2, H * .7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.75)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      const flick = (lt % 1.1) < 1 / 30 ? .45 : 1; // 每 1 秒左右閃一下
      const glow = (draw, col) => { for (const b of [60, 24, 8]) { shadow(ctx, b * k, col, 0); draw(); } noShadow(ctx); draw(); };
      ctx.save(); ctx.globalAlpha *= e.outK * flick;
      if (P.frame === 'on') { ctx.lineWidth = 6 * k; ctx.strokeStyle = '#FFB3DA'; glow(() => { rr(ctx, 60 * k, 60 * k, W - 120 * k, H - 120 * k, 50 * k); ctx.stroke(); }, '#FF5FAE'); }
      ctx.save(); enter(ctx, lt, .1, k); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitF(ctx, P.text, 900, INTER, W * .8, 130 * k); ctx.fillStyle = '#FFE8F4'; glow(() => ctx.fillText(P.text, W / 2, H * .72), '#FF5FAE');
      if (P.sub) { fitF(ctx, P.sub, 700, SANS, W * .7, 56 * k); ctx.fillStyle = '#C9FFE0'; glow(() => ctx.fillText(P.sub, W / 2, H * .72 + 110 * k), '#2EF58A'); }
      ctx.restore(); ctx.restore();
    },
  },

  // 03 雜誌封面風
  magazineCover: {
    name: '雜誌封面風', icon: '📕', cat: '剪輯風格', color: '#F8B4D9', dur: 3.5, ai: P => P.behind === 'on',
    params: {
      title: T('刊頭', 'MUSE'), issue: T('期數', 'NO. 07 — NOVEMBER 2026'),
      head: TA('封面標語（兩行）', '剪輯\n是新的寫作'), small: TA('小標（兩行）', '19 種特效完整拆解\n手機就能做'),
      behind: S('刊頭壓在頭髮後面', 'on', ON_OFF),
    },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      ctx.save(); ctx.globalAlpha *= outK;
      ctx.save(); enter(ctx, lt, 0, k); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; shadow(ctx, 20 * k, 'rgba(0,0,0,.2)', 4 * k);
      const px = fitF(ctx, P.title, 700, BODONI, W * .92, 300 * k); ctx.fillText(P.title, W / 2, 70 * k); ctx.restore();
      const person = P.behind === 'on' ? e.person() : null; if (person) ctx.drawImage(person, 0, 0);
      ctx.save(); enter(ctx, lt, .15, k); ctx.fillStyle = '#fff'; ctx.font = F(400, 26 * k, '"Space Mono",monospace'); ctx.textBaseline = 'top'; shadow(ctx, 6 * k, 'rgba(0,0,0,.4)', 1);
      spaced(ctx, P.issue, W / 2, 80 * k + px * 1.02, 6 * k); ctx.restore();
      let y = H - 700 * k;
      ctx.save(); enter(ctx, lt, .3, k); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; shadow(ctx, 14 * k, 'rgba(0,0,0,.45)', 3 * k);
      lns(P.head).slice(0, 2).forEach(l => { fitF(ctx, l, 900, SERIF, W * .55, 92 * k); ctx.fillText(l, 70 * k, y); y += 108 * k; });
      noShadow(ctx); ctx.fillStyle = '#FF8FC4'; ctx.fillRect(70 * k, y + 10 * k, 90 * k, 7 * k); y += 44 * k;
      ctx.fillStyle = '#fff'; shadow(ctx, 8 * k, 'rgba(0,0,0,.45)', 2 * k);
      lns(P.small).slice(0, 2).forEach(l => { fitF(ctx, l, 500, SANS, W * .5, 36 * k); ctx.fillText(l, 70 * k, y); y += 50 * k; });
      ctx.restore();
      const bx = W - 260 * k, by = H - 560 * k, bw = 180 * k, bh = 110 * k; ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = '#111';
      const r = rand(5); for (let x = bx + 10 * k; x < bx + bw - 10 * k;) { const w = (1 + Math.floor(r() * 3)) * k * 1.6; if (r() > .35) ctx.fillRect(x, by + 10 * k, w, bh - 34 * k); x += w + 1.6 * k; }
      ctx.font = F(400, 14 * k, '"Space Mono",monospace'); ctx.textAlign = 'center'; ctx.fillText('9 771234 567003', bx + bw / 2, by + bh - 12 * k);
      ctx.restore();
    },
  },

  // 04 筆記卡片風
  noteCard: {
    name: '筆記卡片', icon: '📝', cat: '剪輯風格', color: '#FF8FA3', dur: 4,
    params: {
      account: T('帳號名', 'areelup.studio'), title: T('筆記標題', '手機剪片 3 個小技巧'),
      body: TA('內文（兩行）', '不用電腦、不用學軟體\n照著做就能剪出質感 Reels'), tags: T('Hashtag', '#剪片 #reels #AI'),
      sticker: T('右上貼紙字', '必收藏'), avatar: IMG('頭像（選用）'),
    },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      ctx.save(); ctx.globalAlpha *= outK;
      // 上方帳號列
      ctx.save(); enter(ctx, lt, 0, k); ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(0, 0, W, 190 * k);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5 * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(70 * k, 100 * k); ctx.lineTo(48 * k, 122 * k); ctx.lineTo(70 * k, 144 * k); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(140 * k, 122 * k, 38 * k, 0, 7); ctx.clip(); ctx.fillStyle = '#FFC2D1'; ctx.fillRect(100 * k, 84 * k, 80 * k, 80 * k); drawCover(ctx, P.avatar || e.thumb(0), 102 * k, 84 * k, 76 * k, 76 * k, .5, .25); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = F(700, 34 * k, SANS); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(P.account, 196 * k, 122 * k, W * .45);
      ctx.fillStyle = '#FF2E63'; rr(ctx, W - 210 * k, 96 * k, 150 * k, 54 * k, 27 * k); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = F(700, 28 * k, SANS); ctx.fillText('關注', W - 135 * k, 124 * k);
      ctx.restore();
      // 右上圓形貼紙
      if (P.sticker) { ctx.save(); enter(ctx, lt, .2, k); ctx.translate(W - 170 * k, 330 * k); ctx.rotate(.15); shadow(ctx, 14 * k, 'rgba(0,0,0,.25)', 4 * k); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 92 * k, 0, 7); ctx.fill(); noShadow(ctx); ctx.fillStyle = '#FF7FA3'; ctx.beginPath(); ctx.arc(0, 0, 80 * k, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitF(ctx, P.sticker, 900, SANS, 130 * k, 44 * k); ctx.fillText(P.sticker, 0, 0); ctx.restore(); }
      // 下方筆記卡：從下方滑上來
      const s = easeOut(lt / .5), cy = lerp(H, H * .7, s);
      shadow(ctx, 30 * k, 'rgba(0,0,0,.3)', -6 * k); ctx.fillStyle = '#fff'; rr(ctx, 30 * k, cy, W - 60 * k, H * .3 + 60 * k, 40 * k); ctx.fill(); noShadow(ctx);
      ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; fitF(ctx, P.title, 900, SANS, W - 160 * k, 52 * k); ctx.fillText(P.title, 80 * k, cy + 50 * k);
      ctx.fillStyle = '#444'; ctx.font = F(500, 34 * k, SANS); lns(P.body).slice(0, 2).forEach((l, i) => ctx.fillText(l, 80 * k, cy + 130 * k + i * 50 * k, W - 160 * k));
      ctx.fillStyle = '#E0457B'; ctx.font = F(600, 32 * k, SANS); ctx.fillText(P.tags, 80 * k, cy + 240 * k, W - 160 * k);
      ctx.fillStyle = '#888'; ctx.font = F(500, 30 * k, SANS); ctx.fillText('♡ 2.3萬    ☆ 1.1萬    💬 856', 80 * k, cy + 320 * k);
      ctx.restore();
    },
  },

  // 05 剪輯時間軸風
  timelineRec: {
    name: '剪輯時間軸', icon: '⏺️', cat: '剪輯風格', color: '#FF4D4D', dur: 4,
    params: { title: TA('大標題', '一天剪完\n一週的片'), sub: T('等寬小字', 'TIMELINE · EDITED BY CLAUDE'), tint: S('紅色調', 'on', ON_OFF) },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      if (P.tint === 'on') { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .35 * outK; ctx.fillStyle = '#FF6B6B'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      ctx.save(); ctx.globalAlpha *= outK;
      const tc = e.time || lt, ts = `${String(Math.floor(tc / 3600)).padStart(2, '0')}:${String(Math.floor(tc / 60) % 60).padStart(2, '0')}:${String(Math.floor(tc) % 60).padStart(2, '0')}:${String(Math.floor(tc * 30) % 30).padStart(2, '0')}`;
      ctx.fillStyle = (Math.floor(lt * 2) % 2) ? 'rgba(255,40,40,.25)' : '#FF2828'; ctx.beginPath(); ctx.arc(80 * k, 120 * k, 14 * k, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = F(700, 34 * k, '"Space Mono",monospace'); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText('REC', 108 * k, 121 * k); ctx.fillText(ts, 230 * k, 121 * k);
      ctx.save(); enter(ctx, lt, 0, k); ctx.textBaseline = 'top'; shadow(ctx, 16 * k, 'rgba(0,0,0,.35)', 3 * k); let y = 270 * k;
      lns(P.title).forEach(l => { fitF(ctx, l, 900, SANS, W * .86, 150 * k); ctx.fillText(l, 70 * k, y); y += 165 * k; });
      ctx.font = F(400, 28 * k, '"Space Mono",monospace'); ctx.globalAlpha *= .85; spaced(ctx, P.sub, 72 * k, y + 10 * k, 3 * k, 'left'); ctx.restore();
      // 時間軸面板
      const px = 50 * k, pw = W - 100 * k, py = H - 720 * k, ph = 260 * k;
      ctx.save(); enter(ctx, lt, .2, k); ctx.fillStyle = 'rgba(18,18,22,.88)'; rr(ctx, px, py, pw, ph, 22 * k); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i <= 20; i++) ctx.fillRect(px + 30 * k + i * (pw - 60 * k) / 20, py + 22 * k, 1.5 * k, i % 5 ? 10 * k : 20 * k);
      const r = rand(2); for (let tr = 0; tr < 3; tr++) { const ty = py + 70 * k + tr * 60 * k; ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(px + 30 * k, ty, pw - 60 * k, 44 * k); let x = px + 30 * k + r() * 60 * k; while (x < px + pw - 90 * k) { const w = (80 + r() * 200) * k; ctx.fillStyle = tr === 2 ? '#7A2E2E' : '#E04545'; rr(ctx, x, ty + 4 * k, Math.min(w, px + pw - 30 * k - x), 36 * k, 6 * k); ctx.fill(); x += w + (10 + r() * 50) * k; } }
      const prog = e.total ? (e.time || 0) / e.total : lt / e.dur, hx = px + 30 * k + (pw - 60 * k) * clamp(prog);
      ctx.fillStyle = '#fff'; ctx.fillRect(hx - 1.5 * k, py + 14 * k, 3 * k, ph - 28 * k); ctx.beginPath(); ctx.moveTo(hx - 10 * k, py + 14 * k); ctx.lineTo(hx + 10 * k, py + 14 * k); ctx.lineTo(hx, py + 28 * k); ctx.fill();
      ctx.restore(); ctx.restore();
    },
  },

  // 06 復古膠片風
  filmGrain: {
    name: '復古膠片', icon: '🎞️', cat: '剪輯風格', color: '#F6AD55', dur: 4,
    params: { line: T('手寫旁白', '那年夏天，我們都還很年輕'), lineSize: R('旁白字體大小', 54, 32, 90, 1), date: T('日期戳', "'26 11 01"), grainAmt: R('顆粒', .35, 0, .8) },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      ctx.save(); ctx.globalAlpha = outK;
      ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = '#FFB347'; ctx.globalAlpha = .45 * outK; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen'; const br = .5 + .25 * Math.sin(lt * 1.4); // 漏光呼吸
      const lk = ctx.createRadialGradient(W * .95, H * .05, 0, W * .95, H * .05, W * .8); lk.addColorStop(0, `rgba(255,120,40,${.75 * br})`); lk.addColorStop(1, 'rgba(255,80,0,0)'); ctx.globalAlpha = outK; ctx.fillStyle = lk; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      grain(ctx, W, H, P.grainAmt * outK, lt);
      ctx.save(); ctx.globalAlpha *= outK; const bw = 70 * k, off = (lt * 120 * k) % (90 * k);
      ctx.fillStyle = '#0A0A0A'; ctx.fillRect(0, 0, bw, H); ctx.fillRect(W - bw, 0, bw, H);
      ctx.fillStyle = '#E8E2D6'; for (let y = -90 * k + off; y < H; y += 90 * k) { rr(ctx, 20 * k, y, 30 * k, 44 * k, 6 * k); ctx.fill(); rr(ctx, W - 50 * k, y, 30 * k, 44 * k, 6 * k); ctx.fill(); }
      ctx.font = F(400, 64 * k, VT); ctx.fillStyle = '#FF8A2A'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; shadow(ctx, 14 * k, 'rgba(255,120,30,.9)', 0); ctx.fillText(P.date, W - bw - 40 * k, H - 470 * k); noShadow(ctx);
      ctx.restore();
      if (P.line) caption(ctx, e, P.line, { px: P.lineSize, fam: WENKAI, weight: 700, y: .7, shadow: true, delay: .2 });
    },
  },

  // 07 極簡白字風
  minimalWhite: {
    name: '極簡白字', icon: '◻️', cat: '剪輯風格', color: '#EDEDED', dur: 2.5,
    params: { text: T('字幕（*星號* 標重點 = 細底線）', '好的作品，*不需要*解釋'), chapter: T('章節編號', '01'), y: R('垂直位置', .76, .2, .9), size: R('字體大小', 46, 30, 80, 1) },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      if (P.chapter) { ctx.save(); ctx.globalAlpha *= outK * easeOut(lt / .3); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = F(500, 28 * k, INTER); ctx.textBaseline = 'top'; spaced(ctx, P.chapter + ' /', 70 * k, 260 * k, 4 * k, 'left'); ctx.restore(); }
      const segs = parseMarks(P.text); if (!segs.length) return;
      ctx.save(); ctx.globalAlpha *= outK * easeOut(lt / .3); const fs = P.size * k * subK(e); ctx.font = F(500, fs, SANS); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      shadow(ctx, 6 * k, 'rgba(0,0,0,.18)', 1); const sp = fs * .05;
      const widths = segs.map(g => [...g.t].reduce((a, c) => a + ctx.measureText(c).width + sp, 0));
      let tot = widths.reduce((a, b) => a + b, 0); if (tot > W * .86) { const sc = W * .86 / tot; ctx.font = F(500, fs * sc, SANS); for (let i = 0; i < widths.length; i++) widths[i] *= sc; tot = W * .86; }
      let x = W / 2 - tot / 2; const y = safeY(e, P.y * H, fs * 1.6);
      segs.forEach((g, i) => { spaced(ctx, g.t, x, y, sp, 'left'); if (g.b) { noShadow(ctx); ctx.fillRect(x, y + fs * .7, widths[i] - sp, Math.max(1, 2 * k)); shadow(ctx, 6 * k, 'rgba(0,0,0,.18)', 1); } x += widths[i]; });
      ctx.restore();
    },
  },

  // 08 卡拉OK字幕風
  karaoke: {
    name: '卡拉OK字幕', icon: '🎤', cat: '剪輯風格', color: '#FF8FB8', dur: 3,
    params: { text: T('字幕（一行最多 12 字）', '今天要教你三個剪片技巧'), color: C('唱到的顏色', '#FF8FB8', ['#FF8FB8', '#F5E27A', '#4FD1C5', '#FF5C5C']), y: R('垂直位置', .78, .4, .9), size: R('字體大小', 64, 40, 100, 1) },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      const chars = [...String(P.text || '')]; if (!chars.length) return;
      const rows = []; for (let i = 0; i < chars.length; i += 12) rows.push(chars.slice(i, i + 12));
      let px = P.size * k * subK(e);
      { ctx.font = F(900, px, SANS); const widest = Math.max(...rows.map(r => r.reduce((a, c) => a + ctx.measureText(c).width, 0))) + px * .8; if (widest > W * .86) px *= W * .86 / widest; } // 不超出左右邊
      const prog = clamp((lt - .15) / Math.max(.3, e.dur - .5)) * chars.length; // 平均分配（之後可接逐字稿時間碼）
      ctx.save(); ctx.globalAlpha *= outK; enter(ctx, lt, 0, k); ctx.font = F(900, px, SANS); ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      let idx = 0;
      rows.forEach((row, ri) => {
        const ws = row.map(c => ctx.measureText(c).width), tw = ws.reduce((a, b) => a + b, 0);
        let x = W / 2 - tw / 2; const y = safeY(e, P.y * H, rows.length * px * 1.3) + (ri - (rows.length - 1) / 2) * px * 1.3;
        if (ri === 0) { ctx.fillStyle = P.color; ctx.font = F(900, px * .7, SANS); ctx.lineWidth = 4 * k; ctx.strokeStyle = '#000'; ctx.strokeText('♪', x - px * .8, y); ctx.fillText('♪', x - px * .8, y); ctx.font = F(900, px, SANS); }
        row.forEach((c, i) => {
          ctx.lineWidth = 8 * k; ctx.strokeStyle = '#000'; ctx.strokeText(c, x, y); // 4px 描邊（雙側）
          const f = clamp(prog - idx);
          ctx.fillStyle = '#fff'; ctx.fillText(c, x, y);
          if (f > 0) { ctx.save(); ctx.beginPath(); ctx.rect(x, y - px, ws[i] * f, px * 2); ctx.clip(); ctx.fillStyle = P.color; ctx.fillText(c, x, y); ctx.restore(); }
          x += ws[i]; idx++;
        });
      });
      ctx.restore();
    },
  },

  // 09 漫畫分格風
  comicPanel: {
    name: '漫畫分格', icon: '💥', cat: '剪輯風格', color: '#FFE14D', dur: 4.5, base: true,
    params: { panels: R('格數', 3, 2, 3, 1), bubbles: TA('對話框（一格一行）', '等等…\n這是 AI 剪的？！\n太扯了吧！'), speed: S('最後一格加速度線', 'on', ON_OFF) },
    draw(e) {
      const { ctx, W, H, P, lt, frame } = e, k = W / 1080, n = Math.round(P.panels), gap = 16 * k, m = 30 * k;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      const ph = (H - m * 2 - gap * (n - 1)) / n, texts = lns(P.bubbles), per = Math.max(.5, (e.dur - .3) / n);
      const crops = [[.5, .45, 1], [.5, .3, 1.7], [.5, .32, 2.4]];
      for (let i = 0; i < n; i++) {
        const y = m + i * (ph + gap), x = m, w = W - m * 2, a = easeOut((lt - i * per) / .4); if (a <= 0) continue;
        ctx.save(); ctx.globalAlpha = a * e.outK; ctx.translate(0, (1 - a) * 35 * k);
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, ph); ctx.clip();
        const [fx, fy, z] = crops[i], cw = W / z, ch = cw * ph / w;
        ctx.drawImage(frame, clamp(fx * W - cw / 2, 0, W - cw), clamp(fy * H - ch / 2, 0, H - ch), cw, ch, x, y, w, ph);
        if (i === n - 1 && P.speed === 'on') { ctx.strokeStyle = 'rgba(0,0,0,.55)'; const r = rand(4), cx = x + w / 2, cy = y + ph / 2; for (let j = 0; j < 70; j++) { const an = r() * Math.PI * 2, r0 = Math.min(w, ph) * (.42 + r() * .1); ctx.lineWidth = (1 + r() * 3) * k; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); ctx.lineTo(cx + Math.cos(an) * w, cy + Math.sin(an) * w); ctx.stroke(); } }
        ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let dy = 0; dy < 160 * k; dy += 12 * k) for (let dx = 0; dx < 220 * k; dx += 12 * k) { ctx.beginPath(); ctx.arc(x + w - dx, y + dy, 3.4 * k * (1 - dx / (220 * k)), 0, 7); ctx.fill(); } // 網點
        ctx.restore();
        ctx.lineWidth = 9 * k; ctx.strokeStyle = '#111'; ctx.strokeRect(x, y, w, ph);
        if (texts[i]) {
          ctx.font = F(900, 46 * k, SANS); const tw = Math.min(w * .7, ctx.measureText(texts[i]).width), bw = tw + 60 * k, bh = 100 * k;
          const bx = i % 2 ? x + w - bw - 40 * k : x + 40 * k, by = y + 30 * k;
          ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 5 * k; ctx.beginPath(); ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, 7);
          ctx.moveTo(bx + bw * (i % 2 ? .3 : .7) - 18 * k, by + bh - 8 * k); ctx.lineTo(bx + bw * (i % 2 ? .25 : .75), by + bh + 45 * k); ctx.lineTo(bx + bw * (i % 2 ? .3 : .7) + 18 * k, by + bh - 8 * k);
          ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2 - 3 * k, bh / 2 - 3 * k, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(texts[i], bx + bw / 2, by + bh / 2 + 2 * k, w * .7);
        }
        ctx.restore();
      }
    },
  },

  // 10 VHS 錄影帶風
  vhsTape: {
    name: 'VHS 錄影帶', icon: '📼', cat: '剪輯風格', color: '#63B3ED', dur: 4, base: true,
    params: { label: T('左上字樣', 'PLAY ▶'), stamp: T('右下時間', 'AM 10:24  NOV.01 2026') },
    draw(e) {
      const { ctx, W, H, P, lt, frame } = e, k = W / 1080;
      const jump = (lt % 2.4) < .1 ? Math.sin(lt * 90) * 10 * k : 0; // 每 2–3 秒輕微跳格
      // 紅藍分離 2px
      const t = tmp(W, H); t.drawImage(frame, 0, 0); t.globalCompositeOperation = 'multiply'; t.fillStyle = '#FF0000'; t.fillRect(0, 0, W, H); t.globalCompositeOperation = 'source-over';
      ctx.drawImage(frame, -3 * k, jump); ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#00FFFF'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(t.canvas, 3 * k, jump); ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,.15)'; for (let y = 0; y < H; y += 4 * k) ctx.fillRect(0, y, W, 1.5 * k); // 掃描線
      if (jump) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, H * ((lt * 7) % 1), W, 26 * k); }
      grain(ctx, W, H, .12, lt);
      ctx.save(); ctx.globalAlpha = e.outK; ctx.fillStyle = '#fff'; shadow(ctx, 6 * k, 'rgba(0,0,0,.6)', 0); ctx.font = F(400, 72 * k, VT); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillText(P.label, 70 * k, 220 * k); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.font = F(400, 56 * k, VT); ctx.fillText(P.stamp, W - 70 * k, H - 440 * k); ctx.restore();
    },
  },

  // 11 剪報拼貼風
  clippingCollage: {
    name: '剪報拼貼', icon: '✂️', cat: '剪輯風格', color: '#D4A373', dur: 3.5, ai: P => P.outline === 'on',
    params: { title: T('標題（每個字一張紙片）', '這很重要'), outline: S('人物白色描邊', 'on', ON_OFF), y: R('垂直位置', .16, .05, .8) },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      if (P.outline === 'on') { const p = e.person(); if (p) { ctx.save(); ctx.globalAlpha = outK; ctx.drawImage(outlined(p, '#fff', 10 * k), 0, 0); ctx.restore(); } }
      const chars = [...String(P.title || '')].filter(c => c.trim()); if (!chars.length) return;
      const bgs = ['#FFFFFF', '#111111', '#FFB6C8', '#C8A27A'], fgs = ['#111', '#fff', '#111', '#2B1B0E'];
      const fams = [SERIF, SANS, '"Archivo Black",' + SANS, '"Playfair Display",' + SERIF, MARKER];
      const sz = Math.min(170 * k, W * .9 / chars.length), r = rand(8);
      let x = W / 2 - sz * chars.length / 2;
      chars.forEach((c, i) => {
        const a = easeOut((lt - i * .08) / .3); const rot = (r() - .5) * .22, dy = (r() - .5) * 26 * k, bi = (i + Math.floor(r() * 2)) % 4;
        if (a <= 0) { x += sz; return; }
        ctx.save(); ctx.globalAlpha *= a * outK; ctx.translate(x + sz / 2, P.y * H + dy + (1 - a) * 30 * k); ctx.rotate(rot);
        shadow(ctx, 10 * k, 'rgba(0,0,0,.3)', 4 * k); ctx.fillStyle = bgs[bi]; ctx.fillRect(-sz * .46, -sz * .55, sz * .92, sz * 1.1); noShadow(ctx);
        ctx.fillStyle = fgs[bi]; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = F(900, sz * .72, fams[i % fams.length]); ctx.fillText(c, 0, sz * .04);
        ctx.fillStyle = 'rgba(255,250,220,.55)'; ctx.save(); ctx.translate(-sz * .38, -sz * .52); ctx.rotate(-.6); ctx.fillRect(-sz * .2, -sz * .07, sz * .4, sz * .14); ctx.restore(); // 膠帶
        ctx.restore(); x += sz;
      });
    },
  },

  // 12 大字報風
  bigPoster: {
    name: '大字報', icon: '📢', cat: '剪輯風格', color: '#FFD60A', dur: 2.5,
    params: { text: TA('大字（一行 2–4 字）', '不要\n再拖了'), scheme: S('配色', 'yellow', [['yellow', '黑字黃底'], ['red', '白字紅底']]), pos: S('位置', 'top', [['top', '上半'], ['bottom', '下半']]) },
    draw(e) {
      const { ctx, W, H, P, lt, outK, frame } = e, k = W / 1080;
      // 重點詞跳出時畫面放大 3%（0.5 秒內放大再回來）
      if (lt < .5) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1 + .03 * Math.sin(Math.PI * clamp(lt / .5)), 1 + .03 * Math.sin(Math.PI * clamp(lt / .5))); ctx.translate(-W / 2, -H / 2); ctx.drawImage(frame, 0, 0); ctx.restore(); }
      const rows = lns(P.text); if (!rows.length) return;
      const bg = P.scheme === 'red' ? '#E53935' : '#FFD60A', fg = P.scheme === 'red' ? '#fff' : '#111';
      const px = W / 4, lh = px * 1.12; let y = P.pos === 'top' ? 260 * k : H - 440 * k - rows.length * lh;
      rows.forEach((l, i) => {
        ctx.save(); ctx.globalAlpha *= outK; enter(ctx, lt, i * .1, k, .45);
        const fs = fitF(ctx, l, 900, SANS, W * .9, px), tw = ctx.measureText(l).width;
        ctx.fillStyle = bg; ctx.fillRect(W / 2 - tw / 2 - 24 * k, y + i * lh, tw + 48 * k, fs * 1.08);
        ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l, W / 2, y + i * lh + fs * .56); ctx.restore();
      });
    },
  },

  // 13 電影寬銀幕風
  cinemascope: {
    name: '電影寬銀幕', icon: '🎬', cat: '剪輯風格', color: '#2D3748', dur: 4,
    params: { title: T('開頭片名（英文）', 'THE EDIT'), sub: T('電影字幕', '有些故事，值得被好好剪一次'), bar: R('黑邊高度', .14, .05, .3), fade: S('頭尾淡入淡出黑場', 'on', ON_OFF) },
    draw(e) {
      const { ctx, W, H, P, lt, dur } = e, k = W / 1080, b = P.bar * H;
      const bk = easeOut(lt / .5) * clamp((dur - lt) / .4);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, b * bk); ctx.fillRect(0, H - b * bk, W, b * bk);
      if (P.fade === 'on') { const f = Math.max(1 - clamp(lt / .6), 1 - clamp((dur - lt) / .6)); if (f > 0) { ctx.fillStyle = `rgba(0,0,0,${f})`; ctx.fillRect(0, 0, W, H); } }
      if (P.title && lt < 2.6) { ctx.save(); ctx.globalAlpha = easeOut((lt - .3) / .5) * clamp((2.6 - lt) / .5); ctx.fillStyle = '#fff'; ctx.font = F(400, 96 * k, '"DM Serif Display",' + SERIF); ctx.textBaseline = 'middle'; spaced(ctx, P.title.toUpperCase(), W / 2, H * .45, 22 * k); ctx.restore(); }
      if (P.sub) { ctx.save(); ctx.globalAlpha = easeOut((lt - .4) / .4) * e.outK; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const fs = fitF(ctx, P.sub, 400, SANS, W * .86, 38 * k * subK(e)); ctx.fillText(P.sub, W / 2, safeY(e, H - b / 2, fs * 1.6)); ctx.restore(); }
    },
  },

  // 14 Y2K 亮片風
  y2kSparkle: {
    name: 'Y2K 亮片', icon: '✨', cat: '剪輯風格', color: '#D6BCFA', dur: 3.5,
    params: { text: T('鉻銀大字', 'SO CUTE'), border: S('糖果色邊框', 'on', ON_OFF), y: R('垂直位置', .2, .08, .85) },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      ctx.save(); ctx.globalAlpha *= outK;
      if (P.border === 'on') { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#FF9FD8'); g.addColorStop(.5, '#C6A0FF'); g.addColorStop(1, '#8FD3FF'); ctx.strokeStyle = g; ctx.lineWidth = 26 * k; rr(ctx, 13 * k, 13 * k, W - 26 * k, H - 26 * k, 50 * k); ctx.stroke(); }
      ctx.save(); enter(ctx, lt, 0, k); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const px = fitF(ctx, P.text, 900, '"Archivo Black",' + INTER, W * .86, 170 * k), y = P.y * H;
      const g = ctx.createLinearGradient(0, y - px / 2, 0, y + px / 2);
      [[0, '#FFFFFF'], [.35, '#B8C2CC'], [.5, '#5B6570'], [.55, '#E8EEF3'], [1, '#8A949E']].forEach(([o, c]) => g.addColorStop(o, c));
      ctx.lineWidth = 10 * k; ctx.strokeStyle = '#FF7FCF'; ctx.lineJoin = 'round'; shadow(ctx, 30 * k, 'rgba(198,160,255,.8)', 0); ctx.strokeText(P.text, W / 2, y); noShadow(ctx);
      ctx.fillStyle = g; ctx.fillText(P.text, W / 2, y); ctx.restore();
      const r = rand(Math.floor(lt / .3) + 1); // 每 0.3 秒換位置
      for (let i = 0; i < 7; i++) { const s = (20 + r() * 40) * k, tw = Math.abs(Math.sin(lt * 9 + i)); sparkle(ctx, r() * W, r() * H * .9, s * (.5 + tw * .5), i % 2 ? '#FFFFFF' : '#FFE4F6'); }
      ctx.restore();
    },
  },

  // 15 手寫筆記風
  handwrittenNote: {
    name: '手寫筆記', icon: '🖍️', cat: '剪輯風格', color: '#FEF3C7', dur: 3,
    params: { text: T('字幕（*星號* = 螢光筆重點）', '剪片最重要的是*節奏感*'), arrow: S('手繪箭頭', 'on', ON_OFF), y: R('垂直位置', .76, .2, .9), size: R('字體大小', 56, 36, 90, 1) },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      const segs = parseMarks(P.text); if (!segs.length) return;
      const px = P.size * k * subK(e); ctx.font = F(700, px, WENKAI);
      let ms = measureSegs(ctx, segs), tw = ms.reduce((a, g) => a + g.w, 0);
      if (tw > W * .8) { ctx.font = F(700, px * W * .8 / tw, WENKAI); ms = measureSegs(ctx, segs); tw = W * .8; }
      const nh0 = px * 2.1, y = safeY(e, P.y * H, nh0 + 40 * k), nw = tw + 90 * k, nh = nh0, nx = W / 2 - nw / 2;
      ctx.save(); ctx.globalAlpha *= outK; enter(ctx, lt, 0, k);
      ctx.save(); ctx.translate(W / 2, y); ctx.rotate(-.012); shadow(ctx, 16 * k, 'rgba(0,0,0,.25)', 5 * k); ctx.fillStyle = '#F7EEDC'; ctx.fillRect(-nw / 2, -nh / 2, nw, nh); ctx.restore();
      let x = W / 2 - tw / 2; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const hl = clamp((lt - .35) / .3); // 螢光筆從左往右刷出 0.3 秒
      for (const g of ms) {
        if (g.b && hl > 0) { ctx.save(); ctx.fillStyle = 'rgba(255,224,60,.7)'; ctx.translate(x, y + px * .12); ctx.rotate(-.02); ctx.fillRect(-6 * k, -px * .36, (g.w + 12 * k) * hl, px * .66); ctx.restore(); }
        ctx.fillStyle = '#4A3222'; ctx.fillText(g.t, x, y); x += g.w;
      }
      if (P.arrow === 'on') {
        const a = clamp((lt - .6) / .4); ctx.strokeStyle = '#E8553F'; ctx.lineWidth = 6 * k; ctx.lineCap = 'round';
        const sx = nx + nw + 10 * k, sy = y - nh * 1.4, ex = nx + nw - 30 * k, ey = y - nh * .55;
        if (a > 0) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + 60 * k, lerp(sy, ey, .5), lerp(sx, ex, a), lerp(sy, ey, a)); ctx.stroke(); }
        if (a >= 1) { ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + 6 * k, ey - 34 * k); ctx.moveTo(ex, ey); ctx.lineTo(ex + 32 * k, ey - 14 * k); ctx.stroke(); }
      }
      ctx.restore();
    },
  },

  // 16 黑白高反差風
  monoContrast: {
    name: '黑白高反差', icon: '⚫', cat: '剪輯風格', color: '#A0AEC0', dur: 2.5, base: true,
    params: { text: T('字幕（*星號* = 彩色重點）', '只有*你*能決定'), mark: C('重點色', '#D2603A', ['#D2603A', '#FF5C8A', '#F5A623', '#E53935']), y: R('垂直位置', .74, .2, .9), size: R('字體大小', 58, 36, 96, 1) },
    draw(e) {
      const { ctx, W, H, P, frame } = e;
      ctx.drawImage(frame, 0, 0); mono(ctx, W, H);
      ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = .35; ctx.drawImage(ctx.canvas, 0, 0); ctx.restore(); // 對比約 1.25
      mono(ctx, W, H);
      caption(ctx, e, P.text, { px: P.size, weight: 900, y: P.y, bar: 'rgba(0,0,0,.85)', barR: 0, mark: P.mark });
    },
  },

  // 17 彩色描邊風
  colorOutline: {
    name: '彩色描邊／換背景', icon: '🟢', cat: '剪輯風格', color: '#68D391', dur: 3, base: true, ai: () => true,
    params: {
      text: T('字幕', '這招真的很好用'),
      color: S('描邊顏色', 'cycle', [['cycle', '粉綠藍輪替'], ['#FF7FB0', '粉'], ['#5EE38A', '綠'], ['#5DB7FF', '藍'], ['none', '不描邊']]),
      bg: S('背景', 'dots', [['dots', '點點'], ['solid', '純色'], ['image', '自訂圖片'], ['blur', '原畫面模糊']]),
      bgImage: IMG('自訂背景圖（上傳後自動套用）', { autoSet: { bg: 'image' } }),
      bgColor: C('背景色', '#FFF4D6', ['#FFF4D6', '#E9E4FF', '#DFF7EA', '#111111']),
      sub: S('字幕膠囊', 'on', ON_OFF),
      size: R('字幕大小', 52, 32, 90, 1), y: R('字幕垂直位置', .74, .2, .9),
    },
    draw(e) {
      const { ctx, W, H, P, lt, frame } = e, k = W / 1080;
      const col = P.color === 'cycle' ? ['#FF7FB0', '#5EE38A', '#5DB7FF'][Math.floor((e.time || lt) / 2) % 3] : P.color;
      ctx.fillStyle = P.bgColor; ctx.fillRect(0, 0, W, H);
      if (P.bg === 'image' && P.bgImage) drawCover(ctx, P.bgImage, 0, 0, W, H);
      else if (P.bg === 'blur' || P.bg === 'image') ctx.drawImage(blurred(frame, 18), 0, 0, W, H);
      else if (P.bg === 'dots') { ctx.fillStyle = 'rgba(0,0,0,.08)'; for (let y = 0; y < H; y += 46 * k) for (let x = (y / (46 * k)) % 2 ? 23 * k : 0; x < W; x += 46 * k) { ctx.beginPath(); ctx.arc(x, y, 7 * k, 0, 7); ctx.fill(); } }
      const p = e.person();
      if (p) { shadow(ctx, 24 * k, 'rgba(0,0,0,.2)', 8 * k); ctx.drawImage(col === 'none' ? p : outlined(p, col, 12 * k), 0, 0); noShadow(ctx); } else ctx.drawImage(frame, 0, 0);
      if (P.sub === 'on') caption(ctx, e, P.text, { px: P.size, weight: 900, y: P.y, bar: col === 'none' ? 'rgba(0,0,0,.6)' : col, barR: 40 * k, color: col === 'none' ? '#fff' : '#111' });
    },
  },

  // 18 Podcast 訪談風
  podcastTalk: {
    name: 'Podcast 訪談', icon: '🎙️', cat: '剪輯風格', color: '#9AE6B4', dur: 6,
    params: { show: T('節目名稱', '創作者茶水間'), ep: T('集數', 'EP.24'), name: T('說話者名字', '艾瑞'), role: T('身分', '短影音創作者'), accent: C('重點色', '#F5A623', ['#F5A623', '#FF5C8A', '#7C5CFF', '#2ECC71']) },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      ctx.save(); ctx.globalAlpha *= outK;
      // 上方節目條
      ctx.save(); enter(ctx, lt, 0, k); ctx.font = F(700, 34 * k, SANS); const sw = ctx.measureText(P.show).width + 200 * k;
      ctx.fillStyle = 'rgba(15,15,18,.78)'; rr(ctx, W / 2 - sw / 2, 230 * k, sw, 76 * k, 38 * k); ctx.fill();
      ctx.fillStyle = P.accent; rr(ctx, W / 2 - sw / 2 + 12 * k, 242 * k, 104 * k, 52 * k, 26 * k); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = F(800, 26 * k, INTER); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(P.ep, W / 2 - sw / 2 + 64 * k, 269 * k);
      ctx.fillStyle = '#fff'; ctx.font = F(700, 34 * k, SANS); ctx.textAlign = 'left'; ctx.fillText(P.show, W / 2 - sw / 2 + 140 * k, 269 * k); ctx.restore();
      // 名牌：開頭滑入、停 3 秒後收起
      const inK = easeOut((lt - .2) / .45), outN = easeInOut((lt - 3.65) / .45), slide = inK - outN;
      if (slide > 0) {
        const nx = lerp(-700 * k, 60 * k, slide), ny = H - 640 * k;
        ctx.fillStyle = P.accent; ctx.fillRect(nx, ny, 10 * k, 130 * k);
        ctx.fillStyle = 'rgba(15,15,18,.85)'; ctx.fillRect(nx + 10 * k, ny, 560 * k, 130 * k);
        ctx.fillStyle = '#fff'; ctx.font = F(900, 50 * k, SANS); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(P.name, nx + 44 * k, ny + 46 * k, 500 * k);
        ctx.fillStyle = '#bbb'; ctx.font = F(500, 30 * k, SANS); ctx.fillText(P.role, nx + 44 * k, ny + 96 * k, 500 * k);
      }
      // 聲波：跟著聲音跳
      const bands = e.audioBands?.(), n = 36, bw = (W - 200 * k) / n;
      for (let i = 0; i < n; i++) {
        let v = bands ? bands[Math.floor(2 + i * (bands.length * .45) / n)] / 255 : 0;
        if (!bands) v = .25 + .25 * Math.abs(Math.sin(lt * 6 + i * .7)) * Math.abs(Math.sin(lt * 2.3 + i));
        const h = (12 + v * 110) * k, x = 100 * k + i * bw;
        ctx.fillStyle = i % 6 === 0 ? P.accent : 'rgba(255,255,255,.9)'; rr(ctx, x, H - 470 * k - h / 2, bw * .55, h, bw * .27); ctx.fill();
      }
      ctx.restore();
    },
  },

  // 19 分屏對比風（上下或左右，兩邊都可以換成自己的圖片或影片）
  splitCompare: {
    name: '分屏對比', icon: '🌓', cat: '剪輯風格', color: '#FEB2B2', dur: 4, base: true,
    params: {
      layout: S('分屏方向', 'v', [['v', '上下'], ['h', '左右']]),
      top: MEDIA('第一格（BEFORE）：圖片或影片（不選就用展示素材或黑白原片）'),
      bottom: MEDIA('第二格（AFTER）：圖片或影片（不選就用口播畫面）'),
      topLabel: T('第一格標籤', 'BEFORE'), bottomLabel: T('第二格標籤', 'AFTER'),
      circle: S('紅圈標出差異', 'on', ON_OFF), cx: R('紅圈水平位置', .5, .1, .9), cy: R('紅圈垂直位置', .75, .05, .95),
    },
    draw(e) {
      const { ctx, W, H, P, lt, frame } = e, k = W / 1080, v = P.layout !== 'h';
      const A = v ? [0, 0, W, H / 2] : [0, 0, W / 2, H], B = v ? [0, H / 2, W, H / 2] : [W / 2, 0, W / 2, H];
      // 第一格
      ctx.save(); ctx.beginPath(); ctx.rect(...A); ctx.clip();
      const src = ready(P.top) || e.brollLive || (e.hasBroll ? e.broll(0) : null);
      if (src) drawCover(ctx, src, ...A);
      else { drawCover(ctx, frame, ...A, .5, .35); mono(ctx, W, H); }
      ctx.restore();
      // 第二格
      ctx.save(); ctx.beginPath(); ctx.rect(...B); ctx.clip();
      drawCover(ctx, ready(P.bottom) || frame, ...B, .5, ready(P.bottom) ? .5 : .35);
      ctx.restore();
      ctx.fillStyle = '#fff';
      if (v) ctx.fillRect(0, H / 2 - 4 * k, W, 8 * k); else ctx.fillRect(W / 2 - 4 * k, 0, 8 * k, H);
      const label = (t, x, y, d) => { if (!t) return; ctx.save(); ctx.globalAlpha *= e.outK; enter(ctx, lt, d, k); ctx.font = F(800, 38 * k, INTER); const w = ctx.measureText(t).width + 50 * k; ctx.fillStyle = 'rgba(0,0,0,.7)'; rr(ctx, x, y, w, 70 * k, 35 * k); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + 25 * k, y + 36 * k); ctx.restore(); };
      if (v) { label(P.topLabel, 50 * k, 250 * k, 0); label(P.bottomLabel, 50 * k, H / 2 + 40 * k, .1); }
      else { label(P.topLabel, 30 * k, 250 * k, 0); label(P.bottomLabel, W / 2 + 30 * k, 250 * k, .1); }
      if (P.circle === 'on') {
        const a = clamp((lt - .7) / .5); if (a > 0) { ctx.save(); ctx.strokeStyle = '#FF2D2D'; ctx.lineWidth = 9 * k; ctx.lineCap = 'round'; ctx.beginPath(); const x = P.cx * W, y = P.cy * H; for (let i = 0; i <= 50 * a; i++) { const an = -1 + i / 50 * (Math.PI * 2 + .4); const X = x + Math.cos(an) * 150 * k * (1 + Math.sin(i * .4) * .03), Y = y + Math.sin(an) * 100 * k; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke(); ctx.restore(); }
      }
    },
  },

  // 20 便利貼風
  stickyNote: {
    name: '便利貼', icon: '🗒️', cat: '剪輯風格', color: '#FAF089', dur: 5,
    params: { notes: TA('便利貼（一行一張，最後一張是行動呼籲）', '光線要充足\n背景要乾淨\n剪掉停頓\n留言「剪片」拿模板'), corner: S('位置', 'right', [['right', '靠右'], ['left', '靠左']]), y: R('垂直位置', .14, .1, .6), size: R('便利貼大小', 230, 160, 300, 1) },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e, k = W / 1080;
      const notes = lns(P.notes); if (!notes.length) return;
      const cols = ['#FFF176', '#FFB3C7', '#9ED8FF'], per = Math.max(.4, (e.dur - .6) / notes.length), s = P.size * k;
      notes.forEach((t, i) => {
        const a = easeOut((lt - i * per) / .45); if (a <= 0) return; // 從上方掉下來（不彈跳）
        const col = i % 2, row = Math.floor(i / 2), last = i === notes.length - 1;
        const bx = P.corner === 'right' ? W - 60 * k - s - col * (s + 24 * k) : 60 * k + col * (s + 24 * k);
        const by = P.y * H + row * (s + 30 * k);
        ctx.save(); ctx.globalAlpha *= outK * clamp(a * 1.5); ctx.translate(bx + s / 2, by + s / 2 - (1 - a) * 220 * k); ctx.rotate(((i * 37) % 7 - 3) * Math.PI / 180);
        shadow(ctx, 14 * k, 'rgba(0,0,0,.28)', 6 * k); ctx.fillStyle = last ? '#FF8A65' : cols[i % 3]; ctx.fillRect(-s / 2, -s / 2, s, s); noShadow(ctx);
        ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(-s / 2, -s / 2, s, 30 * k);
        ctx.fillStyle = '#2B2B2B'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = F(700, (last ? 40 : 46) * k * s / (250 * k), WENKAI);
        const ls = wrap(ctx, t, s * .8).slice(0, 4); ls.forEach((l, j) => ctx.fillText(l, 0, 10 * k + (j - (ls.length - 1) / 2) * 54 * k * s / (250 * k)));
        ctx.restore();
      });
    },
  },
};
