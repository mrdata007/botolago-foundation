/**
 * A recording stand-in for the 2D canvas, for the share picture's draw test: every text,
 * rectangle, path fill and image is kept in device pixels with the colour, font, alignment and
 * direction it was drawn with. It is the same idea as the one in
 * `src/components/pepites/share-image.draw.test.ts`, reduced to what the card picture draws.
 * Test support only: nothing in the app imports this file.
 */
export interface Op {
  kind: "text" | "rect" | "fill" | "stroke" | "image";
  text?: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  baseline?: number;
  /** For text: the anchor and the alignment it was drawn with, and the canvas direction. */
  anchor?: number;
  align?: string;
  direction?: string;
  paint?: string;
  font?: string;
  maxWidth?: number;
  shadowBlur?: number;
  /** For text: the turn in degrees (a run set along the cut corner) and the tracking in px. */
  rotate?: number;
  letterSpacing?: number;
}

interface State {
  font: string;
  fillStyle: string;
  strokeStyle: string;
  textAlign: string;
  textBaseline: string;
  direction: string;
  lineWidth: number;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetY: number;
  letterSpacing: string;
  /** The translation and the turn (radians) the next text is drawn under. */
  originX: number;
  originY: number;
  turn: number;
}

export const fontSize = (font: string) => Number(/([\d.]+)px/.exec(font)?.[1] ?? 10);
/** A deterministic width: the same text in the same font measures the same in both languages. */
export const measure = (value: string, font: string) => [...value].length * fontSize(font) * 0.55;
/** Chromium's canvas spaces the letters of a Latin run and never those of a cursive one (Arabic). */
const spacedBy = (value: string, spacing: number) =>
  /[؀-ۿ]/.test(value) ? 0 : [...value].length * spacing;

/** Deterministic ink above and below the baseline, in em, after what Chromium measures. */
export function ink(value: string, font: string) {
  const size = fontSize(font);
  const arabic = /[؀-ۿ]/.test(value);
  const changa = font.includes('"Changa"');
  const [ascent, descent] = arabic
    ? changa
      ? [0.86, 0.3]
      : [0.95, 0.41]
    : changa
      ? [0.65, 0.02]
      : [0.73, 0];
  return { ascent: ascent * size, descent: descent * size };
}

export function recordingContext() {
  const ops: Op[] = [];
  let state: State = {
    font: "10px sans-serif",
    fillStyle: "#000000",
    strokeStyle: "#000000",
    textAlign: "start",
    textBaseline: "alphabetic",
    direction: "ltr",
    lineWidth: 1,
    shadowBlur: 0,
    shadowColor: "transparent",
    shadowOffsetY: 0,
    letterSpacing: "0px",
    originX: 0,
    originY: 0,
    turn: 0,
  };
  const stack: State[] = [];
  let xs: number[] = [];
  let ys: number[] = [];
  const ctx = {
    save() {
      stack.push({ ...state });
    },
    restore() {
      state = stack.pop() ?? state;
    },
    beginPath() {
      xs = [];
      ys = [];
    },
    moveTo(px: number, py: number) {
      xs.push(px);
      ys.push(py);
    },
    arcTo(x1: number, y1: number, x2: number, y2: number) {
      xs.push(x1, x2);
      ys.push(y1, y2);
    },
    arc(cx: number, cy: number, r: number) {
      xs.push(cx - r, cx + r);
      ys.push(cy - r, cy + r);
    },
    closePath() {},
    clip() {},
    translate(tx: number, ty: number) {
      state.originX += tx;
      state.originY += ty;
    },
    rotate(radians: number) {
      state.turn += radians;
    },
    fill() {
      ops.push({
        kind: "fill",
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
        paint: state.fillStyle,
      });
    },
    stroke() {
      ops.push({
        kind: "stroke",
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
        paint: state.strokeStyle,
      });
    },
    fillRect(px: number, py: number, w: number, h: number) {
      ops.push({
        kind: "rect",
        left: px,
        right: px + w,
        top: py,
        bottom: py + h,
        paint: state.fillStyle,
      });
    },
    fillText(value: string, rawX: number, rawY: number, maxWidth?: number) {
      const px = rawX + state.originX;
      const py = rawY + state.originY;
      const spacing = Number.parseFloat(state.letterSpacing) || 0;
      const w = Math.min(
        measure(value, state.font) + spacedBy(value, spacing),
        maxWidth ?? Infinity,
      );
      const rtl = state.direction === "rtl";
      const align =
        state.textAlign === "start"
          ? rtl
            ? "right"
            : "left"
          : state.textAlign === "end"
            ? rtl
              ? "left"
              : "right"
            : state.textAlign;
      let left = align === "right" ? px - w : align === "center" ? px - w / 2 : px;
      const metrics = ink(value, state.font);
      let right = left + w;
      let top = py - metrics.ascent;
      let bottom = py + metrics.descent;
      if (state.turn !== 0) {
        // the box of a turned run: its four corners turned about the anchor
        const cos = Math.cos(state.turn);
        const sin = Math.sin(state.turn);
        const corners = [
          [left, top],
          [right, top],
          [left, bottom],
          [right, bottom],
        ].map(([cx, cy]) => [
          px + (cx! - px) * cos - (cy! - py) * sin,
          py + (cx! - px) * sin + (cy! - py) * cos,
        ]);
        left = Math.min(...corners.map((c) => c[0]!));
        right = Math.max(...corners.map((c) => c[0]!));
        top = Math.min(...corners.map((c) => c[1]!));
        bottom = Math.max(...corners.map((c) => c[1]!));
      }
      ops.push({
        kind: "text",
        text: value,
        left,
        right,
        top,
        bottom,
        baseline: py,
        anchor: px,
        align,
        direction: state.direction,
        paint: state.fillStyle,
        font: state.font,
        maxWidth,
        ...(state.turn !== 0 ? { rotate: (state.turn * 180) / Math.PI } : {}),
        ...(spacing !== 0 ? { letterSpacing: spacing } : {}),
      });
    },
    measureText(value: string) {
      const metrics = ink(value, state.font);
      return {
        width:
          measure(value, state.font) + spacedBy(value, Number.parseFloat(state.letterSpacing) || 0),
        actualBoundingBoxAscent: metrics.ascent,
        actualBoundingBoxDescent: metrics.descent,
      };
    },
    drawImage(_image: unknown, dx: number, dy: number, dw: number, dh: number) {
      ops.push({
        kind: "image",
        left: dx,
        right: dx + dw,
        top: dy,
        bottom: dy + dh,
        shadowBlur: state.shadowBlur,
      });
    },
  };
  const accessor = <K extends keyof State>(key: K) => ({
    get: () => state[key],
    set: (value: State[K]) => {
      state[key] = value;
    },
    enumerable: true,
  });
  for (const key of Object.keys(state) as (keyof State)[]) {
    Object.defineProperty(ctx, key, accessor(key));
  }
  return { ctx, ops };
}

export type Recording = ReturnType<typeof recordingContext>;
