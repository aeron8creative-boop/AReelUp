// 電影感調色：WebGL shader（手機上也很快，Safari 相容）
export const GRADES = {
  none:       { name: '原色' },
  warmCinema: { name: '電影暖調', warm: .55, contrast: 1.12, sat: .9,  sh: [0, .04, .07],    hi: [.16, .07, -.05], fade: .06, vign: .38, grain: .035 },
  golden:     { name: '暖陽',     warm: .9,  contrast: 1.05, sat: 1.08, sh: [.05, .01, -.03], hi: [.2, .1, -.06],   fade: .03, vign: .22, grain: .02 },
  tealOrange: { name: '青橙電影', warm: .3,  contrast: 1.18, sat: 1.0, sh: [-.08, .05, .13],  hi: [.18, .06, -.08], fade: .02, vign: .3,  grain: .03 },
  film:       { name: '復古底片', warm: .45, contrast: .95,  sat: .78, sh: [.02, .05, .06],   hi: [.12, .08, 0],    fade: .14, vign: .42, grain: .08 },
  cool:       { name: '冷調',     warm: -.6, contrast: 1.1,  sat: .85, sh: [0, .03, .1],      hi: [0, .04, .08],    fade: .04, vign: .25, grain: .02 },
};

const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p*.5+.5; v.y = 1.-v.y; gl_Position = vec4(p,0.,1.); }`;
const FS = `precision mediump float;
varying vec2 v; uniform sampler2D u;
uniform float amt, warm, contrast, sat, fade, vign, grain, time;
uniform vec3 sh, hi;
float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)) + time) * 43758.5453); }
void main(){
  vec3 c = texture2D(u, v).rgb;
  vec3 o = c;
  o.r += warm * .06; o.g += warm * .015; o.b -= warm * .07;              // 色溫
  o = (o - .5) * contrast + .5;                                           // 對比
  float l = dot(o, vec3(.299, .587, .114));
  o += sh * (1. - l) * (1. - l) + hi * l * l;                             // 分離色調（暗部/亮部）
  o = mix(vec3(l), o, sat);                                               // 飽和度
  o = mix(o, vec3(.06) + o * .9, fade);                                   // 褪色（黑位提亮）
  float d = distance(v, vec2(.5)); o *= 1. - vign * smoothstep(.3, .9, d); // 暗角
  o += (rnd(v * 999.) - .5) * grain;                                      // 顆粒
  gl_FragColor = vec4(mix(c, clamp(o, 0., 1.), amt), 1.);
}`;

export class Grader {
  constructor(W, H) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    const gl = this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) { this.ok = false; return; }
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.u = {}; for (const n of ['amt', 'warm', 'contrast', 'sat', 'fade', 'vign', 'grain', 'time', 'sh', 'hi']) this.u[n] = gl.getUniformLocation(pr, n);
    gl.viewport(0, 0, W, H);
    this.ok = true;
  }

  // 回傳調好色的畫布（或 null 代表不需要/不支援）
  apply(src, key, amount, time) {
    const g = GRADES[key];
    if (!this.ok || !g || key === 'none' || amount <= 0) return null;
    const gl = this.gl, u = this.u;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    gl.uniform1f(u.amt, amount); gl.uniform1f(u.warm, g.warm); gl.uniform1f(u.contrast, g.contrast); gl.uniform1f(u.sat, g.sat);
    gl.uniform1f(u.fade, g.fade); gl.uniform1f(u.vign, g.vign); gl.uniform1f(u.grain, g.grain); gl.uniform1f(u.time, time % 100);
    gl.uniform3fv(u.sh, g.sh); gl.uniform3fv(u.hi, g.hi);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}
