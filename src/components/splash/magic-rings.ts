/**
 * The splash's rings: a small raw WebGL2 port of React Bits' MagicRings
 * fragment shader, without three.js. One full-screen triangle, one draw per
 * frame, uniforms only. The mouse, hover, parallax and burst inputs of the
 * original are gone (this is a two-second phone splash), and `uCenter` places
 * the rings' centre in canvas pixels. `uCutaway` scales the original's
 * angular cut-away (the term that fades a ring towards its top and bottom):
 * 1 is the original's bracket-like arcs, near 0 is a whole circle. Where the original maps its luminance to
 * alpha for a canvas over a dark page, so does this (`uCoverageAlpha` 0).
 *
 * Where WebGL2 is unavailable or the context cannot be made, `startMagicRings`
 * does nothing: the splash is complete without the rings.
 */

const VERTEX = `#version 300 es
void main() {
  // One triangle that covers the viewport, from the vertex index alone.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform float uTime, uAttenuation, uLineThickness;
uniform float uBaseRadius, uRadiusStep, uScaleRate;
uniform float uOpacity, uNoiseAmount, uRotation, uRingGap;
uniform float uFadeIn, uFadeOut;
uniform float uCoverageAlpha, uCutaway;
uniform vec2 uResolution, uCenter;
uniform vec3 uColor, uColorTwo;
uniform int uRingCount;
out vec4 outColor;
const float HP = 1.5707963;
const float CYCLE = 3.45;
float fade(float t) { return t < uFadeIn ? smoothstep(0.0, uFadeIn, t) : 1.0 - smoothstep(uFadeOut, CYCLE - 0.2, t); }
float ring(vec2 p, float ri, float cut, float t0, float px) {
  float t = mod(uTime + t0, CYCLE);
  float r = ri + t / CYCLE * uScaleRate;
  float d = abs(length(p) - r);
  float a = atan(abs(p.y), abs(p.x)) / HP;
  float th = max(1.0 - a, 0.5) * px * uLineThickness;
  float h = (1.0 - smoothstep(th, th * 1.5, d)) + 1.0;
  d += pow(cut * a, 3.0) * r * uCutaway;
  return h * exp(-uAttenuation * d) * fade(t);
}
void main() {
  float px = 1.0 / min(uResolution.x, uResolution.y);
  vec2 p = (gl_FragCoord.xy - uCenter) * px;
  float cr = cos(uRotation), sr = sin(uRotation);
  p = mat2(cr, -sr, sr, cr) * p;
  vec3 c = vec3(0.0);
  float coverage = 0.0;
  float rcf = max(float(uRingCount) - 1.0, 1.0);
  for (int i = 0; i < 10; i++) {
    if (i >= uRingCount) break;
    float fi = float(i);
    vec3 rc = mix(uColor, uColorTwo, fi / rcf);
    float ringAmount = ring(p, uBaseRadius + fi * uRadiusStep, pow(uRingGap, fi), i == 0 ? 0.0 : 2.95 * fi, px);
    c = mix(c, rc, vec3(ringAmount));
    coverage = max(coverage, ringAmount);
  }
  float n = fract(sin(dot(gl_FragCoord.xy + uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * uNoiseAmount;
  float intensity = max(c.r, max(c.g, c.b));
  vec3 emissive = intensity > 0.0001 ? clamp(c / intensity, 0.0, 1.0) : vec3(0.0);
  vec3 rgb = mix(emissive, clamp(c, 0.0, 1.0), uCoverageAlpha);
  float alpha = clamp(mix(intensity, coverage, uCoverageAlpha) * uOpacity, 0.0, 1.0);
  outColor = vec4(rgb * alpha, alpha);
}`;

/** rgb (0 to 1) from hsl, hue in degrees, for the two floodlight blues. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/**
 * The look. The rings are drawn around the ball and scale with it, so the
 * radii are in ball radii (R): each ring is born at `born` R, just outside the
 * ball, and spreads `spread` R over a cycle. Every ring shares one base radius,
 * and the original's per-ring phase offsets (2.95s modulo the 3.45s cycle)
 * space the pulses apart. At the hero size the rings reach about half the
 * screen's shorter side. `cutaway` is nearly closed circles (see above).
 */
export const RING_LOOK = {
  ringCount: 5,
  speed: 1.5,
  attenuation: 55,
  lineThickness: 1.4,
  born: 1.2,
  spread: 1.9,
  noiseAmount: 0.03,
  ringGap: 1.08,
  cutaway: 0.1,
  fadeIn: 0.7,
  fadeOut: 0.5,
  opacity: 0.9,
  // BotolaGO's floodlight blue: two close hues of the family the splash used.
  color: hslToRgb(205, 1, 0.76),
  colorTwo: hslToRgb(214, 1, 0.62),
};

/** When the rings fade in, and out as the ball leaves for its place (ms from first paint). */
export const FADE_START_MS = 350;
export const FADE_MS = 500;
export const OUT_START_MS = 950;
export const OUT_MS = 650;
/** Where in the original's 3.45s cycle the first ring is when the fade begins. */
const TIME_OFFSET = 1;

/** Device pixels per CSS pixel, capped: the rings are soft and need no more. */
const MAX_DPR = 1.5;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** How far the rings have faded in, 0 to 1, from the time since `start`. */
function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Draw the rings on `canvas` (which covers the whole splash) until the returned
 * function is called. They are centred on `ball`, wherever it is on screen that
 * frame, and sized by it. `shownAt`
 * is the splash's first paint on the `performance.now()` clock: the rings keep
 * that clock, so they are in step with the CSS choreography however late the
 * app's code arrived. They fade in from `FADE_START_MS` after it, or from now
 * if that has passed, so they never pop. Safe to call without WebGL2: returns a
 * function that does nothing.
 */
export function startMagicRings(
  canvas: HTMLCanvasElement,
  shownAt: number,
  ball: Element | null,
): () => void {
  const noop = () => {};
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
  } catch {
    return noop;
  }
  if (!gl) return noop;

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    return noop;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return noop;
  }

  const context = gl;
  const vao = context.createVertexArray();
  context.bindVertexArray(vao);
  context.useProgram(program);
  const at = (name: string) => context.getUniformLocation(program, name);
  const u = {
    time: at("uTime"),
    opacity: at("uOpacity"),
    resolution: at("uResolution"),
    center: at("uCenter"),
    base: at("uBaseRadius"),
    rate: at("uScaleRate"),
  };
  const L = RING_LOOK;
  context.uniform1i(at("uRingCount"), L.ringCount);
  context.uniform1f(at("uAttenuation"), L.attenuation);
  context.uniform1f(at("uLineThickness"), L.lineThickness);
  context.uniform1f(at("uRadiusStep"), 0);
  context.uniform1f(at("uCutaway"), L.cutaway);
  context.uniform1f(at("uNoiseAmount"), L.noiseAmount);
  context.uniform1f(at("uRotation"), 0);
  context.uniform1f(at("uRingGap"), L.ringGap);
  context.uniform1f(at("uFadeIn"), L.fadeIn);
  context.uniform1f(at("uFadeOut"), L.fadeOut);
  context.uniform1f(at("uCoverageAlpha"), 0);
  context.uniform3f(at("uColor"), L.color[0], L.color[1], L.color[2]);
  context.uniform3f(at("uColorTwo"), L.colorTwo[0], L.colorTwo[1], L.colorTwo[2]);
  context.clearColor(0, 0, 0, 0);

  const mountedAt = performance.now();
  let frame = 0;
  let running = true;

  const draw = () => {
    frame = 0;
    if (!running || context.isContextLost()) return;
    const now = performance.now();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    context.viewport(0, 0, w, h);
    context.clear(context.COLOR_BUFFER_BIT);
    // Where the ball is on screen this frame, and how big: the rings follow it.
    const box = canvas.getBoundingClientRect();
    const b = ball?.getBoundingClientRect();
    const k = box.width > 0 ? w / box.width : dpr;
    const sinceShown = now - shownAt;
    const opacity =
      Math.min(
        smooth((sinceShown - FADE_START_MS) / FADE_MS),
        smooth((now - mountedAt) / FADE_MS),
      ) *
      (1 - smooth((sinceShown - OUT_START_MS) / OUT_MS)) *
      L.opacity;
    if (b && b.width > 0 && opacity > 0.002) {
      const radius = (b.width / 2) * k;
      const m = Math.min(w, h);
      context.uniform1f(u.base, (L.born * radius) / m);
      context.uniform1f(u.rate, (L.spread * radius) / m);
      context.uniform1f(u.time, ((sinceShown - FADE_START_MS) / 1000) * L.speed + TIME_OFFSET);
      context.uniform1f(u.opacity, opacity);
      context.uniform2f(u.resolution, w, h);
      // gl_FragCoord's y runs up from the bottom of the canvas.
      context.uniform2f(
        u.center,
        (b.left + b.width / 2 - box.left) * k,
        h - (b.top + b.height / 2 - box.top) * k,
      );
      context.drawArrays(context.TRIANGLES, 0, 3);
    }
    frame = requestAnimationFrame(draw);
  };
  const onVisibility = () => {
    if (document.hidden) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    } else if (running && !frame) {
      frame = requestAnimationFrame(draw);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  frame = requestAnimationFrame(draw);

  return () => {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    document.removeEventListener("visibilitychange", onVisibility);
    context.deleteProgram(program);
    context.deleteShader(vertex);
    context.deleteShader(fragment);
    context.deleteVertexArray(vao);
    context.getExtension("WEBGL_lose_context")?.loseContext();
  };
}
