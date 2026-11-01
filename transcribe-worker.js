// Whisper 語音辨識 Worker（transformers.js，在使用者裝置上執行，音訊不上傳）
// 模型第一次會從 Hugging Face 下載，之後瀏覽器會快取。
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;

const post = (type, extra) => self.postMessage({ type, ...extra });

self.onmessage = async ({ data }) => {
  const { samples, model, language } = data;
  try {
    const files = {};
    const progress_callback = p => {
      if (p.status === 'progress' && p.file) {
        files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
        const all = Object.values(files), loaded = all.reduce((a, f) => a + f.loaded, 0), total = all.reduce((a, f) => a + f.total, 0);
        post('progress', { stage: 'download', ratio: total ? loaded / total : 0, loaded, total });
      }
    };
    let device = 'wasm';
    if (self.navigator?.gpu) { try { if (await navigator.gpu.requestAdapter()) device = 'webgpu'; } catch {} }
    post('progress', { stage: 'load', device });
    let asr;
    try {
      asr = await pipeline('automatic-speech-recognition', model, {
        device, dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8', progress_callback,
      });
    } catch (err) {
      if (device !== 'webgpu') throw err;
      device = 'wasm'; post('progress', { stage: 'load', device });
      asr = await pipeline('automatic-speech-recognition', model, { device, dtype: 'q8', progress_callback });
    }
    post('progress', { stage: 'transcribe', device });
    const opts = { task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 };
    if (language && language !== 'auto') opts.language = language;
    let out, level = 'word';
    try {
      out = await asr(samples, { ...opts, return_timestamps: 'word' });
    } catch (err) {
      // 部分模型不支援逐字時間碼 → 改用句子時間碼
      level = 'segment';
      out = await asr(samples, { ...opts, return_timestamps: true });
    }
    post('done', { chunks: out.chunks || [], text: out.text || '', level, device });
  } catch (err) {
    post('error', { message: String(err?.message || err) });
  }
};
