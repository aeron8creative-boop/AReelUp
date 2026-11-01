// ───────────────────────── 特效庫 ─────────────────────────
// 每個特效：{ name, icon, cat, color, dur, base, ai(params), params, draw(e) }
// base=true 代表會整個重畫底圖（先畫），其餘為疊加層。
// draw(e) 的 e：ctx, W, H, frame(底圖畫布), person()(去背人像畫布或 null),
//   bbox(人像外框), thumb(i), lt(本段已播秒數), dur, p(0..1), inK(進場 0..1), outK(出場 1..0), P(參數)

export const FONTS = {
  serif: '"Playfair Display","Noto Serif TC",serif',
  display: '"DM Serif Display","Noto Serif TC",serif',
  hand: '"Caveat","Noto Sans TC",cursive',
  bold: '"Archivo Black","Noto Sans TC",sans-serif',
  mono: '"Space Mono","Noto Sans TC",monospace',
  sans: '"Noto Sans TC",sans-serif',
  zhSerif: '"Noto Serif TC","Source Han Serif TC","Songti TC",serif', // 思源宋體
  enSans: '"Inter","Helvetica Neue",Arial,sans-serif',                // 黑體英文
  wenkai: '"LXGW WenKai TC","Noto Sans TC",cursive',                   // 霞鶩文楷
  anton: '"Anton","Noto Sans TC",sans-serif',
  marker: '"Permanent Marker","Caveat",cursive',
  bodoni: '"Bodoni Moda","Playfair Display",serif',
  vt323: '"VT323",monospace',
};
const FONT_WEIGHT = { serif: 'italic 700', display: '400', hand: '700', bold: '900', mono: '700', sans: '900', zhSerif: '700', enSans: '700', wenkai: '700', anton: '400', marker: '400', bodoni: '700', vt323: '400' };
export const font = (key, px) => `${FONT_WEIGHT[key] || '700'} ${Math.round(px)}px ${FONTS[key] || FONTS.sans}`;

// ── 工具 ──
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = t => (t = clamp(t), t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeBack = t => { t = clamp(t); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;
function rand(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// 把來源以 cover 方式畫進矩形
function drawCover(ctx, src, x, y, w, h, fx = .5, fy = .5) {
  const sw = src.width || src.videoWidth, sh = src.height || src.videoHeight;
  if (!sw || !sh) return;
  const s = Math.max(w / sw, h / sh), cw = w / s, ch = h / s;
  ctx.drawImage(src, clamp((sw - cw) * fx, 0, sw - cw), clamp((sh - ch) * fy, 0, sh - ch), cw, ch, x, y, w, h);
}
function fitFont(ctx, text, key, maxW, maxPx) {
  let px = maxPx; ctx.font = font(key, px);
  const w = ctx.measureText(text).width;
  if (w > maxW) { px = px * maxW / w; ctx.font = font(key, px); }
  return px;
}
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
const words = s => String(s || '').trim().split(/\s+/).filter(Boolean);
const lum = hex => { const n = parseInt(String(hex).slice(1), 16); return ((n >> 16 & 255) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114) / 255; };
// "今天教你用 *AI* 剪片" → [{t:'今天教你用 ',b:false},{t:'AI',b:true},{t:' 剪片',b:false}]
const parseMarks = s => String(s || '').split(/\*([^*]+)\*/).map((t, i) => ({ t, b: i % 2 === 1 })).filter(x => x.t);
const fmtNum = n => Math.round(n).toLocaleString('en-US');

// 便宜又 Safari 相容的模糊：先縮小再放大
const _blur = document.createElement('canvas');
function blurred(src, factor = 14) {
  const w = Math.max(8, Math.round(src.width / factor)), h = Math.max(8, Math.round(src.height / factor));
  if (_blur.width !== w || _blur.height !== h) { _blur.width = w; _blur.height = h; }
  const c = _blur.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(src, 0, 0, w, h);
  return _blur;
}
function shadow(ctx, blur = 14, color = 'rgba(0,0,0,.35)', oy = 4) {
  ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetY = oy;
}
function noShadow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }

// ── 參數型別小幫手 ──
const T = (label, value) => ({ type: 'text', label, value });
const TA = (label, value) => ({ type: 'textarea', label, value });
const C = (label, value, swatches) => ({ type: 'color', label, value, swatches });
const S = (label, value, options) => ({ type: 'select', label, value, options });
const R = (label, value, min, max, step = .01) => ({ type: 'range', label, value, min, max, step });
const IMG = (label, extra) => ({ type: 'image', label, value: null, ...extra });
const IMGS = label => ({ type: 'images', label, value: null });
const MEDIA = label => ({ type: 'media', label, value: null }); // 圖片或影片
const TEXT_SW = ['#F5E27A', '#FFFFFF', '#111111', '#FF5C8A', '#D2603A', '#7C5CFF', '#4FD1C5'];
const FONT_OPTS = [['zhSerif', '思源宋體'], ['enSans', '黑體英文'], ['wenkai', '霞鶩文楷'], ['serif', '優雅斜體'], ['display', '雜誌襯線'], ['bold', '粗黑'], ['hand', '手寫'], ['mono', '打字機'], ['sans', '黑體']];

// ═════════════════════════ 特效 ═════════════════════════
export const EFFECTS = {

  // 1. 金句字幕（"now." 那種）
  caption: {
    name: '金句字幕', icon: 'Aa', cat: '文字', color: '#F5E27A', dur: 2,
    params: {
      text: T('文字（空格分開會逐字跳出）', 'now.'),
      fontKey: S('字體', 'serif', FONT_OPTS),
      color: C('顏色', '#F5E27A', TEXT_SW),
      size: R('大小', .14, .06, .28),
      y: R('垂直位置', .6, .1, .9),
    },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e;
      const ws = words(P.text); if (!ws.length) return;
      const px = P.size * W;
      ctx.font = font(P.fontKey, px);
      const space = px * .28, maxW = W * .88;
      // 斷行
      const rows = [[]]; let rowW = 0;
      ws.forEach((w, i) => {
        const ww = ctx.measureText(w).width;
        if (rowW + ww > maxW && rows[rows.length - 1].length) { rows.push([]); rowW = 0; }
        rows[rows.length - 1].push({ w, ww, i }); rowW += ww + space;
      });
      const step = Math.min(.28, (e.dur * .6) / ws.length);
      const lh = px * 1.1, y0 = P.y * H - (rows.length - 1) * lh / 2;
      ctx.textBaseline = 'middle';
      rows.forEach((row, ri) => {
        const total = row.reduce((s, o) => s + o.ww, 0) + space * (row.length - 1);
        let x = (W - total) / 2;
        row.forEach(o => {
          const a = clamp((lt - o.i * step) / .22);
          if (a > 0) {
            const s = lerp(1.35, 1, easeOut(a));
            ctx.save();
            ctx.globalAlpha = a * outK;
            ctx.translate(x + o.ww / 2, y0 + ri * lh + (1 - easeOut(a)) * px * .15);
            ctx.scale(s, s);
            shadow(ctx, px * .25, 'rgba(0,0,0,.35)', px * .04);
            ctx.fillStyle = P.color; ctx.textAlign = 'center';
            ctx.fillText(o.w, 0, 0);
            ctx.restore();
          }
          x += o.ww + space;
        });
      });
    },
  },

  // 2. 人後大標（"Claude edited"，字在人後面）
  titleBehind: {
    name: '人後大標', icon: 'T', cat: 'AI 去背', color: '#F3EE9A', dur: 3,
    ai: P => P.layer !== 'front',
    params: {
      line1: T('第一行', 'Claude'),
      line2: T('第二行', 'edited'),
      side: T('側邊小字（可留空）', 'all these reels'),
      fontKey: S('字體', 'display', FONT_OPTS),
      color: C('顏色', '#F3EE9A', TEXT_SW),
      layer: S('圖層', 'split', [['split', '第一行在人後'], ['behind', '全部在人後'], ['front', '全部在前']]),
      y: R('垂直位置', .17, .05, .7),
    },
    draw(e) {
      const { ctx, W, H, P, inK, outK, lt } = e;
      const t1 = easeOut(clamp(lt / .5)), t2 = easeOut(clamp((lt - .2) / .5)), t3 = easeOut(clamp((lt - .45) / .5));
      const y = P.y * H;
      const draw1 = () => {
        if (!P.line1) return;
        const px = fitFont(ctx, P.line1, P.fontKey, W * .96, W * .3);
        ctx.save(); ctx.globalAlpha = t1 * outK; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        shadow(ctx, 20, 'rgba(0,0,0,.25)', 6); ctx.fillStyle = P.color;
        ctx.fillText(P.line1, W * .02 - (1 - t1) * W * .4, y + px * .75); ctx.restore();
        e._l1 = px;
      };
      const draw2 = () => {
        if (!P.line2) return;
        const px = fitFont(ctx, P.line2, P.fontKey, W * .7, W * .24);
        const off = (e._l1 || W * .25) * .75 + px * .85;
        ctx.save(); ctx.globalAlpha = t2 * outK; ctx.textAlign = 'right';
        shadow(ctx, 20, 'rgba(0,0,0,.25)', 6); ctx.fillStyle = P.color;
        ctx.fillText(P.line2, W * .97 + (1 - t2) * W * .4, y + off); ctx.restore();
      };
      const drawSide = () => {
        const ws = words(P.side); if (!ws.length) return;
        const px = W * .085; ctx.save(); ctx.font = font('hand', px); ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
        shadow(ctx, 10, 'rgba(0,0,0,.4)', 3);
        ws.forEach((w, i) => {
          const a = clamp((lt - .45 - i * .15) / .25); if (a <= 0) return;
          ctx.globalAlpha = a * outK; ctx.fillText(w, W * .06, y + (e._l1 || W * .25) * 1.55 + i * px * 1.05);
        });
        ctx.restore();
      };
      e._l1 = 0;
      // 先量第一行大小供第二行定位
      fitFont(ctx, P.line1 || 'A', P.fontKey, W * .96, W * .3); e._l1 = P.line1 ? parseFloat(ctx.font.match(/(\d+)px/)[1]) : 0;
      const person = P.layer !== 'front' ? e.person() : null;
      if (P.layer === 'front' || !person) { draw1(); draw2(); }
      else if (P.layer === 'split') { draw1(); ctx.drawImage(person, 0, 0); draw2(); }
      else { draw1(); draw2(); ctx.drawImage(person, 0, 0); }
      if (t3 > 0) drawSide();
    },
  },

  // 雙語字幕：中文思源宋體 + 英文黑體，黑色襯底、陰影、品牌色重點
  subtitle: {
    name: '雙語字幕', icon: '💬', cat: '文字', color: '#FFFFFF', dur: 2.5,
    params: {
      zh: T('中文（用 *星號* 包住的字會套品牌色）', '今天教你用 *AI* 剪片'),
      en: T('英文（可留空）', 'Edit your reels with *AI*'),
      order: S('排列', 'zh', [['zh', '中文在上'], ['en', '英文在上']]),
      zhSize: R('中文字體大小', .062, .035, .12),
      enSize: R('英文字體大小', .036, .02, .07),
      color: C('文字顏色', '#FFFFFF', ['#FFFFFF', '#F5E27A', '#111111']),
      box: S('黑色襯底', 'on', [['on', '開'], ['off', '關']]),
      boxOpacity: R('襯底不透明度（預設 40%）', .4, 0, 1),
      shadow: S('文字陰影', 'on', [['on', '開'], ['off', '關']]),
      brandStyle: S('品牌色區塊', 'text', [['text', '重點字變色'], ['box', '重點字底色'], ['bar', '英文整條品牌色'], ['none', '不使用']]),
      y: R('垂直位置', .8, .1, .93),
    },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e;
      const brand = e.brand || '#F5A623';
      const rows = [];
      const zh = { segs: parseMarks(P.zh), key: 'zhSerif', px: P.zhSize * W, lang: 'zh' };
      const en = { segs: parseMarks(P.en), key: 'enSans', px: P.enSize * W, lang: 'en' };
      (P.order === 'en' ? [en, zh] : [zh, en]).forEach(r => r.segs.length && rows.push(r));
      if (!rows.length) return;
      const padX = W * .04, padY = W * .022, gap = W * .014, maxW = W * .92 - padX * 2;
      // 量寬度，太長就縮小
      for (const r of rows) {
        ctx.font = font(r.key, r.px);
        let w = r.segs.reduce((s, g) => s + ctx.measureText(g.t).width, 0);
        if (w > maxW) { r.px *= maxW / w; ctx.font = font(r.key, r.px); w = maxW; }
        r.w = w; r.h = r.px * (r.lang === 'zh' ? 1.3 : 1.35);
      }
      const bw = Math.max(...rows.map(r => r.w)) + padX * 2;
      const bh = rows.reduce((s, r) => s + r.h, 0) + gap * (rows.length - 1) + padY * 2;
      const a = clamp(lt / .18) * outK, rise = (1 - easeOut(lt / .25)) * W * .02;
      const x0 = (W - bw) / 2, y0 = P.y * H - bh / 2 + rise;
      ctx.save(); ctx.globalAlpha = a;
      if (P.box === 'on' && P.boxOpacity > 0) {
        ctx.fillStyle = `rgba(0,0,0,${P.boxOpacity})`; rr(ctx, x0, y0, bw, bh, W * .02); ctx.fill();
      }
      let y = y0 + padY;
      for (const r of rows) {
        const cy = y + r.h / 2;
        if (P.brandStyle === 'bar' && r.lang === 'en') {
          ctx.fillStyle = brand; rr(ctx, (W - r.w) / 2 - W * .025, y - W * .004, r.w + W * .05, r.h + W * .008, W * .012); ctx.fill();
        }
        ctx.font = font(r.key, r.px); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        let x = (W - r.w) / 2;
        for (const g of r.segs) {
          const gw = ctx.measureText(g.t).width;
          let col = P.color;
          if (P.brandStyle === 'bar' && r.lang === 'en') col = lum(brand) > .6 ? '#111' : '#fff';
          if (g.b && P.brandStyle === 'text') col = brand;
          if (g.b && P.brandStyle === 'box') {
            noShadow(ctx); ctx.fillStyle = brand;
            rr(ctx, x - r.px * .12, cy - r.px * .62, gw + r.px * .24, r.px * 1.24, r.px * .15); ctx.fill();
            col = lum(brand) > .6 ? '#111' : '#fff';
          }
          if (P.shadow === 'on') shadow(ctx, r.px * .3, 'rgba(0,0,0,.65)', r.px * .05); else noShadow(ctx);
          ctx.fillStyle = col; ctx.fillText(g.t, x, cy);
          x += gw;
        }
        y += r.h + gap;
      }
      ctx.restore();
    },
  },

  // 3. 數位推近
  zoom: {
    name: '數位推近', icon: '🔍', cat: '鏡頭', color: '#9AE6B4', dur: 2.5, base: true,
    ai: P => P.focus === 'auto',
    params: {
      amount: R('放大倍率', 1.6, 1.1, 2.5),
      focus: S('對焦', 'auto', [['auto', '自動對臉'], ['center', '畫面中央']]),
      ui: S('取景框', 'on', [['on', '顯示'], ['off', '隱藏']]),
    },
    draw(e) {
      const { ctx, W, H, P, lt, dur, frame, bbox } = e;
      const k = easeInOut(lt / .6) * easeInOut((dur - lt) / .45);
      const s = 1 + (P.amount - 1) * k;
      let cx = W / 2, cy = H * .4;
      if (P.focus === 'auto' && bbox) { cx = bbox.x + bbox.w / 2; cy = bbox.y + Math.min(bbox.h, bbox.w * 1.4) * .3; }
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
      ctx.drawImage(frame, 0, 0); ctx.restore();
      if (P.ui !== 'on') return;
      const a = clamp(lt / .3) * clamp((dur - lt) / .3);
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = W * .006; ctx.lineCap = 'round';
      const x0 = W * .2, x1 = W * .8, y0 = H * .2, y1 = H * .62, L = W * .07;
      [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([x, y, dx, dy]) => {
        ctx.beginPath(); ctx.moveTo(x, y + L * dy); ctx.lineTo(x, y); ctx.lineTo(x + L * dx, y); ctx.stroke();
      });
      const label = `ZOOM ${Math.round(s * 100)}%`;
      ctx.font = font('mono', W * .028); const tw = ctx.measureText(label).width;
      const px = x0, py = y0 - W * .07;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(ctx, px, py, tw + W * .07, W * .05, W * .012); ctx.fill();
      ctx.fillStyle = (Math.floor(lt * 2) % 2) ? '#ff3b3b' : 'rgba(255,59,59,.3)';
      ctx.beginPath(); ctx.arc(px + W * .022, py + W * .025, W * .009, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, px + W * .042, py + W * .026);
      ctx.restore();
    },
  },

  // 4. 破框而出（九宮格拼貼，人從中間衝出）
  breakout: {
    name: '破框而出', icon: '🧩', cat: 'AI 去背', color: '#FBB6CE', dur: 3, base: true, ai: () => true,
    params: {
      word: T('中間大字', "it's"),
      fontKey: S('字體', 'bold', FONT_OPTS),
      stats: S('觀看數標籤', 'on', [['on', '顯示'], ['off', '隱藏']]),
    },
    draw(e) {
      const { ctx, W, H, P, lt, frame, outK } = e;
      const k = easeOut(lt / .55);
      const gap = W * .008, cols = 3;
      const topH = H * .27, midH = H * .44;
      const tileW = (W - gap * (cols - 1)) / cols;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      const views = ['1.6M', '22.6K', '1,831', '845K', '12.4K', '3.2M'];
      const tiles = [];
      for (let i = 0; i < 3; i++) tiles.push({ x: i * (tileW + gap), y: 0, h: topH });
      for (let i = 0; i < 3; i++) tiles.push({ x: i * (tileW + gap), y: topH + midH + gap * 2, h: H - topH - midH - gap * 2 });
      tiles.forEach((t, i) => {
        const a = easeBack((lt - .1 - i * .06) / .4);
        if (a <= 0) return;
        ctx.save(); ctx.translate(t.x + tileW / 2, t.y + t.h / 2); ctx.scale(a, a);
        drawCover(ctx, e.thumb(i + 1), -tileW / 2, -t.h / 2, tileW, t.h);
        if (P.stats === 'on' && i < 3) {
          ctx.font = font('sans', W * .03); ctx.fillStyle = '#fff'; shadow(ctx, 6, 'rgba(0,0,0,.6)', 1);
          ctx.textBaseline = 'bottom'; ctx.fillText('▶ ' + views[i], -tileW / 2 + W * .02, t.h / 2 - W * .02);
        }
        ctx.restore();
      });
      // 中間視窗：從全螢幕縮到中排
      const wy = lerp(0, topH + gap, k), wh = lerp(H, midH, k);
      ctx.save(); ctx.beginPath(); ctx.rect(0, wy, W, wh); ctx.clip(); ctx.drawImage(frame, 0, 0); ctx.restore();
      const person = e.person();
      if (person) ctx.drawImage(person, 0, 0);
      if (P.word) {
        const a = clamp((lt - .5) / .25);
        const px = fitFont(ctx, P.word, P.fontKey, W * .8, W * .2);
        ctx.save(); ctx.globalAlpha = a * outK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.translate(W / 2, topH + midH * .42); const s = lerp(1.4, 1, easeOut(a)); ctx.scale(s, s);
        shadow(ctx, px * .3, 'rgba(0,0,0,.45)', 4); ctx.fillStyle = '#fff'; ctx.fillText(P.word, 0, 0); ctx.restore();
      }
    },
  },

  // 6. 個人檔案卡
  profileCard: {
    name: '個人檔案卡', icon: '🪪', cat: '貼紙', color: '#FBD38D', dur: 3,
    params: {
      name: T('名稱', 'Caroline @ Solo Content Studio'),
      bio: T('簡介', 'Content App for Solopreneurs'),
      posts: T('貼文數', '124'), followers: T('粉絲數', '5099'), following: T('追蹤中', '67'),
      bubble: T('頭像泡泡', "Today's vibe..."),
      avatar: IMG('頭像（不選就用影片畫面）'),
      y: R('垂直位置', .6, .2, .85),
    },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e;
      const a = easeBack(lt / .55), k = easeOut((lt - .3) / 1);
      const cw = W * .92, ch = W * .36, x = (W - cw) / 2, y = P.y * H - ch / 2;
      ctx.save(); ctx.globalAlpha = clamp(a * 2) * outK;
      ctx.translate(W / 2, y + ch / 2 + (1 - a) * H * .2); ctx.rotate(-1.2 * Math.PI / 180); ctx.scale(lerp(.8, 1, a), lerp(.8, 1, a));
      ctx.translate(-W / 2, -(y + ch / 2));
      shadow(ctx, 30, 'rgba(0,0,0,.3)', 10); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, cw, ch); noShadow(ctx);
      // 膠帶
      ctx.save(); ctx.translate(W * .5, y); ctx.rotate(-.06); ctx.fillStyle = 'rgba(240,160,170,.8)';
      ctx.fillRect(-W * .09, -W * .03, W * .18, W * .06); ctx.restore();
      // 頭像
      const ar = W * .1, ax = x + W * .14, ay = y + ch * .55;
      ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, ar, 0, 7); ctx.clip();
      const g = ctx.createLinearGradient(ax - ar, ay - ar, ax + ar, ay + ar); g.addColorStop(0, '#f6c3b5'); g.addColorStop(1, '#d9573f');
      ctx.fillStyle = g; ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
      const src = P.avatar || e.thumb(0);
      drawCover(ctx, src, ax - ar, ay - ar, ar * 2, ar * 2, .5, .3); ctx.restore();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ax + ar * .75, ay + ar * .75, ar * .28, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = W * .005; ctx.beginPath();
      ctx.moveTo(ax + ar * .75 - ar * .13, ay + ar * .75); ctx.lineTo(ax + ar * .75 + ar * .13, ay + ar * .75);
      ctx.moveTo(ax + ar * .75, ay + ar * .75 - ar * .13); ctx.lineTo(ax + ar * .75, ay + ar * .75 + ar * .13); ctx.stroke();
      if (P.bubble) {
        ctx.font = font('sans', W * .026); const bw = ctx.measureText(P.bubble).width + W * .04;
        ctx.fillStyle = '#fff'; shadow(ctx, 8, 'rgba(0,0,0,.18)', 2);
        rr(ctx, ax - bw / 2, ay - ar - W * .065, bw, W * .06, W * .03); ctx.fill(); noShadow(ctx);
        ctx.fillStyle = '#555'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(P.bubble, ax, ay - ar - W * .035);
      }
      // 文字
      const tx = x + W * .3, tw = cw - W * .32;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#222';
      fitFont(ctx, P.name, 'sans', tw, W * .038); ctx.fillText(P.name, tx, y + ch * .24);
      fitFont(ctx, P.bio, 'sans', tw, W * .038); ctx.fillText(P.bio, tx, y + ch * .37);
      [[P.posts, 'posts'], [P.followers, 'followers'], [P.following, 'following']].forEach(([v, l], i) => {
        const n = parseFloat(String(v).replace(/,/g, ''));
        const sx = tx + i * tw / 3;
        ctx.font = font('sans', W * .045); ctx.fillStyle = '#111';
        ctx.fillText(isNaN(n) ? v : fmtNum(n * k), sx, y + ch * .66);
        ctx.font = `500 ${W * .034}px ${FONTS.sans}`; ctx.fillStyle = '#444'; ctx.fillText(l, sx, y + ch * .82);
      });
      ctx.restore();
    },
  },

  // 7. 筆記本拼貼（方格紙 + 圓形畫面 + 跳字）
  notebook: {
    name: '筆記本拼貼', icon: '📓', cat: '版面', color: '#F6AD55', dur: 3.5, base: true,
    params: {
      text: T('文字（空格分開）', 'but that is actually a bad idea'),
      color: C('字色', '#D2603A', TEXT_SW),
      doodle: C('塗鴉色', '#6FA39A', ['#6FA39A', '#7C5CFF', '#FF5C8A', '#111111']),
    },
    draw(e) {
      const { ctx, W, H, P, lt, frame } = e;
      ctx.fillStyle = '#f3f2ee'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 2;
      const gs = W / 12; ctx.beginPath();
      for (let x = 0; x <= W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y <= H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      // 半色調氣泡
      const ba = easeBack((lt - .3) / .5);
      if (ba > 0) {
        ctx.save(); ctx.translate(W * .83, H * .52); ctx.scale(ba, ba); ctx.rotate(-.2);
        const r = rand(7), pts = []; for (let i = 0; i < 14; i++) { const an = i / 14 * Math.PI * 2, rad = W * (.13 + r() * .03); pts.push([Math.cos(an) * rad * 1.15, Math.sin(an) * rad]); }
        ctx.fillStyle = '#f7ef9a'; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
        ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x * .82, y * .82) : ctx.moveTo(x * .82, y * .82)); ctx.closePath(); ctx.clip();
        ctx.fillStyle = '#111'; const d = W * .018;
        for (let y = -W * .2; y < W * .2; y += d) for (let x = -W * .2; x < W * .2; x += d) {
          const rr2 = d * .45 * (.4 + .6 * Math.abs(Math.sin(x * .03 + y * .05))); ctx.beginPath(); ctx.arc(x, y, rr2, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
      // 問號塗鴉
      ctx.save(); ctx.fillStyle = P.doodle; ctx.font = font('hand', W * .16); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      [[.8, .38, -.3], [.72, .47, .2], [.95, .43, .3], [.88, .3, -.1], [.68, .3, .4]].forEach(([x, y, r], i) => {
        const a = easeBack((lt - .4 - i * .1) / .35); if (a <= 0) return;
        ctx.save(); ctx.translate(x * W, y * H); ctx.rotate(r + Math.sin(lt * 2 + i) * .08); ctx.scale(a, a); ctx.fillText('?', 0, 0); ctx.restore();
      });
      ctx.restore();
      // 圓形畫面
      const ca = easeBack(lt / .5), cx = W * .43, cy = H * .45, R0 = W * .3;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(lt * 1.5) * .03); ctx.scale(ca, ca);
      shadow(ctx, 24, 'rgba(0,0,0,.25)', 8); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, R0 + W * .012, 0, 7); ctx.fill(); noShadow(ctx);
      ctx.beginPath(); ctx.arc(0, 0, R0, 0, 7); ctx.clip();
      const sz = W * .95; ctx.drawImage(frame, (W - sz) / 2, H * .38 - sz / 2, sz, sz, -R0, -R0, R0 * 2, R0 * 2);
      ctx.restore();
      // 跳字
      const slots = [
        { x: .04, y: .14, s: .16, f: 'mono' }, { x: .48, y: .22, s: .13, f: 'mono' }, { x: .05, y: .31, s: .15, f: 'mono' },
        { x: .44, y: .31, s: .08, f: 'mono' }, { x: .03, y: .72, s: .14, f: 'sans' }, { x: .15, y: .76, s: .13, f: 'hand' },
        { x: .48, y: .73, s: .11, f: 'mono' }, { x: .1, y: .84, s: .13, f: 'hand' }, { x: .5, y: .84, s: .12, f: 'mono' },
      ];
      const ws = words(P.text).slice(0, slots.length);
      const step = Math.min(.35, e.dur * .7 / Math.max(1, ws.length));
      ctx.fillStyle = P.color; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ws.forEach((w, i) => {
        const a = clamp((lt - i * step) / .15); if (a <= 0) return;
        const sl = slots[i]; ctx.save(); ctx.globalAlpha = a; ctx.translate(sl.x * W, sl.y * H);
        const s = lerp(1.25, 1, easeOut(a)); ctx.scale(s, s);
        fitFont(ctx, w, sl.f, W * (1 - sl.x - .03), sl.s * W); ctx.fillText(w, 0, 0); ctx.restore();
      });
    },
  },

  // 8. 打勾清單
  checklist: {
    name: '打勾清單', icon: '✅', cat: '貼紙', color: '#68D391', dur: 3.5,
    params: {
      title: T('標題', '今天的待辦'),
      items: TA('項目（一行一個）', '拍影片\n交給 Claude 剪\n發 Reels 🚀'),
      color: C('勾勾顏色', '#2ECC71', ['#2ECC71', '#FF5C8A', '#7C5CFF', '#F5A623']),
      y: R('垂直位置', .32, .1, .8),
    },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e;
      const its = lines(P.items); const a = easeBack(lt / .45);
      const rowH = W * .11, cw = W * .82, ch = W * .16 + its.length * rowH, x = (W - cw) / 2, y = P.y * H - ch / 2;
      ctx.save(); ctx.globalAlpha = clamp(a * 2) * outK;
      ctx.translate(W / 2, y + ch / 2); ctx.scale(lerp(.85, 1, a), lerp(.85, 1, a)); ctx.translate(-W / 2, -(y + ch / 2));
      shadow(ctx, 30, 'rgba(0,0,0,.3)', 10); ctx.fillStyle = 'rgba(255,255,255,.96)'; rr(ctx, x, y, cw, ch, W * .04); ctx.fill(); noShadow(ctx);
      ctx.fillStyle = '#111'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      fitFont(ctx, P.title, 'sans', cw - W * .1, W * .055); ctx.fillText(P.title, x + W * .05, y + W * .08);
      const step = Math.min(.7, (e.dur - .6) / Math.max(1, its.length));
      its.forEach((it, i) => {
        const ry = y + W * .16 + i * rowH + rowH / 2, bx = x + W * .05, bs = W * .06;
        const c = clamp((lt - .5 - i * step) / .3);
        ctx.lineWidth = W * .006; ctx.strokeStyle = c > 0 ? P.color : '#bbb';
        rr(ctx, bx, ry - bs / 2, bs, bs, W * .012);
        if (c > 0) { ctx.fillStyle = P.color; ctx.globalAlpha *= 1; ctx.fill(); } ctx.stroke();
        if (c > 0) {
          const pts = [[bx + bs * .22, ry], [bx + bs * .43, ry + bs * .2], [bx + bs * .8, ry - bs * .25]];
          ctx.strokeStyle = '#fff'; ctx.lineWidth = W * .009; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(...pts[0]);
          if (c < .4) ctx.lineTo(lerp(pts[0][0], pts[1][0], c / .4), lerp(pts[0][1], pts[1][1], c / .4));
          else { ctx.lineTo(...pts[1]); const q = (c - .4) / .6; ctx.lineTo(lerp(pts[1][0], pts[2][0], q), lerp(pts[1][1], pts[2][1], q)); }
          ctx.stroke();
        }
        ctx.fillStyle = c >= 1 ? '#999' : '#222';
        const tw0 = cw - W * .2; const px = fitFont(ctx, it, 'sans', tw0, W * .045);
        ctx.fillText(it, bx + bs + W * .035, ry);
        if (c >= 1) {
          const tw = ctx.measureText(it).width, sk = clamp((lt - .5 - i * step - .3) / .25);
          ctx.strokeStyle = '#999'; ctx.lineWidth = W * .004; ctx.beginPath();
          ctx.moveTo(bx + bs + W * .035, ry); ctx.lineTo(bx + bs + W * .035 + tw * sk, ry); ctx.stroke();
        }
        void px;
      });
      ctx.restore();
    },
  },

  // 9. 收據列印
  receipt: {
    name: '收據列印', icon: '🧾', cat: '貼紙', color: '#E2E8F0', dur: 4,
    params: {
      title: T('店名', 'A REELUP STUDIO'),
      items: TA('品項（最後一個數字是價格）', '靈感 1 份 0\n熬夜剪片 3 小時 999\nClaude 幫剪 0\n爆紅機率 100'),
      footer: T('結尾', 'THANK YOU ♥'),
      x: R('水平位置', .5, .3, .7),
    },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e;
      const its = lines(P.items).map(l => { const m = l.match(/^(.*?)\s+([\d.,]+)$/); return m ? [m[1], parseFloat(m[2].replace(/,/g, ''))] : [l, null]; });
      const total = its.reduce((s, [, v]) => s + (v || 0), 0);
      const pw = W * .66, lh = W * .055, x = P.x * W - pw / 2, slotY = H * .1;
      const ph = W * .1 + lh * 2 + its.length * lh + lh * 3.6;
      ctx.save(); ctx.globalAlpha = outK;
      // 出紙口
      ctx.fillStyle = '#1b1b1f'; rr(ctx, x - W * .04, slotY - W * .05, pw + W * .08, W * .07, W * .02); ctx.fill();
      ctx.fillStyle = '#000'; ctx.fillRect(x - W * .01, slotY - W * .006, pw + W * .02, W * .012);
      const vis = ph * easeOut(lt / 1.6) + Math.sin(lt * 30) * (lt < 1.6 ? 1 : 0);
      ctx.save(); ctx.beginPath(); ctx.rect(0, slotY, W, vis + W * .03); ctx.clip();
      ctx.translate(0, slotY + vis - ph);
      shadow(ctx, 20, 'rgba(0,0,0,.3)', 6); ctx.fillStyle = '#fbfbf7';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + pw, 0); ctx.lineTo(x + pw, ph);
      const z = W * .022; for (let zx = x + pw; zx > x; zx -= z * 2) { ctx.lineTo(zx - z, ph - z); ctx.lineTo(zx - z * 2, ph); }
      ctx.closePath(); ctx.fill(); noShadow(ctx);
      ctx.fillStyle = '#222'; ctx.textBaseline = 'middle';
      let yy = W * .06;
      ctx.textAlign = 'center'; fitFont(ctx, P.title, 'mono', pw * .9, W * .045); ctx.fillText(P.title, x + pw / 2, yy); yy += lh;
      ctx.font = font('mono', W * .026); ctx.fillText(new Date().toLocaleDateString('zh-TW') + '  #0719', x + pw / 2, yy); yy += lh * .8;
      const dash = () => { ctx.textAlign = 'left'; ctx.fillText('-'.repeat(40), x + W * .03, yy); yy += lh * .8; };
      ctx.font = font('mono', W * .026); dash();
      its.forEach(([n, v]) => {
        ctx.textAlign = 'left'; fitFont(ctx, n, 'mono', pw * .62, W * .032); ctx.fillText(n, x + W * .03, yy);
        ctx.textAlign = 'right'; ctx.font = font('mono', W * .032); if (v != null) ctx.fillText(fmtNum(v), x + pw - W * .03, yy); yy += lh;
      });
      ctx.font = font('mono', W * .026); dash();
      ctx.font = font('mono', W * .042); ctx.textAlign = 'left'; ctx.fillText('TOTAL', x + W * .03, yy);
      ctx.textAlign = 'right'; ctx.fillText(fmtNum(total), x + pw - W * .03, yy); yy += lh * 1.2;
      ctx.textAlign = 'center'; fitFont(ctx, P.footer, 'mono', pw * .9, W * .03); ctx.fillText(P.footer, x + pw / 2, yy);
      ctx.restore(); ctx.restore();
    },
  },

  // 12. 玻璃字
  glassText: {
    name: '玻璃字', icon: '🧊', cat: '文字', color: '#A3BFFA', dur: 2.5,
    params: {
      text: T('主文字', '重點來了'),
      sub: T('小字', 'KEY POINT'),
      y: R('垂直位置', .5, .15, .85),
    },
    draw(e) {
      const { ctx, W, H, P, lt, outK, frame } = e;
      const a = easeBack(lt / .5);
      const pw = W * .84, ph = W * .3, x = (W - pw) / 2, y = P.y * H - ph / 2;
      ctx.save(); ctx.globalAlpha = clamp(a * 2) * outK;
      ctx.translate(W / 2, y + ph / 2); ctx.scale(lerp(.7, 1, a), lerp(.7, 1, a)); ctx.translate(-W / 2, -(y + ph / 2));
      shadow(ctx, 40, 'rgba(0,0,0,.25)', 12); rr(ctx, x, y, pw, ph, W * .06); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill(); noShadow(ctx);
      ctx.save(); rr(ctx, x, y, pw, ph, W * .06); ctx.clip();
      ctx.drawImage(blurred(frame, 22), 0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x, y, pw, ph);
      const sx = x - pw + ((lt * .6) % 1.6) * pw * 1.6;
      const g = ctx.createLinearGradient(sx, y, sx + pw * .5, y + ph);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, pw, ph); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; rr(ctx, x + 1, y + 1, pw - 2, ph - 2, W * .06); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; shadow(ctx, 12, 'rgba(0,0,0,.25)', 2);
      fitFont(ctx, P.text, 'sans', pw * .86, W * .11); ctx.fillText(P.text, W / 2, y + ph * (P.sub ? .44 : .5));
      if (P.sub) { ctx.font = font('mono', W * .028); ctx.globalAlpha *= .85; ctx.fillText(P.sub, W / 2, y + ph * .78); }
      ctx.restore();
    },
  },

  // 13. 手繪塗鴉
  doodle: {
    name: '手繪塗鴉', icon: '✏️', cat: '貼紙', color: '#FEFCBF', dur: 2.5,
    params: {
      shape: S('形狀', 'circle', [['circle', '圈起來'], ['arrow', '箭頭'], ['underline', '底線'], ['stars', '閃亮'], ['heart', '愛心']]),
      color: C('顏色', '#FFE14D', ['#FFE14D', '#FFFFFF', '#FF5C8A', '#4FD1C5', '#111111']),
      x: R('水平位置', .5, 0, 1), y: R('垂直位置', .4, 0, 1), size: R('大小', .35, .1, .8),
    },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e;
      const k = easeOut(lt / .7), S0 = P.size * W, cx = P.x * W, cy = P.y * H;
      const r = rand(11); const pts = [];
      const J = () => (r() - .5) * .025;
      if (P.shape === 'circle') for (let i = 0; i <= 60; i++) { const an = -1 + i / 60 * (Math.PI * 2 + .5), rad = 1 + Math.sin(i * .3) * .03; pts.push([Math.cos(an) * rad * 1.1 + J(), Math.sin(an) * rad * .75 + J()]); }
      else if (P.shape === 'underline') for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([-1 + t * 2, Math.sin(t * Math.PI * 3) * .06 + J()]); }
      else if (P.shape === 'heart') for (let i = 0; i <= 60; i++) { const t = i / 60 * Math.PI * 2; pts.push([16 * Math.pow(Math.sin(t), 3) / 17 + J(), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + J()]); }
      else if (P.shape === 'arrow') for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([lerp(-1, .8, t) + J(), -.9 * t * t + .6 * t + .3 + J() * .5 - t * .5]); }
      ctx.save(); ctx.globalAlpha = outK; ctx.strokeStyle = P.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = W * .014; shadow(ctx, 6, 'rgba(0,0,0,.3)', 2);
      if (P.shape === 'stars') {
        [[-.6, -.2, 1], [.5, -.5, .7], [.3, .4, .55]].forEach(([x, y, s], i) => {
          const a = easeBack((lt - i * .15) / .35); if (a <= 0) return;
          const sz = S0 * .3 * s * a * (1 + Math.sin(lt * 6 + i) * .08);
          ctx.beginPath(); ctx.moveTo(cx + x * S0, cy + y * S0 - sz); ctx.lineTo(cx + x * S0, cy + y * S0 + sz);
          ctx.moveTo(cx + x * S0 - sz, cy + y * S0); ctx.lineTo(cx + x * S0 + sz, cy + y * S0); ctx.stroke();
        });
      } else {
        const n = Math.max(2, Math.floor(pts.length * k));
        ctx.beginPath(); pts.slice(0, n).forEach(([x, y], i) => { const X = cx + x * S0, Y = cy + y * S0; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
        if (P.shape === 'arrow' && k >= 1) {
          const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 4];
          const an = Math.atan2(ey - py, ex - px), X = cx + ex * S0, Y = cy + ey * S0, L = S0 * .22;
          const h = clamp((lt - .7) / .15);
          ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X - Math.cos(an - .5) * L * h, Y - Math.sin(an - .5) * L * h);
          ctx.moveTo(X, Y); ctx.lineTo(X - Math.cos(an + .5) * L * h, Y - Math.sin(an + .5) * L * h); ctx.stroke();
        }
      }
      ctx.restore();
    },
  },

  // 14. 手機畫面
  phone: {
    name: '手機畫面', icon: '📱', cat: '版面', color: '#81E6D9', dur: 3, base: true,
    params: {
      caption: T('上方文字', 'POV：用 AI 剪片'),
      bg: C('背景色', '#F2E6D8', ['#F2E6D8', '#111111', '#FFD6E0', '#BEE3F8', '#F5E27A']),
    },
    draw(e) {
      const { ctx, W, H, P, lt, dur, frame } = e;
      const k = easeInOut(lt / .6) * easeInOut((dur - lt) / .5);
      ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
      const pw = lerp(W, W * .64, k), ph = pw * 16 / 9 * lerp(1, 1.04, k), x = (W - pw) / 2, y = lerp(0, H * .2, k);
      const bz = W * .02 * k, r = W * .07 * k;
      shadow(ctx, 50 * k, 'rgba(0,0,0,.35)', 20 * k); ctx.fillStyle = '#111'; rr(ctx, x - bz, y - bz, pw + bz * 2, ph + bz * 2, r + bz); ctx.fill(); noShadow(ctx);
      ctx.save(); rr(ctx, x, y, pw, ph, r); ctx.clip(); drawCover(ctx, frame, x, y, pw, ph); ctx.restore();
      if (k > .5) { ctx.fillStyle = '#111'; rr(ctx, W / 2 - pw * .14, y + pw * .03, pw * .28, pw * .07, pw * .035); ctx.fill(); }
      if (P.caption) {
        const a = clamp((lt - .5) / .3) * k; ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = P.bg.toLowerCase() === '#111111' ? '#fff' : '#111';
        fitFont(ctx, P.caption, 'sans', W * .9, W * .075); ctx.fillText(P.caption, W / 2, H * .1); ctx.globalAlpha = 1;
      }
    },
  },

  // 15. 長條成長
  bars: {
    name: '長條成長', icon: '📊', cat: '貼紙', color: '#D6BCFA', dur: 3.5,
    params: {
      title: T('標題', '粉絲成長'),
      labels: T('標籤（逗號分開）', '1月,2月,3月,4月'),
      values: T('數值（逗號分開）', '120,480,1500,5099'),
      color: C('顏色', '#7C5CFF', ['#7C5CFF', '#FF5C8A', '#2ECC71', '#F5A623', '#111111']),
      y: R('垂直位置', .72, .3, .85),
    },
    draw(e) {
      const { ctx, W, H, P, lt, outK } = e;
      const L = P.labels.split(/[,，]/).map(s => s.trim()), V = P.values.split(/[,，]/).map(s => parseFloat(s) || 0);
      const n = Math.min(L.length, V.length); if (!n) return;
      const max = Math.max(...V.slice(0, n), 1);
      const a = easeBack(lt / .45), cw = W * .86, ch = W * .72, x = (W - cw) / 2, y = P.y * H - ch / 2;
      ctx.save(); ctx.globalAlpha = clamp(a * 2) * outK;
      ctx.translate(0, (1 - a) * H * .15);
      shadow(ctx, 30, 'rgba(0,0,0,.3)', 10); ctx.fillStyle = 'rgba(255,255,255,.96)'; rr(ctx, x, y, cw, ch, W * .04); ctx.fill(); noShadow(ctx);
      ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      fitFont(ctx, P.title, 'sans', cw * .9, W * .055); ctx.fillText(P.title, x + W * .05, y + W * .08);
      const bx0 = x + W * .06, bw = (cw - W * .12) / n, base = y + ch - W * .09, top = y + W * .2;
      for (let i = 0; i < n; i++) {
        const g = easeOut((lt - .4 - i * .2) / .8), h = (base - top - W * .06) * (V[i] / max) * g;
        const bx = bx0 + i * bw + bw * .15;
        ctx.fillStyle = P.color; ctx.globalAlpha = (.45 + .55 * (i + 1) / n) * outK;
        rr(ctx, bx, base - h, bw * .7, Math.max(h, 1), W * .015); ctx.fill(); ctx.globalAlpha = outK;
        ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.font = font('sans', W * .034);
        if (g > 0) ctx.fillText(fmtNum(V[i] * g), bx + bw * .35, base - h - W * .03);
        ctx.font = `500 ${W * .032}px ${FONTS.sans}`; ctx.fillStyle = '#555'; ctx.fillText(L[i], bx + bw * .35, base + W * .045);
      }
      ctx.restore();
    },
  },
};

export const CATS = ['爆款版型', '剪輯風格', 'AI 去背', '文字', '鏡頭', '版面', '貼紙'];

export function defaultParams(type) {
  const o = {}; for (const [k, d] of Object.entries(EFFECTS[type].params)) o[k] = d.value; return o;
}
export function needsMask(fx) { const d = EFFECTS[fx.type]; return !!(d.ai && d.ai(fx.params)); }

// 給其他特效模組共用
export { clamp, easeOut, easeInOut, easeBack, lerp, rand, rr, drawCover, fitFont, lines, words, fmtNum, lum, parseMarks, blurred, shadow, noShadow, T, TA, C, S, R, IMG, IMGS, MEDIA };
