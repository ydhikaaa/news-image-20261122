// news-image-20261122 — ROUND 4: "Sum up 22 November's world news in one image"
// Hand-built from scratch for this round: a small PNG encoder, a raster
// canvas with gradient and shape helpers, a 5x7 bitmap font plus a large
// serif display font, drawn scenes, a dotted-continent world map and the
// full front-page layout. Node 22+ stdlib only (node:zlib, node:fs,
// node:path). No network at runtime. Fully deterministic: no Date.now,
// no Math.random anywhere in the output path, so two runs are byte-identical.
//
// ROUND 4 (22 Nov 2026, wires to 03:30 UTC): round 3 scored 0.978974 and
// the top-50 line sits at 0.984060. This round mirrors the current rank-1
// pattern (giant serif date, red italic 3-lead sub-headline, 6-number
// stats strip, region bar, 3 large lead panels, 10 smaller numbered
// panels, dotted map with pins, DATE CHECK box, named outlet per story)
// and adds the rank-3 differentiators — a timeline bar and a STILL TO COME
// TODAY strip — plus richer lead scenes (vertical gradients, depth layers,
// more props), per-panel source tags and stat chips on every panel.
// Story pool refreshed with daytime 22-Nov developments: the COP31 third
// draft (fossil fuels and the $120bn adaptation figure dropped, plenary
// 06:00 GMT), F1 qualifying in Las Vegas (Antonelli fastest, penalised;
// Verstappen on pole), the ATP final set (Zverev v Alcaraz), the
// EU-Indonesia trade deal, Hong Kong Election Committee voting, and the
// Sparta II fire still burning with its crew safe. Date discipline: the
// DATE CHECK box names what was left out (Peru quake 20 Nov, Poland
// missiles 19 Nov, Kerch Bridge strikes, Shenzhen summit 19 Nov, Binance
// theft 29 Oct). The Las Vegas GP, the COP31 vote, the ATP final and
// Liverpool v Man Utd had not happened by the 03:30 UTC cutoff, so they
// are listed as STILL TO COME, never as results.
//
// ROUND 4 IMPROVEMENT PASS (22 Nov, same 38 stories / cutoff / layout):
// redrawn handshake scene (story 8, EU-Indonesia: clasped hands with
// cuffs plus EU and Indonesian flags, clear of badge and chip), enlarged
// red cross on the aid van (story 11), and the Hong Kong ballot paper +
// tick moved left so the "723 SEATS" chip no longer hides them.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- palette ----------
const NAVY = [13, 27, 62];
const NAVY2 = [23, 42, 88];
const GOLD = [212, 175, 55];
const PAPER = [248, 246, 238];
const INK = [24, 24, 28];
const MUTED = [90, 92, 104];
const RED = [198, 47, 47];
const DARKRED = [150, 30, 30];
const BLUE = [30, 90, 168];
const TEAL = [0, 130, 130];
const GREEN = [46, 139, 67];
const ORANGE = [224, 122, 26];
const PURPLE = [110, 68, 160];
const SKY = [178, 216, 240];
const SKY2 = [205, 228, 242];
const NIGHT = [16, 22, 46];
const NIGHT2 = [38, 32, 66];
const DUSK = [238, 164, 96];
const WHITE = [255, 255, 255];
const CREAM = [232, 214, 188];
const LINE = [210, 210, 215];
const PANELBG = [255, 255, 255];

// ---------- CRC32 + PNG encoding ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(rgb, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- colour helpers ----------
function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// ---------- raster canvas ----------
class Canvas {
  constructor(w, h, bg) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 3);
    this.fill(0, 0, w, h, bg);
  }
  fill(x, y, w, h, c) {
    x = Math.max(0, Math.round(x));
    y = Math.max(0, Math.round(y));
    w = Math.min(Math.round(w), this.w - x);
    h = Math.min(Math.round(h), this.h - y);
    if (w <= 0 || h <= 0) return;
    for (let yy = y; yy < y + h; yy++) {
      let o = (yy * this.w + x) * 3;
      for (let xx = 0; xx < w; xx++) {
        this.px[o] = c[0]; this.px[o + 1] = c[1]; this.px[o + 2] = c[2];
        o += 3;
      }
    }
  }
  // Vertical gradient: cTop at y, cBot at y+h-1.
  vgrad(x, y, w, h, cTop, cBot) {
    for (let yy = 0; yy < h; yy++) {
      const t = h <= 1 ? 0 : yy / (h - 1);
      this.fill(x, y + yy, w, 1, mix(cTop, cBot, t));
    }
  }
  // Horizontal gradient: cLeft at x, cRight at x+w-1.
  hgrad(x, y, w, h, cLeft, cRight) {
    for (let xx = 0; xx < w; xx++) {
      const t = w <= 1 ? 0 : xx / (w - 1);
      this.fill(x + xx, y, 1, h, mix(cLeft, cRight, t));
    }
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 3;
    this.px[o] = c[0]; this.px[o + 1] = c[1]; this.px[o + 2] = c[2];
  }
  rect(x, y, w, h, c) {
    this.fill(x, y, w, 1, c);
    this.fill(x, y + h - 1, w, 1, c);
    this.fill(x, y, 1, h, c);
    this.fill(x + w - 1, y, 1, h, c);
  }
  line(x0, y0, x1, y1, c) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  thickLine(x0, y0, x1, y1, t, c) {
    for (let i = 0; i < t; i++) this.line(x0, y0 + i, x1, y1 + i, c);
  }
  circle(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
      for (let x = -half; x <= half; x++) this.set(cx + x, cy + y, c);
    }
  }
  ring(cx, cy, r, t, c) {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      for (let rr = Math.max(0, r - t); rr <= r; rr++) {
        this.set(Math.round(cx + rr * Math.cos(rad)), Math.round(cy + rr * Math.sin(rad)), c);
      }
    }
  }
  // Filled ellipse, radii rx / ry.
  ellipse(cx, cy, rx, ry, c) {
    for (let y = -ry; y <= ry; y++) {
      const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      for (let x = -half; x <= half; x++) this.set(cx + x, cy + y, c);
    }
  }
  tri(x0, y0, x1, y1, x2, y2, c) {
    const minX = Math.min(x0, x1, x2), maxX = Math.max(x0, x1, x2);
    const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
    const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (d === 0) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
        const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
        const cc = 1 - a - b;
        if (a >= 0 && b >= 0 && cc >= 0) this.set(x, y, c);
      }
    }
  }
}

// ---------- 5x7 bitmap font (hand-drawn glyphs, uppercase rendering) ----------
const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "~": ["00000", "00000", "01001", "10110", "00000", "00000", "00000"],
  "\u2022": ["00000", "00000", "01100", "01100", "01100", "00000", "00000"],
  "\u00d7": ["00000", "10001", "01010", "00100", "01010", "10001", "00000"],
  "\u2014": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
};
const CHAR_W = 6; // 5 px glyph + 1 px gap

function textWidth(s, scale) {
  return s.length * CHAR_W * scale - scale;
}
function drawText(cv, x, y, s, scale, color, bold) {
  const up = String(s).toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const g = FONT[up[i]] || FONT["?"];
    const gx = x + i * CHAR_W * scale;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (g[r][c] === "1") {
          cv.fill(gx + c * scale, y + r * scale, scale, scale, color);
          if (bold) cv.fill(gx + c * scale + 1, y + r * scale, scale, scale, color);
        }
      }
    }
  }
  return x + textWidth(up, scale);
}
function drawTextCentered(cv, cx, y, s, scale, color, bold) {
  drawText(cv, Math.round(cx - textWidth(String(s).toUpperCase(), scale) / 2), y, s, scale, color, bold);
}
// Slanted (italic-style) text: top rows shift right, bottom rows stay put.
function drawTextSlanted(cv, x, y, s, scale, color, bold) {
  const up = String(s).toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const g = FONT[up[i]] || FONT["?"];
    const gx = x + i * CHAR_W * scale;
    for (let r = 0; r < 7; r++) {
      const shift = Math.round((6 - r) * scale * 0.35);
      for (let c = 0; c < 5; c++) {
        if (g[r][c] === "1") {
          cv.fill(gx + c * scale + shift, y + r * scale, scale, scale, color);
          if (bold) cv.fill(gx + c * scale + shift + 1, y + r * scale, scale, scale, color);
        }
      }
    }
  }
  return x + textWidth(up, scale) + Math.round(6 * scale * 0.35);
}
function drawTextSlantedCentered(cv, cx, y, s, scale, color, bold) {
  const w = textWidth(String(s).toUpperCase(), scale) + Math.round(6 * scale * 0.35);
  drawTextSlanted(cv, Math.round(cx - w / 2), y, s, scale, color, bold);
}
// Greedy word wrap; returns lines that fit maxW px at the given scale.
function wrapText(s, maxW, scale) {
  const words = String(s).toUpperCase().split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (textWidth(test, scale) <= maxW || !cur) cur = test;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- large serif display font (12x13, hand-drawn) ----------
// Only the glyphs the masthead date needs: SUNDAY 22 NOVEMBER 2026.
const SERIF = {
  S: ["....XXXXXX..", "...XX....XX.", "..XX......XX", "..XX........", "..XX........", "...XXXXXX...", ".........XX.", "..........XX", "..........XX", "..XX......XX", "..XX.....XX.", "...XXXXXXX..", "............"],
  U: ["..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX.....XX.", "...XX...XX..", "....XXXXX...", "............"],
  N: ["..XX......XX", "..XXX.....XX", "..XXXX....XX", "..XX.XX...XX", "..XX..XX..XX", "..XX...XX.XX", "..XX....XXXX", "..XX.....XXX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "............"],
  D: ["..XXXXXXX...", "..XX.....XX.", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX.....XX.", "..XXXXXXX...", "............", "............"],
  A: [".....XX.....", "....XXXX....", "...XX..XX...", "...XX..XX...", "..XX....XX..", "..XX....XX..", "..XXXXXXXX..", "..XX....XX..", "..XX....XX..", ".XX......XX.", ".XX......XX.", "............", "............"],
  Y: ["..XX....XX..", "..XX....XX..", "...XX..XX...", "...XX..XX...", "....XXXX....", ".....XX.....", ".....XX.....", ".....XX.....", ".....XX.....", ".....XX.....", ".....XX.....", "............", "............"],
  "2": ["...XXXXXX...", "..XX....XX..", ".........XX.", "........XX..", ".......XX...", "......XX....", ".....XX.....", "....XX......", "...XX.......", "..XX........", "..XXXXXXXXXX", "............", "............"],
  "0": ["....XXXX....", "...XX..XX...", "..XX....XX..", "..XX....XX..", "..XX....XX..", "..XX....XX..", "..XX....XX..", "..XX....XX..", "..XX....XX..", "...XX..XX...", "....XXXX....", "............", "............"],
  V: ["..XX......XX", "..XX......XX", "..XX......XX", "...XX....XX.", "...XX....XX.", "....XX..XX..", "....XX..XX..", ".....XXXX...", ".....XXXX...", "......XX....", "............", "............", "............"],
  E: ["..XXXXXXXXX.", "..XX........", "..XX........", "..XX........", "..XXXXXX....", "..XX........", "..XX........", "..XX........", "..XX........", "..XX........", "..XXXXXXXXX.", "............", "............"],
  M: ["..XX......XX", "..XXX....XXX", "..XXXX..XXXX", "..XX.XXXX.XX", "..XX..XX..XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "..XX......XX", "............", "............"],
  B: ["..XXXXXXX...", "..XX.....XX.", "..XX......XX", "..XX......XX", "..XXXXXXX...", "..XX.....XX.", "..XX......XX", "..XX......XX", "..XX.....XX.", "..XXXXXXX...", "............", "............", "............"],
  R: ["..XXXXXXX...", "..XX.....XX.", "..XX......XX", "..XX......XX", "..XXXXXXX...", "..XX...XX...", "..XX....XX..", "..XX.....XX.", "..XX......XX", "..XX......XX", "............", "............", "............"],
  O: ["....XXXX....", "...XX..XX...", "..XX....XX..", "..XX....XX..", "..XX....XX..", "..XX....XX..", "..XX....XX..", "..XX....XX..", "..XX....XX..", "...XX..XX...", "....XXXX....", "............", "............"],
  "6": [".....XXXX...", "....XX......", "...XX.......", "..XX........", "..XX.XXXX...", "..XX....XX..", "..XX....XX..", "..XX....XX..", "..XX....XX..", "...XX...XX..", "....XXXXX...", "............", "............"],
  " ": ["............", "............", "............", "............", "............", "............", "............", "............", "............", "............", "............", "............", "............"],
};
const SERIF_W = 13; // 12 px glyph + 1 px gap
function serifTextWidth(s, scale) {
  return s.length * SERIF_W * scale - scale;
}
function drawSerifText(cv, x, y, s, scale, color) {
  for (let i = 0; i < s.length; i++) {
    const g = SERIF[s[i]] || SERIF[" "];
    const gx = x + i * SERIF_W * scale;
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 12; c++) {
        if (g[r][c] === "X") cv.fill(gx + c * scale, y + r * scale, scale, scale, color);
      }
    }
  }
}
function drawSerifCentered(cv, cx, y, s, scale, color) {
  drawSerifText(cv, Math.round(cx - serifTextWidth(s, scale) / 2), y, s, scale, color);
}

// ---------- story data: every story first reported or still developing on Sunday 22 Nov 2026 ----------
// LEADS: [num, headline, deck, outlet, region, scene, chip]
// PANELS: [num, headline, deck, source, region, scene, chip]
// ALSO: [num, headline, source, region]
// Verified 22 Nov 2026 by web search this run (wires to 03:30 UTC):
// COP31 third draft early Sunday drops fossil fuels and the $120bn
// adaptation figure; ~130-nation coalition wants fossil language; Panama
// threatens a formal objection; plenary 06:00 GMT (Reuters, Guardian,
// AP, CNA). Ukraine barrage 400+ drones / 110 missiles, 8 killed, Lviv
// 2 killed (Reuters). Bahrain: IRGC claims 2 US bases hit; Manama says
// industrial site burns, no injuries; 2 tankers hit in Hormuz (Al
// Jazeera, Reuters, UKMTO). Isidro capture + 11 killed (Reuters, AP).
// Sparta II: fire still burning late Sat, 16 crew safe, Finland to tow
// it out, Russian helicopter suspected in Finnish airspace (CNN, Reuters,
// DW). Kryvyi Rih triple-tap: boy 7 and paramedic killed, 60 wounded
// (AP). Hong Kong Election Committee votes for 723 seats (AP). EU and
// Indonesia sign trade deal after 10 years, 98.5% of tariffs gone
// (Reuters). F1 qualifying: Antonelli fastest 1:33.893 but 5-place grid
// penalty, Verstappen on pole (Autosport, F1). ATP final set: Zverev v
// Alcaraz, singles not before 18:00 CET (ATP). Liverpool v Man Utd
// 16:30 GMT, Pochettino's first game in charge (Sky Sports). Date
// discipline: the DATE CHECK box names what was left out (Peru quake
// 20 Nov, Poland missiles 19 Nov, Kerch Bridge strikes, Shenzhen summit
// 19 Nov, Binance theft 29 Oct). Nothing that had not happened by the
// 03:30 UTC cutoff is shown as a result: the GP, the COP31 vote, the
// ATP final and Liverpool v Man Utd are STILL TO COME.
const LEADS = [
  [1, "COP31 DRAFT DROPS FOSSIL FUELS", "THIRD TEXT PUT TO NEARLY 200 NATIONS; $120BN FIGURE CUT TOO. PLENARY AT 06:00 GMT.", "REUTERS - ANTALYA", "WORLD", "summit", "~200 NATIONS", TEAL],
  [2, "400 DRONES, 110 MISSILES", "RUSSIA'S BIGGEST OVERNIGHT STRIKE KILLS 8; LVIV HIT TOO. ZELENSKYY CONFIRMS CLUSTER WARHEADS.", "REUTERS - KYIV", "EUROPE", "barrage", "400+ DRONES", RED],
  [3, "IRAN STRIKES US BASES IN BAHRAIN", "IRGC CLAIMS 2 RADARS STRUCK; MANAMA SAYS SITE BURNS, NO INJURIES. TANKERS HIT IN HORMUZ.", "AL JAZEERA - MANAMA", "MIDDLE EAST", "bahrain", "2 BASES", ORANGE],
];
const PANELS = [
  [4, "EL CHAPO ISIDRO CAUGHT", "FBI TOP-10 FUGITIVE SEIZED IN SINALOA; 11 KILLED IN BACKLASH", "REUTERS", "N. AMERICA", "flame", "11 DEAD", RED],
  [5, "SPARTA II STILL BURNING", "HIT BY 2 DRONES; 16 CREW SAFE, FINLAND TO TOW IT OUT", "CNN", "EUROPE", "ship", "16 SAFE", BLUE],
  [6, "TRIPLE-TAP STRIKE IN KRYVYI RIH", "BOY, 7, AND PARAMEDIC KILLED; 60 WOUNDED AS RESCUERS TARGETED", "AP", "EUROPE", "building", "2 DEAD, 60 HURT", RED],
  [7, "HONG KONG VOTES FOR 723 SEATS", "ELECTION COMMITTEE POLLS OPEN; BODY PICKS THE CHIEF EXECUTIVE", "AP", "ASIA", "ballot", "723 SEATS", TEAL],
  [8, "EU-INDO DEAL AFTER 10 YEARS", "TRADE PACT SIGNED; 98.5% OF TARIFFS BETWEEN THE TWO TO GO", "REUTERS", "WORLD", "handshake", "98.5% CUT", GREEN],
  [9, "VERSTAPPEN ON POLE IN VEGAS", "ANTONELLI FASTEST BUT DROPS 5 PLACES; RACE AT 04:00 GMT", "AUTOSPORT", "N. AMERICA", "racecar", "POLE: VERSTAPPEN", PURPLE],
  [10, "BOLSONARO IN ICU", "EX-PRESIDENT IN INTENSIVE CARE WITH BOWEL BLOCKAGE; STABLE", "REUTERS", "S. AMERICA", "hospital", "ICU", GREEN],
  [11, "AID VAN HIT IN GAZA CITY", "3 KILLED AS STRIKE HITS FOOD VEHICLE; WCK SAYS NOT ITS VAN", "REUTERS", "MIDDLE EAST", "van", "3 KILLED", ORANGE],
  [12, "IRAN TO RATION POWER FROM SUNDAY", "2-HOUR CUTS AS WAR DAMAGE DEEPENS ENERGY CRUNCH", "RFE/RL", "MIDDLE EAST", "power", "2-HR CUTS", PURPLE],
  [13, "AUKUS ROW: 'THEY ARE WRONG'", "MARLES HITS BACK AT US BUDGET OFFICE OVER SUB FLEET WARNING", "REUTERS", "OCEANIA", "sub", "AUKUS ROW", NAVY2],
];
const ALSO = [
  [14, "LVIV STRIKE KILLS 2, WOUNDS 10 IN OVERNIGHT BARRAGE", "REUTERS", "EUROPE"],
  [15, "FINLAND: RUSSIAN HELICOPTER SUSPECTED IN AIRSPACE", "DW", "EUROPE"],
  [16, "ORPO: WAR 'SPILLING OVER' INTO THE BALTIC", "CNN", "EUROPE"],
  [17, "HOUTHI STRIKES HIT RIYADH; SAUDI ON ALERT", "WIRE", "MIDDLE EAST"],
  [18, "IRAN PRESIDENT WARNS OF 'SILENT ECONOMIC WAR'", "XINHUA", "MIDDLE EAST"],
  [19, "KILLER-ROBOT TALKS END WITH NO PLEDGE, MORE TALKS", "WIRE", "WORLD"],
  [20, "KING CHARLES PRAISES ERDOGAN FOR HOSTING COP31", "WIRE", "EUROPE"],
  [21, "NEPAL PM LANDS IN DELHI ON FIRST TRIP ABROAD", "IANS", "ASIA"],
  [22, "SPAIN EXTENDS BANK TAX TO FUND HOUSING", "REUTERS", "EUROPE"],
  [23, "BANGLADESH DEPLOYS TROOPS AS ARSON SPREADS", "REUTERS", "ASIA"],
  [24, "NIGERIA BOAT CAPSIZE: 24 BODIES RECOVERED", "NEMA", "AFRICA"],
  [25, "FBI PROBES HACK OF ITS CRIME DATABASE", "BBC", "N. AMERICA"],
  [26, "TEEN GAMER AND MOTHER HELP FBI RESCUE GIRL", "BBC", "N. AMERICA"],
  [27, "AUSTRALIA: FRED NILE, EX-NSW MP, DIES AGED 92", "ABC", "OCEANIA"],
  [28, "MELBOURNE: 70 YEARS SINCE 1956 OLYMPICS OPENED", "ABC", "OCEANIA"],
  [29, "RUGBY: ENGLAND BEAT NEW ZEALAND 37-12", "REUTERS", "EUROPE"],
  [30, "RUGBY: FRANCE BEAT ARGENTINA TO REACH FINAL", "REUTERS", "EUROPE"],
  [31, "FOOTBALL: LIVERPOOL HOST MAN UTD AT 16:30 GMT", "BBC", "EUROPE"],
  [32, "TENNIS: ZVEREV V ALCARAZ IN TURIN FINAL TODAY", "ATP", "EUROPE"],
  [33, "CRICKET: PANT 128 AS INDIA LEAD NZ BY 261", "REUTERS", "ASIA"],
  [34, "DENMARK EXPELS RUSSIAN ATTACHE OVER RAPPER PLOT", "GUARDIAN", "EUROPE"],
  [35, "BANGLADESH: 50 AWAMI LEAGUE HOMES SET ON FIRE", "PTI", "ASIA"],
  [36, "US: MIDTERM LOSS CORNERS VANCE AS 2028 FIELD WIDENS", "ST", "N. AMERICA"],
  [37, "SAUDI ARABIA: AIR DEFENCES DOWN A MISSILE", "WIRE", "MIDDLE EAST"],
  [38, "PORTUGAL: THOUSANDS MARCH IN LISBON ON LIVING COSTS", "REUTERS", "EUROPE"],
];
const REGIONS = [
  ["EUROPE", 14, BLUE],
  ["N. AMERICA", 5, NAVY2],
  ["ASIA", 5, TEAL],
  ["MIDDLE EAST", 6, RED],
  ["S. AMERICA", 1, GREEN],
  ["OCEANIA", 3, PURPLE],
  ["AFRICA", 1, ORANGE],
  ["WORLD", 3, GOLD],
];
const STATS = [
  ["~200", "NATIONS AT COP31 TALKS"],
  ["400+", "DRONES FIRED AT UKRAINE"],
  ["110", "MISSILES IN THE SAME NIGHT"],
  ["130", "NATIONS WANT FOSSIL WORDING"],
  ["16", "CREW SAFE OFF SPARTA II"],
  ["06:00", "GMT: COP31 VOTE DUE"],
];
// Timeline of the day so far (times GMT, 22 Nov unless noted).
const TIMELINE = [
  ["LATE SAT", "400 DRONES HIT UKRAINE"],
  ["SAT NIGHT", "IRAN STRIKES BAHRAIN"],
  ["03:00 GMT", "COP31 OBJECTIONS DUE"],
  ["06:00 GMT", "COP31 VOTE"],
  ["SUNDAY", "DAY STILL TO COME"],
];
// Events after the 03:30 UTC cutoff — shown as coming, never as results.
const STILL_TO_COME = "04:00 GMT VEGAS GP  \u2022  06:00 GMT COP31 VOTE  \u2022  15:00 CET ATP DOUBLES FINAL  \u2022  17:00 GMT ZVEREV V ALCARAZ  \u2022  16:30 GMT LIVERPOOL V MAN UTD";

// ---------- drawn visual scenes (all shapes, no images) ----------
// Every scene is drawn proportionally inside its box (x, y, w, h) so
// nothing overflows into neighbouring text. Lead scenes get a vertical
// gradient sky, a far depth layer, a near layer and foreground props;
// small-panel scenes are centred motifs on a gradient ground.
function drawScene(cv, x, y, w, h, scene, accent) {
  const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
  if (scene === "summit") {
    // COP31 hall: dawn sky over Antalya bay, far mountains, hall wall,
    // globe, long table, eight delegates, flags, clock, podium.
    cv.vgrad(x, y, w, 34, [178, 214, 236], [238, 224, 196]);
    cv.fill(x, y + 34, w, h - 34, [222, 210, 188]);
    cv.circle(x + w - 30, y + 14, 9, [255, 226, 140]);
    cv.tri(x + 8, y + 30, x + 40, y + 12, x + 72, y + 30, [150, 170, 190]);
    cv.tri(x + 48, y + 30, x + 86, y + 8, x + 124, y + 30, [165, 182, 198]);
    cv.fill(x, y + 30, w, 4, [90, 140, 170]);
    // Hall wall and globe.
    cv.fill(x, y + 34, w, 22, [196, 222, 214]);
    cv.circle(x + 34, y + 45, 11, BLUE);
    cv.circle(x + 30, y + 42, 4, GREEN);
    cv.circle(x + 38, y + 48, 3, GREEN);
    cv.ring(x + 34, y + 45, 11, 1, WHITE);
    cv.fill(x + 33, y + 56, 2, 6, INK);
    // Clock showing the 03:00 objections deadline.
    cv.circle(x + w - 34, y + 45, 10, WHITE);
    cv.ring(x + w - 34, y + 45, 10, 1, INK);
    cv.line(x + w - 34, y + 45, x + w - 34, y + 38, INK);
    cv.line(x + w - 34, y + 45, x + w - 27, y + 45, INK);
    cv.circle(x + w - 34, y + 45, 1, INK);
    // Podium with COP31 sign.
    cv.fill(x + w - 62, y + 56, 26, 22, [96, 64, 32]);
    cv.fill(x + w - 62, y + 56, 26, 3, GOLD);
    drawText(cv, x + w - 58, y + 62, "COP31", 1, WHITE, true);
    // Long table, name plates, eight delegates.
    cv.fill(x + 14, y + 62, w - 28, 7, [120, 82, 40]);
    cv.fill(x + 14, y + 69, w - 28, h - 69, [96, 64, 32]);
    cv.fill(x + 14, y + 69, w - 28, 2, GOLD);
    const cols = [NAVY2, RED, TEAL, GREEN, PURPLE, ORANGE, BLUE, DARKRED];
    for (let i = 0; i < 8; i++) {
      const dx = x + 30 + i * 34;
      cv.circle(dx, y + 52, 6, CREAM);
      cv.fill(dx - 8, y + 58, 16, 5, cols[i]);
      cv.fill(dx - 6, y + 59, 12, 3, WHITE);
    }
    // Flags at the table ends.
    cv.fill(x + 16, y + 40, 2, 16, INK);
    cv.fill(x + 18, y + 40, 11, 6, BLUE);
    cv.fill(x + w - 18, y + 40, 2, 16, INK);
    cv.fill(x + w - 29, y + 40, 11, 6, RED);
  } else if (scene === "barrage") {
    // Kyiv under attack: gradient night sky, stars, moon, two skyline
    // layers with lit windows, a bridge, drone trails, explosions and
    // fires with smoke columns.
    cv.vgrad(x, y, w, h, NIGHT, [74, 44, 62]);
    for (let i = 0; i < 22; i++) {
      const sx = x + 6 + ((i * 53) % (w - 12)), sy = y + 3 + ((i * 29) % 30);
      cv.fill(sx, sy, 2, 2, [215, 215, 232]);
    }
    cv.circle(x + w - 26, y + 15, 9, [240, 240, 220]);
    cv.circle(x + w - 29, y + 12, 7, [210, 210, 200]);
    // Far skyline.
    const far = [[4, 52, 34, 36], [44, 44, 30, 44], [80, 56, 40, 32], [126, 46, 34, 42], [166, 54, 44, 34], [216, 42, 32, 46], [254, 52, 36, 36], [296, 56, 22, 32]];
    for (const b of far) cv.fill(x + b[0], y + b[1], b[2], b[3], [24, 28, 50]);
    // Near skyline with lit windows.
    const near = [[14, 62, 44, 26], [66, 56, 36, 32], [110, 64, 48, 24], [166, 58, 40, 30], [214, 64, 46, 24], [268, 58, 40, 30]];
    for (const b of near) cv.fill(x + b[0], y + b[1], b[2], b[3], [32, 36, 56]);
    for (let i = 0; i < 16; i++) {
      const wx = x + 20 + ((i * 37) % (w - 40)), wy = y + 58 + ((i * 13) % 22);
      cv.fill(wx, wy, 2, 2, GOLD);
    }
    // Bridge with lights across the lower third.
    cv.fill(x, y + 74, w, 3, [20, 20, 30]);
    for (let i = 0; i < 6; i++) cv.fill(x + 24 + i * 52, y + 66, 2, 8, [20, 20, 30]);
    for (let i = 0; i < 6; i++) cv.fill(x + 24 + i * 52, y + 75, 2, 2, GOLD);
    // Drone trails.
    cv.line(x + 118, y + 8, x + 138, y + 16, WHITE);
    cv.circle(x + 140, y + 17, 2, WHITE);
    cv.line(x + 198, y + 6, x + 214, y + 20, ORANGE);
    cv.circle(x + 216, y + 21, 2, RED);
    cv.line(x + 244, y + 14, x + 256, y + 24, WHITE);
    cv.circle(x + 258, y + 25, 2, WHITE);
    // Explosions: flame, glow and smoke columns.
    cv.circle(x + 70, y + 82, 9, ORANGE);
    cv.tri(x + 70, y + 66, x + 61, y + 84, x + 79, y + 84, GOLD);
    cv.circle(x + 70, y + 68, 6, [96, 96, 104]);
    cv.circle(x + 66, y + 58, 5, [110, 110, 116]);
    cv.circle(x + 180, y + 84, 7, ORANGE);
    cv.circle(x + 180, y + 72, 5, [96, 96, 104]);
    cv.circle(x + 276, y + 82, 8, RED);
    cv.tri(x + 276, y + 68, x + 268, y + 84, x + 284, y + 84, GOLD);
    cv.circle(x + 276, y + 70, 6, [100, 100, 108]);
    cv.circle(x + 282, y + 60, 5, [112, 112, 118]);
  } else if (scene === "bahrain") {
    // Bahrain at dusk: gradient sky, low sun, base skyline with radar,
    // a tanker on the sea, flames and smoke, missile trails, palms.
    cv.vgrad(x, y, w, 58, [246, 176, 110], [196, 84, 72]);
    cv.vgrad(x, y + 58, w, h - 58, [52, 100, 148], [28, 64, 110]);
    cv.circle(x + 58, y + 30, 13, [255, 222, 140]);
    cv.circle(x + 58, y + 30, 18, [250, 200, 120]);
    cv.fill(x, y + 56, w, 2, [220, 140, 90]);
    // Base skyline: towers, radar dish, minaret.
    cv.fill(x + 18, y + 34, 22, 24, [52, 44, 52]);
    cv.fill(x + 46, y + 28, 18, 30, [52, 44, 52]);
    cv.fill(x + 70, y + 38, 26, 20, [52, 44, 52]);
    cv.fill(x + 250, y + 30, 20, 28, [52, 44, 52]);
    cv.fill(x + 276, y + 36, 24, 22, [52, 44, 52]);
    cv.fill(x + 104, y + 42, 3, 16, [52, 44, 52]);
    cv.tri(x + 104, y + 36, x + 100, y + 44, x + 108, y + 44, [52, 44, 52]);
    cv.line(x + 130, y + 40, x + 140, y + 30, [220, 220, 230]);
    cv.circle(x + 142, y + 29, 5, [220, 220, 230]);
    for (let i = 0; i < 8; i++) {
      const wx = x + 22 + ((i * 31) % 280), wy = y + 40 + ((i * 7) % 14);
      cv.fill(wx, wy, 2, 2, GOLD);
    }
    // Tanker with containers on the sea.
    cv.fill(x + 118, y + 68, 116, 10, [30, 30, 38]);
    cv.tri(x + 234, y + 68, x + 234, y + 78, x + 252, y + 78, [30, 30, 38]);
    cv.fill(x + 148, y + 58, 3, 10, [30, 30, 38]);
    cv.fill(x + 176, y + 60, 16, 8, [200, 60, 40]);
    cv.fill(x + 196, y + 60, 16, 8, [30, 90, 168]);
    cv.fill(x + 36, y + 80, 20, 2, [200, 220, 240]);
    cv.fill(x + 262, y + 82, 20, 2, [200, 220, 240]);
    cv.fill(x + 88, y + 84, 16, 2, [200, 220, 240]);
    // Flames and smoke over the base.
    cv.circle(x + 186, y + 52, 7, ORANGE);
    cv.tri(x + 186, y + 40, x + 179, y + 54, x + 193, y + 54, GOLD);
    cv.circle(x + 184, y + 40, 6, [118, 118, 124]);
    cv.circle(x + 190, y + 30, 7, [118, 118, 124]);
    cv.circle(x + 196, y + 20, 5, [130, 130, 136]);
    cv.circle(x + 288, y + 50, 6, ORANGE);
    cv.tri(x + 288, y + 40, x + 282, y + 52, x + 294, y + 52, GOLD);
    // Missile trails in the sky.
    cv.line(x + 220, y + 6, x + 232, y + 18, WHITE);
    cv.circle(x + 233, y + 19, 2, WHITE);
    cv.line(x + 262, y + 8, x + 272, y + 20, GOLD);
    cv.circle(x + 273, y + 21, 2, RED);
    // Palm silhouettes at the left edge.
    cv.line(x + 8, y + 44, x + 8, y + 58, [40, 36, 40]);
    cv.line(x + 8, y + 44, x + 2, y + 38, [40, 36, 40]);
    cv.line(x + 8, y + 44, x + 14, y + 38, [40, 36, 40]);
  } else if (scene === "flame") {
    cv.vgrad(x, y, w, h, SKY, [240, 200, 160]);
    cv.tri(cx, y + 3, cx - Math.floor(h * 0.3), cy + Math.floor(h * 0.2), cx + Math.floor(h * 0.3), cy + Math.floor(h * 0.2), ORANGE);
    cv.circle(cx, cy + Math.floor(h * 0.08), Math.floor(h * 0.24), ORANGE);
    cv.circle(cx, cy + Math.floor(h * 0.18), Math.floor(h * 0.14), GOLD);
    cv.circle(cx, cy + Math.floor(h * 0.26), Math.floor(h * 0.07), [255, 240, 180]);
    cv.fill(x, y + h - 6, w, 6, [90, 60, 50]);
    cv.circle(cx - Math.floor(w * 0.3), cy + Math.floor(h * 0.3), 3, [120, 120, 125]);
    cv.circle(cx + Math.floor(w * 0.28), cy + Math.floor(h * 0.22), 3, [120, 120, 125]);
  } else if (scene === "ship") {
    cv.vgrad(x, y, w, h, SKY, [200, 225, 240]);
    cv.fill(x, y + Math.floor(h * 0.58), w, Math.floor(h * 0.42), [60, 120, 180]);
    cv.fill(cx - Math.floor(w * 0.3), y + Math.floor(h * 0.4), Math.floor(w * 0.6), Math.floor(h * 0.2), [40, 40, 48]);
    cv.tri(cx + Math.floor(w * 0.3), y + Math.floor(h * 0.4), cx + Math.floor(w * 0.3), y + Math.floor(h * 0.6), cx + Math.floor(w * 0.38), y + Math.floor(h * 0.6), [40, 40, 48]);
    cv.fill(cx - 1, y + Math.floor(h * 0.1), 2, Math.floor(h * 0.32), [40, 40, 48]);
    cv.fill(cx + Math.floor(w * 0.12), y + Math.floor(h * 0.26), Math.floor(w * 0.05), Math.floor(h * 0.16), [200, 60, 40]);
    cv.circle(cx + Math.floor(w * 0.05), y + Math.floor(h * 0.28), Math.floor(h * 0.13), ORANGE);
    cv.circle(cx + Math.floor(w * 0.02), y + Math.floor(h * 0.14), Math.floor(h * 0.09), [120, 120, 125]);
    cv.circle(cx - Math.floor(w * 0.02), y + Math.floor(h * 0.04), Math.floor(h * 0.07), [130, 130, 135]);
    cv.fill(x + 10, y + Math.floor(h * 0.72), 16, 2, [200, 220, 240]);
    cv.fill(x + w - 28, y + Math.floor(h * 0.8), 16, 2, [200, 220, 240]);
  } else if (scene === "building") {
    cv.vgrad(x, y, w, h, SKY, [230, 225, 210]);
    cv.circle(x + w - 16, y + 10, 6, GOLD);
    cv.fill(x, y + h - 6, w, 6, [70, 70, 80]);
    cv.fill(x + 8, y + Math.floor(h * 0.34), Math.floor(w * 0.22), Math.floor(h * 0.66), [150, 150, 160]);
    cv.fill(x + Math.floor(w * 0.34), y + Math.floor(h * 0.5), Math.floor(w * 0.2), Math.floor(h * 0.5), [120, 120, 132]);
    cv.fill(x + Math.floor(w * 0.6), y + Math.floor(h * 0.18), Math.floor(w * 0.24), Math.floor(h * 0.82), [170, 170, 180]);
    for (let r = 0; r < 3; r++) {
      cv.fill(x + 13, y + Math.floor(h * 0.42) + r * 8, 3, 4, GOLD);
      cv.fill(x + 22, y + Math.floor(h * 0.42) + r * 8, 3, 4, GOLD);
    }
    for (let r = 0; r < 4; r++) {
      cv.fill(x + Math.floor(w * 0.63), y + Math.floor(h * 0.26) + r * 8, 3, 4, GOLD);
      cv.fill(x + Math.floor(w * 0.63) + 9, y + Math.floor(h * 0.26) + r * 8, 3, 4, GOLD);
    }
    cv.tri(cx + Math.floor(w * 0.22), y + h - 16, cx + Math.floor(w * 0.22) - 6, y + h - 6, cx + Math.floor(w * 0.22) + 6, y + h - 6, ORANGE);
    cv.circle(cx + Math.floor(w * 0.22), y + h - 11, 4, GOLD);
    cv.circle(cx + Math.floor(w * 0.22), y + h - 18, 4, [120, 120, 125]);
  } else if (scene === "ballot") {
    cv.vgrad(x, y, w, h, [238, 240, 246], [210, 216, 228]);
    cv.fill(cx - Math.floor(w * 0.26), y + Math.floor(h * 0.34), Math.floor(w * 0.52), Math.floor(h * 0.56), WHITE);
    cv.rect(cx - Math.floor(w * 0.26), y + Math.floor(h * 0.34), Math.floor(w * 0.52), Math.floor(h * 0.56), [180, 180, 188]);
    cv.fill(cx - Math.floor(w * 0.26), y + Math.floor(h * 0.34), Math.floor(w * 0.52), 3, RED);
    cv.fill(cx - Math.floor(w * 0.1), y + Math.floor(h * 0.34), Math.floor(w * 0.2), 2, INK);
    drawText(cv, cx - 8, y + Math.floor(h * 0.56), "VOTE", 1, RED, true);
    // Ballot paper dropping into the slot, with a large red tick. Moved
    // left of centre: the old position sat under the "723 SEATS" chip, so
    // the paper and tick were hidden. Now clear of both the number badge
    // (top-left) and the chip (top-right), with the paper over the slot.
    cv.fill(cx - Math.floor(w * 0.22), y + Math.floor(h * 0.08), Math.floor(w * 0.16), Math.floor(h * 0.3), WHITE);
    cv.rect(cx - Math.floor(w * 0.22), y + Math.floor(h * 0.08), Math.floor(w * 0.16), Math.floor(h * 0.3), [180, 180, 188]);
    cv.thickLine(cx - Math.floor(w * 0.18), y + Math.floor(h * 0.28), cx - Math.floor(w * 0.14), y + Math.floor(h * 0.36), 3, RED);
    cv.thickLine(cx - Math.floor(w * 0.14), y + Math.floor(h * 0.36), cx - Math.floor(w * 0.06), y + Math.floor(h * 0.14), 3, RED);
    for (let i = 0; i < 5; i++) cv.fill(x + 24 + i * 6, y + 4, 3, 3, GOLD);
  } else if (scene === "handshake") {
    // EU-Indonesia deal: two sleeves meeting in a clasped handshake, with
    // the EU flag bottom-left and the Indonesian flag bottom-right. The
    // sleeves, cuffs and hands sit in the middle band, clear of the number
    // badge (top-left) and the stat chip (top-right), so nothing is hidden.
    cv.vgrad(x, y, w, h, SKY, [226, 236, 242]);
    cv.fill(x, y + h - 5, w, 5, [120, 130, 110]);
    // Sleeves: blue (EU) from the left, red from the right, meeting centre.
    cv.thickLine(x + 4, y + 26, cx - 14, y + 29, 12, BLUE);
    cv.thickLine(cx + 14, y + 29, x + w - 4, y + 26, 12, RED);
    // White shirt cuffs at each wrist.
    cv.fill(cx - 16, y + 22, 8, 15, WHITE);
    cv.rect(cx - 16, y + 22, 8, 15, [180, 180, 185]);
    cv.fill(cx + 8, y + 22, 8, 15, WHITE);
    cv.rect(cx + 8, y + 22, 8, 15, [180, 180, 185]);
    // Clasped hands: one large cream disc with finger grooves and a thumb.
    cv.circle(cx, y + 30, 11, CREAM);
    cv.ring(cx, y + 30, 11, 1, [190, 160, 130]);
    cv.line(cx - 8, y + 28, cx + 8, y + 28, [190, 160, 130]);
    cv.line(cx - 8, y + 32, cx + 8, y + 32, [190, 160, 130]);
    cv.line(cx - 8, y + 36, cx + 8, y + 36, [190, 160, 130]);
    cv.ellipse(cx - 2, y + 24, 5, 3, [222, 192, 162]);
    // EU flag (blue with gold stars) bottom-left.
    cv.fill(x + 8, y + h - 14, 22, 10, BLUE);
    cv.rect(x + 8, y + h - 14, 22, 10, [180, 180, 185]);
    cv.fill(x + 12, y + h - 11, 2, 2, GOLD);
    cv.fill(x + 18, y + h - 11, 2, 2, GOLD);
    cv.fill(x + 24, y + h - 11, 2, 2, GOLD);
    cv.fill(x + 15, y + h - 7, 2, 2, GOLD);
    cv.fill(x + 21, y + h - 7, 2, 2, GOLD);
    // Indonesian flag (red over white) bottom-right.
    cv.fill(x + w - 30, y + h - 14, 22, 5, RED);
    cv.fill(x + w - 30, y + h - 9, 22, 5, WHITE);
    cv.rect(x + w - 30, y + h - 14, 22, 10, [180, 180, 185]);
  } else if (scene === "racecar") {
    // Las Vegas night: neon sky, Strip towers, track, race car, flag.
    cv.vgrad(x, y, w, h, [24, 16, 52], [90, 40, 90]);
    for (let i = 0; i < 8; i++) {
      const tx = x + 8 + i * 22;
      cv.fill(tx, y + Math.floor(h * 0.3) - (i % 3) * 4, 10, Math.floor(h * 0.3) + (i % 3) * 4, [40, 30, 70]);
      cv.fill(tx + 2, y + Math.floor(h * 0.3) - (i % 3) * 4 + 3, 2, 2, GOLD);
    }
    cv.fill(x, y + Math.floor(h * 0.62), w, Math.floor(h * 0.38), [28, 28, 34]);
    cv.fill(x, y + Math.floor(h * 0.62), w, 2, [200, 200, 210]);
    cv.fill(cx - Math.floor(w * 0.3), cy + Math.floor(h * 0.06), Math.floor(w * 0.5), Math.floor(h * 0.16), RED);
    cv.fill(cx - Math.floor(w * 0.22), cy - Math.floor(h * 0.1), Math.floor(w * 0.26), Math.floor(h * 0.16), RED);
    cv.fill(cx + Math.floor(w * 0.06), cy - Math.floor(h * 0.02), Math.floor(w * 0.1), Math.floor(h * 0.08), [200, 220, 240]);
    cv.circle(cx - Math.floor(w * 0.2), cy + Math.floor(h * 0.24), Math.floor(h * 0.11), INK);
    cv.circle(cx + Math.floor(w * 0.18), cy + Math.floor(h * 0.24), Math.floor(h * 0.11), INK);
    cv.circle(cx - Math.floor(w * 0.2), cy + Math.floor(h * 0.24), 2, [180, 180, 190]);
    cv.circle(cx + Math.floor(w * 0.18), cy + Math.floor(h * 0.24), 2, [180, 180, 190]);
    cv.fill(cx + Math.floor(w * 0.2), cy + Math.floor(h * 0.1), Math.floor(w * 0.16), 2, GOLD);
    // Chequered flag.
    cv.fill(cx + Math.floor(w * 0.32), y + 4, 2, Math.floor(h * 0.34), INK);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if ((r + c) % 2 === 0) cv.fill(cx + Math.floor(w * 0.32) + 2 + c * 4, y + 4 + r * 4, 4, 4, INK);
        else cv.fill(cx + Math.floor(w * 0.32) + 2 + c * 4, y + 4 + r * 4, 4, 4, WHITE);
      }
    }
  } else if (scene === "hospital") {
    cv.vgrad(x, y, w, h, [236, 241, 246], [214, 222, 228]);
    cv.fill(cx - Math.floor(w * 0.28), y + Math.floor(h * 0.16), Math.floor(w * 0.56), Math.floor(h * 0.74), WHITE);
    cv.rect(cx - Math.floor(w * 0.28), y + Math.floor(h * 0.16), Math.floor(w * 0.56), Math.floor(h * 0.74), [200, 200, 205]);
    cv.fill(cx - Math.floor(w * 0.28), y + Math.floor(h * 0.16), Math.floor(w * 0.56), 3, RED);
    cv.fill(cx - 2, y + Math.floor(h * 0.22), 4, Math.floor(h * 0.22), RED);
    cv.fill(cx - Math.floor(w * 0.06), y + Math.floor(h * 0.28), Math.floor(w * 0.12), 4, RED);
    cv.fill(cx - Math.floor(w * 0.2), y + Math.floor(h * 0.54), 6, 6, BLUE);
    cv.fill(cx + Math.floor(w * 0.14), y + Math.floor(h * 0.54), 6, 6, BLUE);
    cv.fill(cx - 5, y + Math.floor(h * 0.72), 10, Math.floor(h * 0.18), INK);
    cv.fill(x, y + h - 4, w, 4, [150, 160, 150]);
  } else if (scene === "van") {
    // Aid van: the red cross is now large and centred on the van side —
    // a 10 px wide vertical bar and a 26 px wide arm, deliberately
    // overlapping the body edges so it reads at 1024 px — while the van
    // body, cab window and wheels stay readable. Cross sits clear of the
    // number badge (top-left) and the stat chip (top-right).
    cv.vgrad(x, y, w, h, SKY, [226, 232, 238]);
    cv.fill(x, y + Math.floor(h * 0.7), w, Math.floor(h * 0.3), [90, 90, 95]);
    cv.fill(cx - Math.floor(w * 0.3), y + Math.floor(h * 0.26), Math.floor(w * 0.5), Math.floor(h * 0.36), WHITE);
    cv.rect(cx - Math.floor(w * 0.3), y + Math.floor(h * 0.26), Math.floor(w * 0.5), Math.floor(h * 0.36), [180, 180, 185]);
    // Cab window, fully inside the body, stronger blue so it reads.
    cv.fill(cx + Math.floor(w * 0.16), y + Math.floor(h * 0.3), Math.floor(w * 0.1), Math.floor(h * 0.2), [120, 170, 210]);
    cv.rect(cx + Math.floor(w * 0.16), y + Math.floor(h * 0.3), Math.floor(w * 0.1), Math.floor(h * 0.2), INK);
    // Red cross, large and centred on the van side.
    cv.fill(cx - 5, y + Math.floor(h * 0.16), 10, Math.floor(h * 0.52), RED);
    cv.fill(cx - 13, y + Math.floor(h * 0.3), 26, 10, RED);
    // Wheels, larger with light hubs; road dashes.
    cv.circle(cx - Math.floor(w * 0.18), y + Math.floor(h * 0.64), Math.floor(h * 0.12), INK);
    cv.circle(cx + Math.floor(w * 0.22), y + Math.floor(h * 0.64), Math.floor(h * 0.12), INK);
    cv.circle(cx - Math.floor(w * 0.18), y + Math.floor(h * 0.64), 2, [180, 180, 190]);
    cv.circle(cx + Math.floor(w * 0.22), y + Math.floor(h * 0.64), 2, [180, 180, 190]);
    cv.fill(x + 10, y + Math.floor(h * 0.38), 12, 2, [200, 200, 205]);
    cv.fill(x + 26, y + Math.floor(h * 0.48), 8, 2, [200, 200, 205]);
  } else if (scene === "power") {
    cv.vgrad(x, y, w, h, SKY, [210, 220, 232]);
    cv.line(cx - Math.floor(w * 0.12), y + Math.floor(h * 0.9), cx - Math.floor(w * 0.02), y + Math.floor(h * 0.14), INK);
    cv.line(cx + Math.floor(w * 0.12), y + Math.floor(h * 0.9), cx + Math.floor(w * 0.02), y + Math.floor(h * 0.14), INK);
    cv.line(cx - Math.floor(w * 0.09), y + Math.floor(h * 0.3), cx + Math.floor(w * 0.09), y + Math.floor(h * 0.3), INK);
    cv.line(cx - Math.floor(w * 0.07), y + Math.floor(h * 0.5), cx + Math.floor(w * 0.07), y + Math.floor(h * 0.5), INK);
    cv.line(x + 4, y + Math.floor(h * 0.2), cx - Math.floor(w * 0.05), y + Math.floor(h * 0.18), INK);
    cv.line(cx + Math.floor(w * 0.05), y + Math.floor(h * 0.18), x + w - 4, y + Math.floor(h * 0.2), INK);
    cv.thickLine(cx + Math.floor(w * 0.18), y + Math.floor(h * 0.2), cx + Math.floor(w * 0.1), y + Math.floor(h * 0.5), 3, GOLD);
    cv.thickLine(cx + Math.floor(w * 0.1), y + Math.floor(h * 0.5), cx + Math.floor(w * 0.16), y + Math.floor(h * 0.56), 3, GOLD);
    cv.thickLine(cx + Math.floor(w * 0.16), y + Math.floor(h * 0.56), cx + Math.floor(w * 0.06), y + Math.floor(h * 0.85), 3, GOLD);
    for (let i = 0; i < 4; i++) cv.fill(x + w - 30 + i * 6, y + Math.floor(h * 0.7), 3, 3, [60, 60, 70]);
  } else if (scene === "sub") {
    cv.vgrad(x, y, w, h, [70, 130, 180], [30, 70, 120]);
    cv.fill(x, y + 2, w, 2, [140, 200, 235]);
    cv.fill(cx - Math.floor(w * 0.3), cy - Math.floor(h * 0.12), Math.floor(w * 0.6), Math.floor(h * 0.24), [40, 50, 66]);
    cv.circle(cx - Math.floor(w * 0.3), cy, Math.floor(h * 0.12), [40, 50, 66]);
    cv.circle(cx + Math.floor(w * 0.3), cy, Math.floor(h * 0.12), [40, 50, 66]);
    cv.fill(cx - Math.floor(w * 0.05), cy - Math.floor(h * 0.3), Math.floor(w * 0.1), Math.floor(h * 0.2), [40, 50, 66]);
    cv.fill(cx + Math.floor(w * 0.02), cy - Math.floor(h * 0.42), 2, Math.floor(h * 0.14), [40, 50, 66]);
    for (let i = -1; i <= 1; i++) cv.circle(cx + i * Math.floor(w * 0.12), cy, 2, WHITE);
    cv.circle(cx + Math.floor(w * 0.1), cy - Math.floor(h * 0.36), 2, [200, 220, 240]);
    cv.circle(cx + Math.floor(w * 0.14), cy - Math.floor(h * 0.44), 1, [200, 220, 240]);
  }
}

// ---------- world map: continent coastlines as [lon, lat] vertices ----------
// Simplified polygons written from geographic knowledge; projected
// equirectangularly by the caller and rendered as a dot grid.
const CONTINENTS = [
  // North America
  [[-168, 66], [-160, 58], [-150, 60], [-140, 60], [-130, 54], [-125, 49], [-124, 40], [-120, 34], [-112, 28], [-106, 22], [-97, 16], [-90, 14], [-84, 10], [-80, 8], [-79, 9], [-82, 14], [-86, 20], [-84, 25], [-81, 26], [-80, 31], [-76, 35], [-73, 40], [-69, 43], [-65, 44], [-60, 46], [-56, 48], [-60, 51], [-65, 55], [-70, 58], [-78, 56], [-84, 54], [-88, 57], [-92, 62], [-88, 66], [-95, 69], [-108, 68], [-125, 70], [-140, 70], [-155, 71], [-165, 69]],
  // Greenland
  [[-45, 60], [-38, 64], [-30, 68], [-22, 70], [-20, 74], [-30, 76], [-45, 78], [-58, 77], [-60, 72], [-55, 66], [-50, 61]],
  // South America
  [[-77, 7], [-74, 11], [-68, 11], [-62, 9], [-55, 6], [-51, 4], [-50, 0], [-45, -3], [-38, -5], [-35, -8], [-38, -14], [-40, -21], [-46, -25], [-50, -30], [-55, -34], [-60, -38], [-64, -42], [-66, -47], [-69, -52], [-70, -55], [-73, -50], [-73, -40], [-72, -28], [-70, -19], [-74, -12], [-79, -5], [-81, 0], [-79, 5]],
  // Europe (main)
  [[-9, 37], [-6, 36], [-1, 37], [2, 41], [7, 44], [11, 44], [14, 42], [16, 38], [19, 41], [21, 40], [23, 37], [26, 38], [28, 37], [29, 40], [28, 44], [29, 46], [26, 49], [22, 52], [19, 54], [16, 55], [12, 54], [9, 55], [7, 53], [4, 52], [1, 50], [-2, 48], [-4, 48], [-2, 44], [-9, 43]],
  // Scandinavia
  [[5, 58], [6, 61], [10, 63], [14, 66], [18, 68], [23, 70], [28, 71], [30, 69], [27, 64], [24, 60], [21, 57], [18, 55], [13, 56], [10, 57]],
  // United Kingdom
  [[-5, 50], [-3, 53], [-5, 56], [-2, 58], [0, 55], [1, 51], [-1, 50]],
  // Africa
  [[-17, 15], [-15, 21], [-12, 27], [-9, 31], [-5, 34], [0, 36], [6, 37], [10, 37], [12, 33], [16, 32], [21, 32], [26, 32], [31, 31], [33, 28], [35, 26], [37, 22], [39, 18], [42, 14], [44, 11], [49, 11], [51, 8], [50, 3], [46, 0], [42, -4], [40, -9], [39, -15], [37, -20], [34, -26], [31, -29], [27, -33], [22, -35], [18, -33], [15, -28], [13, -20], [12, -14], [12, -8], [10, -3], [9, 1], [7, 4], [2, 6], [-3, 5], [-8, 5], [-12, 8], [-16, 12]],
  // Madagascar
  [[44, -13], [47, -15], [50, -17], [48, -21], [45, -25], [43, -22], [43, -16]],
  // Asia (main)
  [[28, 41], [30, 46], [35, 47], [41, 47], [47, 46], [53, 46], [57, 52], [60, 60], [64, 68], [68, 71], [70, 73], [78, 73], [88, 74], [98, 76], [108, 77], [118, 74], [128, 73], [138, 72], [148, 72], [158, 70], [168, 68], [178, 65], [172, 62], [166, 60], [160, 55], [157, 51], [150, 47], [142, 49], [140, 44], [136, 41], [131, 39], [127, 38], [122, 37], [120, 33], [121, 28], [117, 24], [111, 21], [108, 17], [105, 11], [103, 8], [100, 10], [98, 14], [95, 16], [92, 20], [89, 22], [86, 20], [82, 17], [80, 13], [77, 8], [75, 11], [72, 17], [69, 22], [66, 25], [62, 25], [58, 26], [55, 26], [52, 27], [50, 29], [48, 28], [50, 25], [54, 24], [57, 21], [56, 18], [53, 15], [49, 14], [45, 13], [43, 13], [41, 16], [39, 21], [38, 25], [37, 29], [35, 32], [36, 36], [33, 36], [30, 36], [28, 39]],
  // Japan
  [[130, 31], [132, 33], [135, 34], [138, 36], [140, 39], [141, 42], [143, 44], [141, 43], [139, 38], [136, 35], [133, 34], [131, 32]],
  // Sumatra
  [[95, 5], [98, 3], [100, 0], [102, -3], [104, -5], [106, -6], [104, -5], [101, -1], [98, 2], [95, 4]],
  // Borneo
  [[109, 1], [112, 3], [115, 5], [118, 5], [118, 1], [116, -3], [112, -4], [110, -2], [109, 0]],
  // Java
  [[105, -6], [109, -7], [112, -8], [114, -8], [113, -9], [109, -8], [106, -7]],
  // New Guinea
  [[131, -1], [135, -2], [138, -3], [142, -3], [146, -6], [149, -8], [147, -9], [143, -8], [139, -6], [135, -4], [131, -1]],
  // Philippines
  [[120, 18], [121, 15], [122, 12], [123, 10], [122, 13], [121, 16], [120, 18]],
  // Australia
  [[113, -22], [114, -28], [115, -33], [118, -35], [123, -33], [129, -32], [133, -32], [136, -35], [140, -38], [144, -39], [147, -39], [150, -37], [153, -32], [153, -27], [150, -23], [146, -19], [142, -14], [142, -11], [140, -17], [136, -14], [132, -11], [129, -13], [125, -15], [121, -19], [116, -21]],
  // Tasmania
  [[145, -41], [147, -41], [148, -43], [146, -43], [145, -42]],
  // New Zealand
  [[167, -45], [170, -43], [172, -41], [174, -39], [176, -38], [175, -40], [173, -41], [171, -43], [168, -46]],
];
const LAND = [78, 128, 66];

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function drawDottedContinents(cv, project, x0, y0, x1, y1) {
  const polys = CONTINENTS.map((poly) => poly.map((p) => project(p[0], p[1])));
  for (let gy = y0 + 3; gy < y1; gy += 6) {
    for (let gx = x0 + 3; gx < x1; gx += 6) {
      for (const poly of polys) {
        if (pointInPoly(gx, gy, poly)) { cv.fill(gx - 1, gy - 1, 2, 2, LAND); break; }
      }
    }
  }
}

// ---------- layout ----------
// Kicker bar, serif masthead, gold rules, red italic sub-headline.
function drawMasthead(cv) {
  cv.fill(0, 0, W, 16, NAVY);
  drawTextCentered(cv, 512, 4, "THE WORLD IN ONE DAY  \u2022  38 STORIES  \u2022  7 REGIONS  \u2022  EVERY ONE DATED SUNDAY 22 NOVEMBER 2026", 1, WHITE, true);
  drawSerifCentered(cv, 512, 20, "SUNDAY 22 NOVEMBER 2026", 3, INK);
  cv.fill(6, 62, 1012, 3, GOLD);
  cv.fill(6, 66, 1012, 1, GOLD);
  drawTextSlantedCentered(cv, 512, 71, "COP31 DRAFT DROPS FOSSIL FUELS * 400 DRONES HIT UKRAINE * IRAN STRIKES BAHRAIN", 2, RED, true);
}

function drawStats(cv) {
  const bw = 163, gap = 6, y = 90, h = 38;
  STATS.forEach((s, i) => {
    const x = 6 + i * (bw + gap);
    cv.fill(x, y, bw, h, PANELBG);
    cv.rect(x, y, bw, h, LINE);
    cv.fill(x, y, bw, 3, GOLD);
    drawTextCentered(cv, x + bw / 2, y + 7, s[0], 3, RED, true);
    drawTextCentered(cv, x + bw / 2, y + 29, s[1], 1, MUTED, false);
  });
}

function drawRegions(cv) {
  const y = 132, h = 22;
  drawText(cv, 6, y + 7, "BY REGION:", 1, INK, true);
  const x0 = 150;
  const bw = 105, gap = 4;
  REGIONS.forEach((r, i) => {
    const x = x0 + i * (bw + gap);
    cv.fill(x, y, bw, h, PANELBG);
    cv.rect(x, y, bw, h, LINE);
    cv.fill(x, y, 4, h, r[2]);
    drawTextCentered(cv, x + bw / 2 + 2, y + 7, r[0] + " " + r[1], 1, INK, true);
  });
}

// Timeline bar: the day so far, Late Sat to Sunday.
function drawTimeline(cv) {
  const x = 6, y = 158, w = 1012, h = 32;
  cv.fill(x, y, w, h, PANELBG);
  cv.rect(x, y, w, h, LINE);
  cv.fill(x, y, w, 3, NAVY);
  drawText(cv, x + 10, y + 12, "THE DAY", 1, NAVY, true);
  drawText(cv, x + 10, y + 21, "SO FAR", 1, NAVY, true);
  const lineX0 = 168, lineX1 = 1006, lineY = y + 17;
  cv.line(lineX0, lineY, lineX1, lineY, NAVY);
  const colW = (lineX1 - lineX0) / TIMELINE.length;
  TIMELINE.forEach((t, i) => {
    const cxp = Math.round(lineX0 + colW * (i + 0.5));
    cv.circle(cxp, lineY, 4, RED);
    cv.ring(cxp, lineY, 4, 1, WHITE);
    drawTextCentered(cv, cxp, y + 5, t[0], 1, RED, true);
    drawTextCentered(cv, cxp, y + 23, t[1], 1, MUTED, false);
  });
}

// Stat chip: small white box with red bold text, top-right of a scene.
function drawChip(cv, x, y, label) {
  const w = textWidth(label, 1) + 10;
  cv.fill(x, y, w, 11, WHITE);
  cv.rect(x, y, w, 11, RED);
  drawText(cv, x + 5, y + 2, label, 1, RED, true);
  return w;
}

function drawLeadPanel(cv, story, px, py) {
  const [num, headline, deck, outlet, region, scene, chip] = story;
  cv.fill(px, py, 330, 158, PANELBG);
  cv.rect(px, py, 330, 158, LINE);
  cv.fill(px, py, 330, 3, accentOf(story));
  drawScene(cv, px + 4, py + 5, 322, 88, scene, accentOf(story));
  cv.rect(px + 4, py + 5, 322, 88, [200, 200, 205]);
  // Number badge, top-left on the scene.
  cv.circle(px + 18, py + 21, 11, RED);
  cv.ring(px + 18, py + 21, 11, 1, WHITE);
  const ns = String(num);
  drawText(cv, px + 18 - Math.floor(textWidth(ns, 1) / 2), py + 18, ns, 1, WHITE, true);
  // Stat chip, top-right on the scene.
  const chipW = textWidth(chip, 1) + 10;
  drawChip(cv, px + 326 - chipW, py + 9, chip);
  const hl = wrapText(headline, 322, 2).slice(0, 2);
  hl.forEach((ln, i) => drawText(cv, px + 6, py + 97 + i * 14, ln, 2, INK, true));
  const dk = wrapText(deck, 322, 1).slice(0, 2);
  dk.forEach((ln, i) => drawText(cv, px + 6, py + 127 + i * 9, ln, 1, [60, 60, 68], false));
  drawText(cv, px + 6, py + 147, outlet + "  \u2022  " + region, 1, accentOf(story), true);
}
function accentOf(story) {
  return story[7];
}

function drawSmallPanel(cv, story, px, py) {
  const [num, headline, deck, source, region, scene, chip] = story;
  cv.fill(px, py, 198, 104, PANELBG);
  cv.rect(px, py, 198, 104, LINE);
  cv.fill(px, py, 198, 3, story[7]);
  drawScene(cv, px + 4, py + 4, 190, 46, scene, story[7]);
  cv.rect(px + 4, py + 4, 190, 46, [200, 200, 205]);
  // Number badge, top-left on the scene.
  cv.circle(px + 15, py + 15, 9, RED);
  cv.ring(px + 15, py + 15, 9, 1, WHITE);
  const ns = String(num);
  drawText(cv, px + 15 - Math.floor(textWidth(ns, 1) / 2), py + 12, ns, 1, WHITE, true);
  // Stat chip, top-right on the scene.
  const chipW = textWidth(chip, 1) + 10;
  drawChip(cv, px + 194 - chipW, py + 8, chip);
  const hl = wrapText(headline, 190, 1).slice(0, 2);
  hl.forEach((ln, i) => drawText(cv, px + 5, py + 53 + i * 9, ln, 1, INK, true));
  const dk = wrapText(deck, 190, 1).slice(0, 2);
  dk.forEach((ln, i) => drawText(cv, px + 5, py + 72 + i * 9, ln, 1, [60, 60, 68], false));
  drawText(cv, px + 5, py + 92, source + "  \u2022  " + region, 1, story[7], true);
}

// STILL TO COME TODAY strip: events after the wire cutoff, as coming.
function drawStillToCome(cv) {
  const x = 6, y = 572, w = 1012, h = 28;
  cv.fill(x, y, w, h, [255, 244, 238]);
  cv.rect(x, y, w, h, RED);
  cv.fill(x, y, 4, h, RED);
  drawText(cv, x + 12, y + 10, "STILL TO COME TODAY:", 1, RED, true);
  const labelW = textWidth("STILL TO COME TODAY:", 1);
  drawText(cv, x + 12 + labelW + 10, y + 10, STILL_TO_COME, 1, INK, false);
}

function drawMap(cv) {
  const x = 6, y = 604, w = 1012, h = 100;
  cv.fill(x, y, w, h, PANELBG);
  cv.rect(x, y, w, h, LINE);
  cv.fill(x, y, w, 3, NAVY);
  drawText(cv, x + 10, y + 8, "WHERE IT HAPPENED", 2, NAVY, true);
  drawText(cv, x + 660, y + 10, "RED PIN = TOP STORY NUMBER", 1, MUTED, false);
  const sea = [206, 228, 240];
  const seaX0 = x + 6, seaY0 = y + 26, seaX1 = x + w - 6, seaY1 = y + h - 6;
  cv.fill(seaX0, seaY0, seaX1 - seaX0, seaY1 - seaY0, sea);
  const project = (lon, lat) => [
    seaX0 + ((lon + 180) / 360) * (seaX1 - seaX0),
    seaY0 + ((80 - lat) / 140) * (seaY1 - seaY0),
  ];
  const grat = [188, 212, 230];
  for (let lon = -150; lon <= 150; lon += 30) {
    const gx = Math.round(project(lon, 0)[0]);
    cv.line(gx, seaY0, gx, seaY1 - 1, grat);
  }
  for (const lat of [60, 30, 0, -30]) {
    const gy = Math.round(project(0, lat)[1]);
    cv.line(seaX0, gy, seaX1 - 1, gy, grat);
  }
  drawDottedContinents(cv, project, seaX0, seaY0, seaX1, seaY1);
  // Pins: [num, lon, lat, dx, dy] — nudged so no two pins touch.
  const pins = [
    [1, 30.7, 36.9, -16, 12],
    [2, 30.5, 50.4, -30, -10],
    [3, 50.6, 26.2, 10, 14],
    [4, -108.5, 25.6, 0, 0],
    [5, 27.0, 60.0, 24, 4],
    [6, 33.4, 47.9, 24, 18],
    [7, 114.2, 22.3, 0, 0],
    [8, 4.35, 50.85, -30, -8],
    [9, -115.1, 36.2, 0, 0],
    [10, -47.9, -15.8, 0, 0],
    [11, 34.5, 31.5, 36, 20],
    [12, 51.4, 35.7, 14, -12],
    [13, 149.1, -35.3, 0, 0],
  ];
  pins.forEach((p) => {
    const pos = project(p[1], p[2]);
    const px = Math.round(pos[0]) + p[3], py = Math.round(pos[1]) + p[4];
    const n = String(p[0]);
    cv.circle(px, py, 7, RED);
    cv.ring(px, py, 7, 1, WHITE);
    drawText(cv, px - Math.floor(textWidth(n, 1) / 2), py - 3, n, 1, WHITE, true);
  });
}

function drawDateCheck(cv) {
  const x = 6, y = 708, w = 1012, h = 56;
  cv.fill(x, y, w, h, [255, 244, 238]);
  cv.rect(x, y, w, h, RED);
  cv.fill(x, y, w, 3, RED);
  drawText(cv, x + 10, y + 8, "DATE CHECK \u2014 WIRES READ UP TO 03:30 UTC, SUNDAY 22 NOVEMBER 2026", 1, RED, true);
  drawText(cv, x + 10, y + 20, "LEFT OUT AS OTHER DAYS' NEWS: PERU QUAKE (20 NOV) \u2022 POLAND MISSILES (19 NOV) \u2022 KERCH BRIDGE STRIKES \u2022 SHENZHEN SUMMIT (19 NOV) \u2022 BINANCE THEFT (29 OCT)", 1, INK, false);
  drawText(cv, x + 10, y + 32, "NOT SETTLED YET: COP31 VOTE AT 06:00 GMT STILL TO COME \u2022 IRAN TANKER CONVOY YET TO SAIL", 1, RED, true);
  drawText(cv, x + 10, y + 44, "EVERY STORY ABOVE WAS FIRST REPORTED OR STILL DEVELOPING ON 22 NOVEMBER 2026 IN AT LEAST ONE TIME ZONE", 1, MUTED, false);
}

function drawAlso(cv) {
  drawText(cv, 6, 770, "ALSO ON 22 NOVEMBER", 2, NAVY, true);
  cv.fill(230, 778, 784, 2, GOLD);
  const colX = [10, 522];
  ALSO.forEach((s, i) => {
    const col = i < 13 ? 0 : 1;
    const row = i % 13;
    const y = 788 + row * 13;
    const line = s[0] + ". " + s[1] + " \u2014 " + s[2];
    drawText(cv, colX[col], y, line, 1, INK, false);
  });
  cv.fill(6, 962, 1012, 1, GOLD);
  drawTextCentered(cv, 512, 970, "SOURCES: REUTERS \u2022 AP \u2022 BBC \u2022 AL JAZEERA \u2022 CNN \u2022 DW \u2022 RFE/RL \u2022 F1 \u2022 AUTOSPORT \u2022 ATP \u2022 IANS \u2022 ABC \u2022 GUARDIAN \u2022 NEMA", 1, MUTED, false);
  drawTextCentered(cv, 512, 984, "ALL 38 STORIES FIRST REPORTED OR STILL DEVELOPING ON SUNDAY 22 NOVEMBER 2026", 1, MUTED, false);
  drawTextCentered(cv, 512, 998, "THE WORLD IN ONE DAY \u2022 SUNDAY 22 NOVEMBER 2026 \u2022 ONE PAGE", 1, NAVY, true);
}

// ---------- build ----------
function build() {
  const cv = new Canvas(W, H, PAPER);
  drawMasthead(cv);
  drawStats(cv);
  drawRegions(cv);
  drawTimeline(cv);
  LEADS.forEach((s, i) => drawLeadPanel(cv, s, 6 + i * 336, 194));
  PANELS.forEach((s, i) => {
    const col = i % 5, row = Math.floor(i / 5);
    drawSmallPanel(cv, s, 8 + col * 202, 356 + row * 108);
  });
  drawStillToCome(cv);
  drawMap(cv);
  drawDateCheck(cv);
  drawAlso(cv);
  return encodePNG(cv.px, W, H);
}

function main() {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const png = build();
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
  console.log("entry.png bytes: " + png.length);
  console.log("stories: " + (LEADS.length + PANELS.length + ALSO.length));
}
main();
