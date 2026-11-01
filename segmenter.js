// AI 人像去背：MediaPipe，在瀏覽器端執行
// 全部檔案放在 vendor/ 自己託管（@mediapipe/tasks-vision 0.10.14，Apache-2.0）
//  - fast：selfie_segmenter（250KB，快）
//  - hq  ：selfie_multiclass_256x256（16MB，頭髮、邊緣明顯更準）
const BASE = new URL('./vendor', import.meta.url).href;

// 模型只吃正方形：把 9:16 畫面切成「上、下兩個正方形」分別辨識再接起來，人不會被壓扁、解析度也高一倍
export const TILE = 256, SEG_W = 256, SEG_H = 456;

async function loadModel(quality) {
  const parts = quality === 'hq'
    ? await Promise.all([import('./vendor/selfie_multiclass_0.js'), import('./vendor/selfie_multiclass_1.js')])
    : [await import('./vendor/selfie_segmenter_model.js')];
  const b64 = parts.map(p => p.default).join('');
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class PersonSegmenter {
  constructor() {
    this.state = 'idle'; // idle | loading | ready | error
    this.quality = 'fast';
    this.opts = { edge: 0, soft: .2, smooth: .45 }; // edge: -0.3(放寬)~+0.3(收緊)
    this.input = document.createElement('canvas');
    this.input.width = TILE; this.input.height = TILE;
    this.conf = new Float32Array(SEG_W * SEG_H);
    this.mask = document.createElement('canvas');
    this.mask.width = SEG_W; this.mask.height = SEG_H;
    this.maskData = new ImageData(SEG_W, SEG_H);
    this.prev = null; // 上一張遮罩（防閃爍用）
    // 精修遮罩：放大到 2 倍再收邊，邊緣更平滑
    this.fine = document.createElement('canvas'); this.fine.width = SEG_W * 2; this.fine.height = SEG_H * 2;
    this.lab = new Int32Array(SEG_W * SEG_H); this.stack = new Int32Array(SEG_W * SEG_H);
    this.bbox = null;
    this.lastTs = 0;
  }

  setQuality(q, onState) {
    if (q === this.quality) return;
    this.quality = q;
    if (this.state === 'idle') return;
    try { this.seg?.close(); } catch {}
    this.seg = null; this.state = 'idle'; this.prev = null;
    this.load(onState);
  }

  async load(onState) {
    if (this.state !== 'idle') return this.ready;
    this.state = 'loading'; onState?.('loading', this.quality);
    const q = this.quality;
    this.ready = (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import(`${BASE}/vision_bundle.mjs`);
        const fileset = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
        const model = await loadModel(q);
        const make = delegate => ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: model, delegate },
          runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
        });
        let seg; try { seg = await make('GPU'); } catch { seg = await make('CPU'); }
        if (q !== this.quality) { seg.close(); return; } // 載入途中切換了品質
        this.seg = seg; this.state = 'ready'; onState?.('ready', q);
      } catch (err) {
        console.error(err); this.state = 'error'; onState?.('error', q);
      }
    })();
    return this.ready;
  }

  // 從 W×H 的畫面產生遮罩；回傳 true 表示成功
  // 跑一次模型，回傳 TILE×TILE 的「是人」機率
  infer(ts) {
    let out = null; const hq = this.quality === 'hq';
    this.seg.segmentForVideo(this.input, ts, res => {
      const m = res.confidenceMasks?.[0]; if (!m) return;
      const f = m.getAsFloat32Array(); out = new Float32Array(f.length);
      for (let i = 0; i < f.length; i++) out[i] = hq ? 1 - f[i] : f[i]; // multiclass 第 0 類是背景
      if (m.width !== TILE || m.height !== TILE) console.warn('mask size', m.width, m.height);
    });
    return out;
  }

  // 從 W×H 的畫面產生遮罩；回傳 true 表示成功
  run(frame, W, H, still = false) {
    if (this.state !== 'ready') return false;
    const ic = this.input.getContext('2d');
    let ts = performance.now(); if (ts <= this.lastTs) ts = this.lastTs + 1; this.lastTs = ts + 1;
    // 上方正方形
    ic.drawImage(frame, 0, 0, W, W, 0, 0, TILE, TILE);
    const top = this.infer(ts); if (!top) return false;
    // 下方正方形
    ic.drawImage(frame, 0, H - W, W, W, 0, 0, TILE, TILE);
    const bot = this.infer(ts + 1); if (!bot) return false;
    // 接起來：重疊的地方漸變混合
    const conf = this.conf, o0 = SEG_H - TILE, ov = TILE - o0;
    for (let y = 0; y < SEG_H; y++) {
      const wb = y < o0 ? 0 : y >= TILE ? 1 : (y - o0) / ov;
      for (let x = 0; x < SEG_W; x++) {
        const a = y < TILE ? top[y * TILE + x] : 0, b = y >= o0 ? bot[(y - o0) * TILE + x] : 0;
        conf[y * SEG_W + x] = a * (1 - wb) + b * wb;
      }
    }
    const n = SEG_W * SEG_H;
    if (!this.prev || this.prev.length !== n) this.prev = new Float32Array(n);
    const prev = this.prev, d = this.maskData.data;
    // 暫停畫面不做時間平滑，播放時才做（防閃爍）
    const sm = still ? 0 : this.opts.smooth;
    const lo = .5 + this.opts.edge - this.opts.soft / 2, span = Math.max(.02, this.opts.soft);
    let x0 = SEG_W, y0 = SEG_H, x1 = -1, y1 = -1;
    for (let i = 0; i < n; i++) {
      const c = prev[i] = prev[i] * sm + conf[i] * (1 - sm);
      let v = (c - lo) / span; v = v < 0 ? 0 : v > 1 ? 1 : v * v * (3 - 2 * v);
      d[i * 4 + 3] = v * 255;
    }
    this.removeIslands();
    for (let i = 0; i < n; i++) if (d[i * 4 + 3] > 127) { const x = i % SEG_W, y = (i / SEG_W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    this.mask.getContext('2d').putImageData(this.maskData, 0, 0);
    this.refine();
    this.bbox = x1 < 0 ? null : { x: x0 / SEG_W * W, y: y0 / SEG_H * H, w: (x1 - x0) / SEG_W * W, h: (y1 - y0) / SEG_H * H };
    return true;
  }

  // 去掉背景裡被誤判成人的小碎塊（只保留面積夠大的區塊）
  removeIslands() {
    const d = this.maskData.data, lab = this.lab.fill(0), st = this.stack, n = SEG_W * SEG_H, areas = [0];
    for (let i = 0; i < n; i++) {
      if (lab[i] || d[i * 4 + 3] < 128) continue;
      const id = areas.length; let top = 0, area = 0; st[top++] = i; lab[i] = id;
      while (top) {
        const p = st[--top]; area++;
        const x = p % SEG_W, y = (p / SEG_W) | 0;
        if (x > 0 && !lab[p - 1] && d[(p - 1) * 4 + 3] >= 128) { lab[p - 1] = id; st[top++] = p - 1; }
        if (x < SEG_W - 1 && !lab[p + 1] && d[(p + 1) * 4 + 3] >= 128) { lab[p + 1] = id; st[top++] = p + 1; }
        if (y > 0 && !lab[p - SEG_W] && d[(p - SEG_W) * 4 + 3] >= 128) { lab[p - SEG_W] = id; st[top++] = p - SEG_W; }
        if (y < SEG_H - 1 && !lab[p + SEG_W] && d[(p + SEG_W) * 4 + 3] >= 128) { lab[p + SEG_W] = id; st[top++] = p + SEG_W; }
      }
      areas.push(area);
    }
    if (areas.length <= 2) return;
    const big = Math.max(...areas), keep = areas.map(a => a >= big * .12); // 兩個人以上也保留
    for (let i = 0; i < n; i++) {
      const id = lab[i];
      if (id ? !keep[id] : d[i * 4 + 3] > 0 && d[i * 4 + 3] < 128 && !this.nearKept(i, lab, keep)) d[i * 4 + 3] = 0;
    }
  }
  nearKept(i, lab, keep) {
    const x = i % SEG_W, y = (i / SEG_W) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= SEG_W || yy >= SEG_H) continue;
      const id = lab[yy * SEG_W + xx]; if (id && keep[id]) return true;
    }
    return false;
  }

  // 放大 2 倍（平滑內插）後再收邊 → 邊緣圓順、不會一格一格
  refine() {
    const c = this.fine.getContext('2d', { willReadFrequently: true }), w = this.fine.width, h = this.fine.height;
    c.clearRect(0, 0, w, h); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(this.mask, 0, 0, w, h);
    const img = c.getImageData(0, 0, w, h), d = img.data;
    const band = Math.max(.06, Math.min(.45, this.opts.soft * .9)), lo = .5 - band / 2;
    for (let i = 3; i < d.length; i += 4) {
      let v = (d[i] / 255 - lo) / band; v = v < 0 ? 0 : v > 1 ? 1 : v * v * (3 - 2 * v);
      d[i] = v * 255;
    }
    c.putImageData(img, 0, 0);
  }

  // 把遮罩套到畫面上，得到去背人像
  cutout(frame, out) {
    const c = out.getContext('2d');
    c.globalCompositeOperation = 'copy';
    c.drawImage(frame, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(this.fine, 0, 0, out.width, out.height);
    c.globalCompositeOperation = 'source-over';
    return out;
  }
}
