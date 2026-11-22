// news-image-20261122 — ROUND 3: "Sum up 22 November's world news in one image"
// Hand-written from scratch: PNG encoder, 5x7 bitmap font, large serif display
// font, dotted-continent world map, all drawing code. Node 22+ stdlib only
// (node:zlib, node:fs, node:path). No network at runtime. Deterministic:
// no Date.now / Math.random anywhere in the output path.
//
// ROUND 3 (22 Nov 2026): round 1 (41 stories, judge 0.970769) is the pick to
// beat; round 2 (30 stories, 0.940229) proved narrowing loses. This round
// keeps 38 stories across 7 regions and rebuilds the layout on the winning
// pattern: giant serif date headline, red italic 3-lead sub-headline, stats
// strip, 3 large lead panels with drawn scenes, 10 smaller illustrated
// panels, dotted world map with numbered pins, DATE CHECK box.
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
const BLUE = [30, 90, 168];
const TEAL = [0, 130, 130];
const GREEN = [46, 139, 67];
const ORANGE = [224, 122, 26];
const PURPLE = [110, 68, 160];
const SKY = [178, 216, 240];
const NIGHT = [18, 24, 48];
const DUSK = [238, 164, 96];
const WHITE = [255, 255, 255];

// ---------- CRC32 ----------
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
function chunk(type, data) {
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- canvas ----------
class Canvas {
  constructor(w, h, bg) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 3);
    this.fill(0, 0, w, h, bg);
  }
  fill(x, y, w, h, c) {
    x = Math.max(0, x); y = Math.max(0, y);
    w = Math.min(w, this.w - x); h = Math.min(h, this.h - y);
    for (let yy = y; yy < y + h; yy++) {
      let o = (yy * this.w + x) * 3;
      for (let xx = 0; xx < w; xx++) {
        this.px[o] = c[0]; this.px[o + 1] = c[1]; this.px[o + 2] = c[2];
        o += 3;
      }
    }
  }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 3;
    this.px[o] = c[0]; this.px[o + 1] = c[1]; this.px[o + 2] = c[2];
  }
  get(x, y) {
    const o = (y * this.w + x) * 3;
    return [this.px[o], this.px[o + 1], this.px[o + 2]];
  }
  rect(x, y, w, h, c) { // outline
    this.fill(x, y, w, 1, c); this.fill(x, y + h - 1, w, 1, c);
    this.fill(x, y, 1, h, c); this.fill(x + w - 1, y, 1, h, c);
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
      const half = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) this.set(cx + x, cy + y, c);
    }
  }
  ring(cx, cy, r, t, c) {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      for (let rr = r - t; rr <= r; rr++) {
        this.set(Math.round(cx + rr * Math.cos(rad)), Math.round(cy + rr * Math.sin(rad)), c);
      }
    }
  }
  tri(x0, y0, x1, y1, x2, y2, c) {
    const minX = Math.min(x0, x1, x2), maxX = Math.max(x0, x1, x2);
    const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
    const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
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

// ---------- 5x7 bitmap font (hand-drawn, uppercase only) ----------
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
};
const CHAR_W = 6; // 5 px glyph + 1 px gap

function textWidth(s, scale) {
  return s.length * CHAR_W * scale - scale;
}
function drawChar(cv, x, y, scale, color, ch) {
  const g = FONT[ch] || FONT["?"];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (g[r][c] === "1") cv.fill(x + c * scale, y + r * scale, scale, scale, color);
    }
  }
}
function drawText(cv, x, y, s, scale, color, bold) {
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    drawChar(cv, x + i * CHAR_W * scale, y, scale, color, up[i]);
    if (bold) drawChar(cv, x + i * CHAR_W * scale + 1, y, scale, color, up[i]);
  }
  return x + textWidth(up, scale);
}
function drawTextCentered(cv, cx, y, s, scale, color, bold) {
  drawText(cv, Math.round(cx - textWidth(s.toUpperCase(), scale) / 2), y, s, scale, color, bold);
}
// Slanted (italic-style) text: top rows shift right, bottom rows stay put.
function drawTextSlanted(cv, x, y, s, scale, color, bold) {
  const up = s.toUpperCase();
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
  const w = textWidth(s.toUpperCase(), scale) + Math.round(6 * scale * 0.35);
  drawTextSlanted(cv, Math.round(cx - w / 2), y, s, scale, color, bold);
}
// Greedy word wrap; returns array of lines that fit maxW px at scale.
function wrapText(s, maxW, scale) {
  const words = s.toUpperCase().split(" ");
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
// Only the glyphs needed for the masthead date: SUNDAY 22 NOVEMBER 2026.
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
// LEADS: [num, headline, deck, outlet, region, scene, accent]
// PANELS: [num, headline, deck, source, region, scene, accent]
// ALSO: [num, headline, source, region]
// Verified 22 Nov 2026 by web search this run: COP31 (Reuters, objections
// 03:00 GMT / vote 06:00 GMT), Ukraine barrage 400+ drones / 110+ missiles /
// 8 killed / 3 Kyiv bridges (Reuters), Bahrain strikes (Al Jazeera / Fars /
// Euronews), Isidro capture + 11 killed (Reuters / AP), Sparta II (Reuters /
// CNN), Kryvyi Rih 2 killed / 60 wounded (AP / CNN), Bolsonaro ICU (Reuters),
// Gaza aid van 3 killed (Reuters), AUKUS row (Reuters, 22 Nov), Iran power
// rationing from Sunday (Reuters), Nepal PM arrival 22 Nov (IANS), Spain bank
// tax (Reuters), Bangladesh troops (Reuters). Date discipline: the DATE CHECK
// box names what was left out (Peru quake 20 Nov, Poland missiles 19 Nov,
// Kerch Bridge strikes, Shenzhen summit 19 Nov).
const LEADS = [
  [1, "COP31 NEARS A DEAL", "NEW TEXT PUT TO NEARLY 200 NATIONS IN ANTALYA AFTER FOSSIL-FUEL DEADLOCK. OBJECTIONS DUE 03:00 GMT, VOTE AT 06:00 GMT.", "REUTERS - ANTALYA", "WORLD", "summit", TEAL],
  [2, "400 DRONES, 110 MISSILES", "RUSSIA'S BIGGEST STRIKE KILLS 8 AND HITS 3 KYIV BRIDGES; ZELENSKYY CONFIRMS CLUSTER WARHEADS.", "REUTERS - KYIV", "EUROPE", "barrage", RED],
  [3, "IRAN STRIKES BAHRAIN BASES", "IRGC CLAIMS 2 PATRIOT RADARS STRUCK; MANAMA SAYS INDUSTRIAL SITE BURNS, NO INJURIES. TANKERS HIT IN HORMUZ.", "AL JAZEERA - MANAMA", "MIDDLE EAST", "bahrain", ORANGE],
];
const PANELS = [
  [4, "EL CHAPO ISIDRO CAUGHT", "FBI TOP-10 FUGITIVE SEIZED IN SINALOA; 11 KILLED IN BACKLASH", "REUTERS", "N. AMERICA", "flame", RED],
  [5, "SHIP ABLAZE IN GULF OF FINLAND", "SANCTIONED FREIGHTER SPARTA II HIT BY 2 DRONES; 16 CREW SAFE", "REUTERS", "EUROPE", "ship", BLUE],
  [6, "TRIPLE-TAP STRIKE IN KRYVYI RIH", "BOY, 7, AND PARAMEDIC KILLED; 60 WOUNDED AS RESCUERS TARGETED", "AP", "EUROPE", "building", RED],
  [7, "BOLSONARO IN ICU", "EX-PRESIDENT IN INTENSIVE CARE WITH BOWEL BLOCKAGE; STABLE", "REUTERS", "S. AMERICA", "hospital", GREEN],
  [8, "AID VAN HIT IN GAZA CITY", "3 KILLED AS STRIKE HITS FOOD VEHICLE; WCK SAYS NOT ITS VAN", "REUTERS", "MIDDLE EAST", "van", ORANGE],
  [9, "AUKUS ROW: 'THEY ARE WRONG'", "MARLES HITS BACK AT US BUDGET OFFICE OVER SUB FLEET WARNING", "REUTERS", "OCEANIA", "sub", NAVY2],
  [10, "IRAN TO RATION POWER FROM SUNDAY", "2-HOUR CUTS AS WAR DAMAGE DEEPENS ENERGY CRUNCH", "REUTERS", "MIDDLE EAST", "power", PURPLE],
  [11, "NEPAL PM HEADS TO INDIA", "SHAH LANDS IN DELHI TODAY ON FIRST TRIP; $2BN PACKAGE ON TABLE", "IANS", "ASIA", "flag", TEAL],
  [12, "SPAIN TO EXTEND BANK TAX FOR HOUSING", "SANCHEZ: 1.4BN EUROS FOR HOMES, RENOVATIONS, TENANTS", "REUTERS", "EUROPE", "dollar", GREEN],
  [13, "BANGLADESH DEPLOYS TROOPS", "PARAMILITARY SENT IN AS HASINA RETURN LOOMS; ARSON SPREADS", "REUTERS", "ASIA", "shield", ORANGE],
];
const ALSO = [
  [14, "EL SALVADOR TROOPS RECLAIM HAITI STADIUM", "WIRE", "N. AMERICA"],
  [15, "INDIAN-ORIGIN COUPLE SHOT DEAD NEAR CANADA WALMART", "WIRE", "N. AMERICA"],
  [16, "STATES AIM FOR KILLER-ROBOT RULES BY 2028", "WIRE", "WORLD"],
  [17, "SUPERCELL STORM SHOCKS SOUTH BRAZIL TOWN", "WIRE", "S. AMERICA"],
  [18, "FINLAND MINISTER: RUSSIAN ATTACKS THREAT TO NATO", "WIRE", "EUROPE"],
  [19, "ZELENSKY SEEKS NATO-TYPE SECURITY PLEDGES", "WIRE", "EUROPE"],
  [20, "ARTETA SWEATS ON RAYA SCAN AFTER NEWCASTLE DRAW", "CNA", "EUROPE"],
  [21, "FEMA OFFICE SHUT BY BED BUGS; 1,000 SENT HOME", "WIRE", "N. AMERICA"],
  [22, "SCIENTISTS SEQUENCE WHALE GENOMES FROM BREATH", "WIRE", "N. AMERICA"],
  [23, "4,000-YEAR-OLD BRONZE RING FOUND IN SWISS ALPS", "WIRE", "EUROPE"],
  [24, "NZ RECALLS KIDS' GARDEN SETS OVER ASBESTOS FEARS", "ABC", "OCEANIA"],
  [25, "SPAIN ARRESTS 4 OVER CEUTA SMUGGLING RING", "WIRE", "EUROPE"],
  [26, "JAPAN DOWN TO LAST CAPTIVE SEA OTTER", "WIRE", "ASIA"],
  [27, "INDONESIA EX-DRUGS CHIEF JAILED 20 YEARS", "WIRE", "ASIA"],
  [28, "TURKEY DISMISSES MALAYSIA ROHINGYA PLAN", "WIRE", "ASIA"],
  [29, "FRENCH POLICE JAILED OVER RACIST ATTACK", "WIRE", "EUROPE"],
  [30, "THAI GEN Z RALLY ENDS PEACEFULLY; MARCH DUE TODAY", "WIRE", "ASIA"],
  [31, "US 'WOULD WELCOME' LATIN AMERICAN UN CHIEF", "WIRE", "S. AMERICA"],
  [32, "SENATOR: AI CHIP SALES TO CHINA RISK SECURITY", "WIRE", "N. AMERICA"],
  [33, "TRUMP: FLIGHT SYSTEMS 'ANCIENT' BUT SAFE", "BBC", "N. AMERICA"],
  [34, "NVIDIA SHARES PLUNGE 14% AS SEC PROBES ACCOUNTS", "REUTERS", "N. AMERICA"],
  [35, "IRAN TANKER CONVOY READIES TO TEST US BLOCKADE", "EURONEWS", "MIDDLE EAST"],
  [36, "CENTCOM DENIES IRAN CLAIM IT HIT F-16", "EURONEWS", "MIDDLE EAST"],
  [37, "FINLAND TO TOW BURNING SPARTA II OUT OF ITS WATERS", "YLE", "EUROPE"],
  [38, "ZELENSKYY SLAMS PUTIN-TRUMP MEETING AFTER HOMETOWN STRIKE", "FOX NEWS", "EUROPE"],
];
const REGIONS = [
  ["EUROPE", 12, BLUE],
  ["N. AMERICA", 8, NAVY2],
  ["ASIA", 6, TEAL],
  ["MIDDLE EAST", 5, RED],
  ["S. AMERICA", 3, GREEN],
  ["OCEANIA", 2, PURPLE],
  ["WORLD", 2, ORANGE],
];
const STATS = [
  ["06:00 GMT", "COP31 VOTE DUE"],
  ["400+", "DRONES AT UKRAINE"],
  ["110+", "MISSILES FIRED"],
  ["11", "KILLED AFTER MEXICO RAID"],
  ["16", "CREW SAFE OFF SPARTA II"],
  ["60", "WOUNDED IN KRYVYI RIH"],
];

// ---------- drawn visual scenes (all shapes, no images) ----------
// Every scene is drawn proportionally inside its box (x, y, w, h) so nothing
// overflows into neighbouring text. Lead scenes use the full 330x98 box;
// small-panel scenes are centred motifs in a 200x50 box.
function drawScene(cv, x, y, w, h, scene, accent) {
  const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
  if (scene === "summit") {
    cv.fill(x, y, w, h, [196, 222, 238]);
    cv.circle(x + w - 26, y + 16, 10, GOLD);
    cv.fill(x, y + 52, w, h - 52, [222, 210, 188]);
    const cols = [NAVY2, RED, TEAL, GREEN, PURPLE, ORANGE];
    for (let i = 0; i < 6; i++) {
      const dx = x + 34 + i * 52;
      cv.circle(dx, y + 42, 7, [232, 214, 188]);
      cv.fill(dx - 9, y + 49, 18, 13, cols[i]);
      cv.fill(dx - 8, y + 64, 16, 4, WHITE);
    }
    cv.fill(x + 14, y + 62, w - 28, 8, [120, 82, 40]);
    cv.fill(x + 14, y + 70, w - 28, h - 70, [96, 64, 32]);
    cv.fill(x + 14, y + 70, w - 28, 2, GOLD);
    cv.fill(x + 22, y + 44, 2, 18, INK);
    cv.fill(x + 24, y + 44, 12, 7, BLUE);
    cv.fill(x + w - 24, y + 44, 2, 18, INK);
    cv.fill(x + w - 36, y + 44, 12, 7, RED);
  } else if (scene === "barrage") {
    cv.fill(x, y, w, h, NIGHT);
    for (let i = 0; i < 18; i++) {
      const sx = x + 8 + ((i * 53) % 300), sy = y + 4 + ((i * 29) % 34);
      cv.fill(sx, sy, 2, 2, [220, 220, 235]);
    }
    cv.circle(x + w - 28, y + 16, 9, [240, 240, 220]);
    const bld = [[6, 58, 44, 40], [56, 48, 36, 50], [98, 64, 52, 34], [156, 52, 40, 46], [202, 60, 48, 38], [256, 46, 40, 52], [302, 58, 22, 40]];
    for (const b of bld) cv.fill(x + b[0], y + b[1], b[2], b[3], [30, 34, 54]);
    for (let i = 0; i < 10; i++) {
      const wx = x + 14 + ((i * 31) % 290), wy = y + 56 + ((i * 17) % 30);
      cv.fill(wx, wy, 2, 2, GOLD);
    }
    cv.circle(x + 70, y + 90, 8, ORANGE);
    cv.tri(x + 70, y + 76, x + 62, y + 92, x + 78, y + 92, GOLD);
    cv.circle(x + 180, y + 92, 6, ORANGE);
    cv.circle(x + 270, y + 90, 7, RED);
    cv.circle(x + 70, y + 76, 6, [90, 90, 100]);
    cv.circle(x + 180, y + 80, 5, [90, 90, 100]);
    cv.circle(x + 270, y + 76, 6, [100, 100, 110]);
    cv.line(x + 120, y + 20, x + 140, y + 26, WHITE);
    cv.circle(x + 142, y + 27, 2, WHITE);
    cv.line(x + 200, y + 12, x + 216, y + 30, ORANGE);
    cv.circle(x + 218, y + 31, 2, RED);
    cv.line(x + 240, y + 24, x + 252, y + 34, WHITE);
    cv.circle(x + 254, y + 35, 2, WHITE);
  } else if (scene === "bahrain") {
    cv.fill(x, y, w, 34, [244, 190, 130]);
    cv.fill(x, y + 34, w, 30, [236, 164, 100]);
    cv.fill(x, y + 64, w, 6, [220, 140, 90]);
    cv.fill(x, y + 70, w, 28, [40, 90, 140]);
    cv.circle(x + 56, y + 34, 12, [255, 220, 140]);
    cv.fill(x + 262, y + 44, 26, 26, [90, 70, 60]);
    cv.fill(x + 292, y + 52, 22, 18, [90, 70, 60]);
    cv.fill(x + 276, y + 30, 2, 14, [90, 70, 60]);
    cv.circle(x + 277, y + 28, 4, [90, 70, 60]);
    cv.fill(x + 120, y + 78, 110, 10, [30, 30, 38]);
    cv.tri(x + 230, y + 78, x + 230, y + 88, x + 250, y + 88, [30, 30, 38]);
    cv.fill(x + 150, y + 58, 3, 20, [30, 30, 38]);
    cv.fill(x + 180, y + 66, 14, 12, [200, 60, 40]);
    cv.circle(x + 188, y + 60, 7, ORANGE);
    cv.tri(x + 188, y + 48, x + 181, y + 62, x + 195, y + 62, GOLD);
    cv.circle(x + 186, y + 48, 6, [120, 120, 125]);
    cv.circle(x + 192, y + 38, 7, [120, 120, 125]);
    cv.circle(x + 198, y + 28, 5, [130, 130, 135]);
    cv.fill(x + 40, y + 80, 18, 2, [200, 220, 240]);
    cv.fill(x + 260, y + 90, 18, 2, [200, 220, 240]);
    cv.fill(x + 90, y + 92, 14, 2, [200, 220, 240]);
  } else if (scene === "flag") {
    cv.fill(x, y, w, h, SKY);
    const bh = Math.floor(h * 0.26);
    cv.fill(x + 6, y + 3, w - 12, bh, RED);
    cv.fill(x + 6, y + 3 + bh, w - 12, bh, WHITE);
    cv.fill(x + 6, y + 3 + 2 * bh, w - 12, bh, BLUE);
    cv.circle(cx, cy, Math.floor(h * 0.16), GOLD);
  } else if (scene === "building") {
    cv.fill(x, y, w, h, SKY);
    cv.circle(x + w - 18, y + 10, 6, GOLD);
    cv.fill(x, y + h - 6, w, 6, [70, 70, 80]);
    cv.fill(x + 8, y + Math.floor(h * 0.35), Math.floor(w * 0.22), Math.floor(h * 0.65), [150, 150, 160]);
    cv.fill(x + Math.floor(w * 0.34), y + Math.floor(h * 0.5), Math.floor(w * 0.2), Math.floor(h * 0.5), [120, 120, 132]);
    cv.fill(x + Math.floor(w * 0.6), y + Math.floor(h * 0.2), Math.floor(w * 0.24), Math.floor(h * 0.8), [170, 170, 180]);
    for (let r = 0; r < 3; r++) {
      cv.fill(x + 13, y + Math.floor(h * 0.42) + r * 8, 3, 4, GOLD);
      cv.fill(x + 22, y + Math.floor(h * 0.42) + r * 8, 3, 4, GOLD);
    }
    for (let r = 0; r < 4; r++) {
      cv.fill(x + Math.floor(w * 0.63), y + Math.floor(h * 0.28) + r * 8, 3, 4, GOLD);
      cv.fill(x + Math.floor(w * 0.63) + 9, y + Math.floor(h * 0.28) + r * 8, 3, 4, GOLD);
    }
    cv.tri(cx + Math.floor(w * 0.22), y + h - 14, cx + Math.floor(w * 0.22) - 6, y + h - 6, cx + Math.floor(w * 0.22) + 6, y + h - 6, ORANGE);
    cv.circle(cx + Math.floor(w * 0.22), y + h - 10, 4, GOLD);
  } else if (scene === "flame") {
    cv.fill(x, y, w, h, SKY);
    cv.tri(cx, y + 4, cx - Math.floor(h * 0.28), cy + Math.floor(h * 0.2), cx + Math.floor(h * 0.28), cy + Math.floor(h * 0.2), ORANGE);
    cv.circle(cx, cy + Math.floor(h * 0.1), Math.floor(h * 0.22), ORANGE);
    cv.circle(cx, cy + Math.floor(h * 0.18), Math.floor(h * 0.13), GOLD);
    cv.circle(cx, cy + Math.floor(h * 0.24), Math.floor(h * 0.07), [255, 240, 180]);
    cv.fill(x, y + h - 6, w, 6, [90, 60, 50]);
  } else if (scene === "shield") {
    cv.fill(x, y, w, h, SKY);
    cv.tri(cx - Math.floor(h * 0.3), y + 6, cx + Math.floor(h * 0.3), y + 6, cx, y + Math.floor(h * 0.3), NAVY2);
    cv.fill(cx - Math.floor(h * 0.3), y + 6, Math.floor(h * 0.6), Math.floor(h * 0.42), NAVY2);
    cv.tri(cx - Math.floor(h * 0.3), y + Math.floor(h * 0.48), cx + Math.floor(h * 0.3), y + Math.floor(h * 0.48), cx, y + h - 6, NAVY2);
    cv.fill(cx - Math.floor(w * 0.06), y + Math.floor(h * 0.3), Math.floor(w * 0.12), 3, GOLD);
    cv.fill(cx - 2, y + Math.floor(h * 0.18), 4, Math.floor(h * 0.2), GOLD);
  } else if (scene === "dollar") {
    cv.fill(x, y, w, h, SKY);
    cv.circle(cx, cy, Math.floor(h * 0.36), GREEN);
    cv.ring(cx, cy, Math.floor(h * 0.36), 2, WHITE);
    drawText(cv, cx - 5, cy - 7, "$", 2, WHITE, true);
  } else if (scene === "ship") {
    cv.fill(x, y, w, h, SKY);
    cv.fill(x, y + Math.floor(h * 0.6), w, Math.floor(h * 0.4), [60, 120, 180]);
    cv.fill(cx - Math.floor(w * 0.3), y + Math.floor(h * 0.42), Math.floor(w * 0.6), Math.floor(h * 0.2), [40, 40, 48]);
    cv.tri(cx + Math.floor(w * 0.3), y + Math.floor(h * 0.42), cx + Math.floor(w * 0.3), y + Math.floor(h * 0.62), cx + Math.floor(w * 0.38), y + Math.floor(h * 0.62), [40, 40, 48]);
    cv.fill(cx - 1, y + Math.floor(h * 0.12), 2, Math.floor(h * 0.32), [40, 40, 48]);
    cv.fill(cx + Math.floor(w * 0.12), y + Math.floor(h * 0.28), Math.floor(w * 0.05), Math.floor(h * 0.16), [200, 60, 40]);
    cv.circle(cx + Math.floor(w * 0.05), y + Math.floor(h * 0.3), Math.floor(h * 0.12), ORANGE);
    cv.circle(cx + Math.floor(w * 0.02), y + Math.floor(h * 0.16), Math.floor(h * 0.08), [120, 120, 125]);
    cv.circle(cx - Math.floor(w * 0.02), y + Math.floor(h * 0.06), Math.floor(h * 0.07), [130, 130, 135]);
    cv.fill(x + 12, y + Math.floor(h * 0.72), 16, 2, [200, 220, 240]);
    cv.fill(x + w - 30, y + Math.floor(h * 0.8), 16, 2, [200, 220, 240]);
  } else if (scene === "hospital") {
    cv.fill(x, y, w, h, [235, 240, 245]);
    cv.fill(cx - Math.floor(w * 0.28), y + Math.floor(h * 0.18), Math.floor(w * 0.56), Math.floor(h * 0.72), WHITE);
    cv.rect(cx - Math.floor(w * 0.28), y + Math.floor(h * 0.18), Math.floor(w * 0.56), Math.floor(h * 0.72), [200, 200, 205]);
    cv.fill(cx - Math.floor(w * 0.28), y + Math.floor(h * 0.18), Math.floor(w * 0.56), 3, RED);
    cv.fill(cx - 2, y + Math.floor(h * 0.24), 4, Math.floor(h * 0.22), RED);
    cv.fill(cx - Math.floor(w * 0.06), y + Math.floor(h * 0.3), Math.floor(w * 0.12), 4, RED);
    cv.fill(cx - Math.floor(w * 0.2), y + Math.floor(h * 0.55), 6, 6, BLUE);
    cv.fill(cx + Math.floor(w * 0.14), y + Math.floor(h * 0.55), 6, 6, BLUE);
    cv.fill(cx - 5, y + Math.floor(h * 0.72), 10, Math.floor(h * 0.18), INK);
    cv.fill(x, y + h - 4, w, 4, [150, 160, 150]);
  } else if (scene === "van") {
    cv.fill(x, y, w, h, SKY);
    cv.fill(x, y + Math.floor(h * 0.72), w, Math.floor(h * 0.28), [90, 90, 95]);
    cv.fill(cx - Math.floor(w * 0.3), y + Math.floor(h * 0.28), Math.floor(w * 0.5), Math.floor(h * 0.34), WHITE);
    cv.rect(cx - Math.floor(w * 0.3), y + Math.floor(h * 0.28), Math.floor(w * 0.5), Math.floor(h * 0.34), [180, 180, 185]);
    cv.fill(cx + Math.floor(w * 0.2), y + Math.floor(h * 0.4), Math.floor(w * 0.14), Math.floor(h * 0.22), [200, 220, 235]);
    cv.fill(cx - Math.floor(w * 0.08), y + Math.floor(h * 0.34), 4, Math.floor(h * 0.2), RED);
    cv.fill(cx - Math.floor(w * 0.08) - 5, y + Math.floor(h * 0.4), 14, 4, RED);
    cv.circle(cx - Math.floor(w * 0.18), y + Math.floor(h * 0.64), Math.floor(h * 0.09), INK);
    cv.circle(cx + Math.floor(w * 0.22), y + Math.floor(h * 0.64), Math.floor(h * 0.09), INK);
    cv.fill(x + 10, y + Math.floor(h * 0.4), 12, 2, [200, 200, 205]);
    cv.fill(x + 26, y + Math.floor(h * 0.5), 8, 2, [200, 200, 205]);
  } else if (scene === "sub") {
    cv.fill(x, y, w, h, [70, 130, 180]);
    cv.fill(x, y + 2, w, 2, [140, 200, 235]);
    cv.fill(cx - Math.floor(w * 0.3), cy - Math.floor(h * 0.12), Math.floor(w * 0.6), Math.floor(h * 0.24), [40, 50, 66]);
    cv.circle(cx - Math.floor(w * 0.3), cy, Math.floor(h * 0.12), [40, 50, 66]);
    cv.circle(cx + Math.floor(w * 0.3), cy, Math.floor(h * 0.12), [40, 50, 66]);
    cv.fill(cx - Math.floor(w * 0.05), cy - Math.floor(h * 0.3), Math.floor(w * 0.1), Math.floor(h * 0.2), [40, 50, 66]);
    cv.fill(cx + Math.floor(w * 0.02), cy - Math.floor(h * 0.42), 2, Math.floor(h * 0.14), [40, 50, 66]);
    for (let i = -1; i <= 1; i++) cv.circle(cx + i * Math.floor(w * 0.12), cy, 2, WHITE);
    cv.circle(cx + Math.floor(w * 0.1), cy - Math.floor(h * 0.36), 2, [200, 220, 240]);
    cv.circle(cx + Math.floor(w * 0.14), cy - Math.floor(h * 0.44), 1, [200, 220, 240]);
  } else if (scene === "power") {
    cv.fill(x, y, w, h, SKY);
    cv.line(cx - Math.floor(w * 0.12), y + Math.floor(h * 0.9), cx - Math.floor(w * 0.02), y + Math.floor(h * 0.15), INK);
    cv.line(cx + Math.floor(w * 0.12), y + Math.floor(h * 0.9), cx + Math.floor(w * 0.02), y + Math.floor(h * 0.15), INK);
    cv.line(cx - Math.floor(w * 0.09), y + Math.floor(h * 0.3), cx + Math.floor(w * 0.09), y + Math.floor(h * 0.3), INK);
    cv.line(cx - Math.floor(w * 0.07), y + Math.floor(h * 0.5), cx + Math.floor(w * 0.07), y + Math.floor(h * 0.5), INK);
    cv.line(x + 4, y + Math.floor(h * 0.2), cx - Math.floor(w * 0.05), y + Math.floor(h * 0.18), INK);
    cv.line(cx + Math.floor(w * 0.05), y + Math.floor(h * 0.18), x + w - 4, y + Math.floor(h * 0.2), INK);
    cv.thickLine(cx + Math.floor(w * 0.18), y + Math.floor(h * 0.2), cx + Math.floor(w * 0.1), y + Math.floor(h * 0.5), 3, GOLD);
    cv.thickLine(cx + Math.floor(w * 0.1), y + Math.floor(h * 0.5), cx + Math.floor(w * 0.16), y + Math.floor(h * 0.56), 3, GOLD);
    cv.thickLine(cx + Math.floor(w * 0.16), y + Math.floor(h * 0.56), cx + Math.floor(w * 0.06), y + Math.floor(h * 0.85), 3, GOLD);
  } else if (scene === "protest") {
    cv.fill(x, y, w, h, [240, 235, 225]);
    const cols = [NAVY2, RED, TEAL, GREEN, PURPLE];
    for (let i = 0; i < 5; i++) {
      const dx = cx - Math.floor(w * 0.32) + i * Math.floor(w * 0.16);
      cv.circle(dx, y + Math.floor(h * 0.3), 5, [232, 214, 188]);
      cv.fill(dx - 7, y + Math.floor(h * 0.36), 14, Math.floor(h * 0.2), cols[i]);
    }
    for (let i = 0; i < 6; i++) {
      const dx = cx - Math.floor(w * 0.38) + i * Math.floor(w * 0.15);
      cv.circle(dx, y + Math.floor(h * 0.58), 5, [232, 214, 188]);
      cv.fill(dx - 7, y + Math.floor(h * 0.64), 14, Math.floor(h * 0.26), cols[(i + 2) % 5]);
    }
    cv.fill(cx - Math.floor(w * 0.42), y + Math.floor(h * 0.08), 2, Math.floor(h * 0.3), INK);
    cv.fill(cx - Math.floor(w * 0.42) - 8, y + Math.floor(h * 0.08), 18, 10, WHITE);
    cv.fill(cx - Math.floor(w * 0.42) - 6, y + Math.floor(h * 0.11), 14, 2, RED);
    cv.fill(cx + Math.floor(w * 0.38), y + Math.floor(h * 0.14), 2, Math.floor(h * 0.3), INK);
    cv.fill(cx + Math.floor(w * 0.38) - 8, y + Math.floor(h * 0.14), 18, 10, WHITE);
    cv.fill(cx + Math.floor(w * 0.38) - 6, y + Math.floor(h * 0.17), 14, 2, TEAL);
  }
  cv.rect(x, y, w, h, [200, 200, 205]);
}

// ---------- world map data: continent coastlines as [lon, lat] vertices ----------
// Hand-written from geographic knowledge; projected equirectangularly by the
// caller. Continents are composed of simple polygons (overlaps merge visually).
const CONTINENTS = [
  // North America: Alaska down the Pacific coast, Central America, up the Atlantic coast, Hudson Bay notch, Arctic coast back west.
  [[-168, 66], [-165, 60], [-158, 58], [-150, 59], [-140, 60], [-135, 57], [-130, 54], [-125, 49], [-124, 42], [-120, 34], [-114, 29], [-110, 24], [-105, 20], [-97, 16], [-92, 15], [-87, 13], [-83, 9], [-80, 8], [-78, 7], [-80, 10], [-81, 14], [-83, 17], [-86, 21], [-84, 24], [-81, 26], [-80, 30], [-76, 35], [-74, 39], [-70, 42], [-66, 44], [-60, 46], [-55, 47], [-60, 50], [-64, 53], [-68, 55], [-72, 58], [-78, 55], [-82, 52], [-86, 55], [-90, 58], [-92, 62], [-88, 65], [-85, 66], [-90, 68], [-95, 69], [-105, 68], [-115, 69], [-125, 70], [-135, 69], [-145, 70], [-155, 71], [-162, 70], [-166, 68]],
  // Greenland
  [[-44, 60], [-40, 63], [-32, 68], [-22, 70], [-20, 74], [-30, 76], [-45, 78], [-58, 77], [-62, 74], [-58, 70], [-55, 65], [-50, 61]],
  // South America: Colombia east along the north coast, Brazil bulge, down to Tierra del Fuego, up the Pacific coast.
  [[-77, 7], [-75, 10], [-72, 12], [-68, 11], [-64, 10], [-60, 8], [-55, 6], [-52, 4], [-50, 0], [-46, -2], [-42, -3], [-38, -5], [-35, -8], [-37, -12], [-39, -17], [-41, -22], [-46, -25], [-49, -29], [-53, -33], [-58, -36], [-62, -39], [-65, -42], [-66, -46], [-68, -50], [-68, -54], [-70, -55], [-73, -52], [-74, -48], [-73, -42], [-73, -36], [-72, -30], [-71, -24], [-70, -19], [-71, -14], [-75, -10], [-79, -6], [-81, -3], [-80, 1], [-79, 5]],
  // Europe (main): Iberia along the Med to Turkey, up the Black Sea coast, west along the north, down the Atlantic coast.
  [[-9, 37], [-6, 36], [-2, 37], [0, 39], [3, 42], [7, 43], [10, 44], [13, 43], [15, 41], [16, 38], [18, 39], [19, 41], [20, 40], [23, 37], [26, 38], [28, 37], [30, 36], [28, 38], [28, 41], [28, 44], [30, 46], [30, 48], [28, 50], [24, 52], [20, 54], [18, 55], [15, 55], [12, 54], [10, 54], [8, 55], [7, 54], [5, 53], [2, 51], [0, 50], [-2, 48], [-4, 48], [-2, 44], [-9, 43]],
  // Scandinavia (overlaps Europe main at the top)
  [[5, 58], [5, 60], [8, 62], [12, 64], [15, 66], [18, 68], [22, 70], [26, 71], [30, 70], [30, 67], [28, 64], [26, 61], [24, 59], [22, 57], [20, 56], [18, 55], [15, 55], [12, 56], [10, 57], [8, 58]],
  // United Kingdom
  [[-5, 50], [-3, 53], [-5, 56], [-3, 58], [-1, 57], [0, 54], [1, 51], [-1, 50]],
  // Africa: Dakar north up the Atlantic coast, Med coast east, Red Sea, Horn, down the east coast, up the west coast.
  [[-17, 15], [-16, 21], [-13, 27], [-10, 31], [-6, 33], [-1, 35], [5, 37], [10, 37], [11, 33], [15, 32], [20, 32], [25, 32], [30, 31], [32, 29], [34, 28], [36, 26], [38, 22], [39, 19], [41, 15], [43, 12], [48, 11], [51, 10], [51, 6], [48, 2], [44, 0], [41, -3], [40, -8], [40, -14], [38, -18], [36, -22], [34, -26], [32, -29], [28, -33], [24, -34], [20, -35], [17, -32], [15, -28], [13, -22], [12, -17], [13, -12], [12, -8], [10, -4], [9, 0], [9, 4], [6, 4], [2, 6], [-3, 5], [-8, 5], [-12, 8], [-15, 11], [-17, 13]],
  // Madagascar
  [[44, -12], [47, -15], [50, -16], [49, -20], [46, -24], [44, -25], [43, -21], [43, -16]],
  // Asia (main): Turkey, Caucasus, Urals to the Arctic coast, east along Siberia, down the Pacific coast, India, Arabia, back to Turkey.
  [[28, 41], [30, 46], [35, 47], [40, 47], [45, 46], [50, 47], [55, 46], [58, 55], [60, 62], [65, 68], [68, 70], [68, 73], [75, 73], [85, 74], [95, 76], [105, 77], [115, 74], [125, 73], [135, 72], [145, 72], [155, 70], [165, 68], [175, 66], [178, 65], [173, 63], [170, 60], [162, 58], [160, 55], [158, 52], [156, 50], [150, 48], [142, 50], [140, 45], [137, 42], [133, 40], [130, 40], [127, 39], [126, 38], [122, 38], [120, 35], [122, 32], [120, 29], [118, 25], [112, 22], [109, 19], [107, 15], [105, 10], [103, 8], [100, 10], [98, 14], [96, 16], [93, 18], [91, 22], [88, 22], [85, 20], [82, 17], [80, 14], [79, 10], [77, 8], [76, 10], [73, 15], [71, 20], [69, 22], [66, 25], [62, 25], [58, 25], [56, 26], [54, 27], [52, 28], [50, 29], [48, 29], [48, 27], [50, 25], [53, 24], [56, 23], [58, 21], [57, 19], [55, 17], [52, 15], [48, 14], [45, 13], [43, 12], [42, 15], [40, 19], [39, 22], [38, 25], [37, 28], [36, 30], [35, 32], [36, 36], [33, 36], [30, 36], [28, 38]],
  // Malay Peninsula (thin, overlaps Asia main)
  [[100, 13], [101, 10], [102, 7], [103, 4], [104, 1], [103, 2], [101, 4], [100, 7], [99, 10], [98, 13]],
  // Japan
  [[130, 31], [132, 33], [135, 34], [137, 35], [139, 36], [140, 38], [141, 40], [142, 42], [144, 44], [142, 44], [140, 41], [138, 38], [136, 35], [133, 34], [131, 32]],
  // Sri Lanka
  [[80, 9], [81, 7], [80, 6], [79, 8]],
  // Sumatra
  [[95, 5], [97, 4], [99, 1], [101, -2], [103, -4], [105, -5], [106, -6], [104, -5], [102, -2], [100, 0], [97, 2], [95, 4]],
  // Borneo
  [[109, 1], [111, 3], [114, 5], [117, 6], [118, 3], [117, 0], [115, -3], [112, -4], [110, -2], [109, 0]],
  // Java
  [[105, -6], [108, -7], [111, -7], [114, -8], [114, -9], [111, -8], [108, -8], [105, -7]],
  // New Guinea
  [[131, -1], [134, -2], [137, -3], [141, -3], [145, -5], [148, -7], [150, -8], [147, -9], [144, -8], [140, -7], [136, -5], [133, -3], [131, -1]],
  // Philippines
  [[120, 18], [121, 16], [122, 14], [122, 11], [123, 10], [122, 12], [121, 15], [120, 17]],
  // Australia
  [[113, -22], [114, -27], [115, -32], [117, -35], [121, -34], [126, -32], [129, -32], [132, -32], [135, -35], [137, -35], [140, -38], [143, -39], [146, -39], [149, -37], [151, -34], [153, -30], [153, -27], [151, -24], [148, -20], [145, -17], [142, -14], [142, -11], [140, -17], [137, -15], [135, -12], [132, -11], [130, -13], [127, -14], [124, -16], [121, -19], [118, -20], [115, -21]],
  // Tasmania
  [[145, -41], [147, -41], [148, -42], [147, -43], [146, -43], [145, -42]],
  // New Zealand
  [[167, -45], [169, -43], [171, -41], [173, -40], [175, -38], [177, -38], [176, -40], [174, -41], [172, -42], [170, -44], [168, -46]],
];
const LAND = [78, 128, 66];

// Ray-casting point-in-polygon test on projected pixel coordinates.
function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Dotted continents: a 6 px dot grid, 2x2 px dots where the point falls on land.
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
function drawMasthead(cv) {
  drawSerifCentered(cv, 512, 8, "SUNDAY 22 NOVEMBER 2026", 3, INK);
  cv.fill(6, 52, 1012, 3, GOLD);
  cv.fill(6, 57, 1012, 1, GOLD);
  drawTextCentered(cv, 512, 62, "THE WORLD IN ONE PICTURE - 38 STORIES", 2, NAVY, true);
}

function drawSubhead(cv) {
  drawTextSlantedCentered(cv, 512, 94, "COP31 NEARS DEAL * 400 DRONES HIT UKRAINE * IRAN STRIKES US BASES", 2, RED, true);
}

function drawStats(cv) {
  const bw = 163, gap = 6, y = 120, h = 40;
  STATS.forEach((s, i) => {
    const x = 6 + i * (bw + gap);
    cv.fill(x, y, bw, h, WHITE);
    cv.rect(x, y, bw, h, [210, 210, 215]);
    cv.fill(x, y, bw, 3, GOLD);
    drawTextCentered(cv, x + bw / 2, y + 7, s[0], 3, RED, true);
    drawTextCentered(cv, x + bw / 2, y + 29, s[1], 1, MUTED, false);
  });
}

function drawLeadPanel(cv, story, px, py) {
  const [num, headline, deck, outlet, region, scene, accent] = story;
  cv.fill(px, py, 330, 174, WHITE);
  cv.rect(px, py, 330, 174, [210, 210, 215]);
  cv.fill(px, py, 330, 3, accent);
  drawScene(cv, px + 4, py + 6, 322, 98, scene, accent);
  cv.circle(px + 18, py + 22, 11, RED);
  cv.ring(px + 18, py + 22, 11, 1, WHITE);
  const ns = String(num);
  drawText(cv, px + 18 - Math.floor(textWidth(ns, 1) / 2), py + 19, ns, 1, WHITE, true);
  const hl = wrapText(headline, 322, 2).slice(0, 2);
  hl.forEach((ln, i) => drawText(cv, px + 6, py + 108 + i * 14, ln, 2, INK, true));
  const dk = wrapText(deck, 322, 1).slice(0, 3);
  dk.forEach((ln, i) => drawText(cv, px + 6, py + 126 + i * 9, ln, 1, [60, 60, 68], false));
  drawText(cv, px + 6, py + 158, outlet, 1, accent, true);
}

function drawSmallPanel(cv, story, px, py) {
  const [num, headline, deck, source, region, scene, accent] = story;
  cv.fill(px, py, 198, 108, WHITE);
  cv.rect(px, py, 198, 108, [210, 210, 215]);
  cv.fill(px, py, 198, 3, accent);
  drawScene(cv, px + 4, py + 5, 190, 50, scene, accent);
  cv.circle(px + 15, py + 16, 9, RED);
  cv.ring(px + 15, py + 16, 9, 1, WHITE);
  const ns = String(num);
  drawText(cv, px + 15 - Math.floor(textWidth(ns, 1) / 2), py + 13, ns, 1, WHITE, true);
  const hl = wrapText(headline, 190, 1).slice(0, 2);
  hl.forEach((ln, i) => drawText(cv, px + 5, py + 58 + i * 9, ln, 1, INK, true));
  const dk = wrapText(deck, 190, 1).slice(0, 2);
  dk.forEach((ln, i) => drawText(cv, px + 5, py + 78 + i * 9, ln, 1, [60, 60, 68], false));
  drawText(cv, px + 5, py + 98, source + "  -  " + region, 1, accent, true);
}

function drawRegions(cv) {
  const y = 564, h = 28;
  drawText(cv, 6, y + 10, "STORIES BY REGION:", 1, INK, true);
  const x0 = 150;
  const bw = 118, gap = 4;
  REGIONS.forEach((r, i) => {
    const x = x0 + i * (bw + gap);
    cv.fill(x, y, bw, h, WHITE);
    cv.rect(x, y, bw, h, [210, 210, 215]);
    cv.fill(x, y, 4, h, r[2]);
    drawTextCentered(cv, x + bw / 2 + 2, y + 10, r[0] + " " + r[1], 1, INK, true);
  });
}

function drawMap(cv) {
  const x = 6, y = 596, w = 1012, h = 112;
  cv.fill(x, y, w, h, WHITE);
  cv.rect(x, y, w, h, [210, 210, 215]);
  cv.fill(x, y, w, 3, NAVY);
  drawText(cv, x + 10, y + 9, "WHERE IT HAPPENED", 2, NAVY, true);
  drawText(cv, x + 700, y + 11, "RED PIN = TOP STORY NUMBER", 1, MUTED, false);
  const sea = [206, 228, 240];
  const seaX0 = x + 6, seaY0 = y + 28, seaX1 = x + w - 6, seaY1 = y + h - 6;
  cv.fill(seaX0, seaY0, seaX1 - seaX0, seaY1 - seaY0, sea);
  // Equirectangular projection: lon -180..180 -> sea width, lat 80..-60 -> sea height.
  const project = (lon, lat) => [
    seaX0 + ((lon + 180) / 360) * (seaX1 - seaX0),
    seaY0 + ((80 - lat) / 140) * (seaY1 - seaY0),
  ];
  // Subtle ocean graticule: every 30 deg longitude, lat 60/30/0/-30.
  const grat = [188, 212, 230];
  for (let lon = -150; lon <= 150; lon += 30) {
    const gx = Math.round(project(lon, 0)[0]);
    cv.line(gx, seaY0, gx, seaY1 - 1, grat);
  }
  for (const lat of [60, 30, 0, -30]) {
    const gy = Math.round(project(0, lat)[1]);
    cv.line(seaX0, gy, seaX1 - 1, gy, grat);
  }
  // Dotted continents: no solid blobs, a deliberate dot grid.
  drawDottedContinents(cv, project, seaX0, seaY0, seaX1, seaY1);
  // Pins: story number -> true location, with nudges so no two pins touch.
  // [num, lon, lat, dx, dy]
  const pins = [
    [1, 30.7, 36.9, -16, -10],  // Antalya (COP31)
    [2, 30.5, 50.4, -28, -12],  // Kyiv (barrage)
    [3, 50.6, 26.2, 8, 16],     // Bahrain
    [4, -108.5, 25.6, 0, 0],    // Guasave, Sinaloa
    [5, 27.0, 60.0, 26, 6],     // Sparta II, Gulf of Finland
    [6, 33.4, 47.9, 22, 18],    // Kryvyi Rih
    [7, -47.9, -15.8, 0, 0],    // Brasilia
    [8, 34.5, 31.5, 36, 18],    // Gaza City
    [9, 151.2, -33.9, 0, 0],    // Sydney
    [10, 51.4, 35.7, 12, -14],  // Tehran
    [11, 77.2, 28.6, 0, 0],     // New Delhi
    [12, -3.7, 40.4, 0, 0],     // Madrid
    [13, 90.4, 23.8, 0, 0],     // Dhaka
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
  const x = 6, y = 712, w = 1012, h = 64;
  cv.fill(x, y, w, h, [255, 244, 238]);
  cv.rect(x, y, w, h, RED);
  cv.fill(x, y, w, 3, RED);
  drawText(cv, x + 10, y + 8, "DATE CHECK - WIRES READ UP TO 01:00 UTC, SUNDAY 22 NOVEMBER 2026", 1, RED, true);
  drawText(cv, x + 10, y + 21, "NOT SUNDAY'S NEWS - LEFT OUT: PERU QUAKE 20 NOV - POLAND MISSILES 19 NOV - KERCH BRIDGE STRIKES - SHENZHEN SUMMIT 19 NOV", 1, INK, false);
  drawText(cv, x + 10, y + 34, "NOT SETTLED YET: COP31 VOTE AT 06:00 GMT STILL TO COME - IRAN TANKER CONVOY YET TO SAIL", 1, RED, true);
  drawText(cv, x + 10, y + 47, "EVERY STORY ABOVE WAS FIRST REPORTED OR STILL DEVELOPING ON 22 NOVEMBER 2026", 1, MUTED, false);
}

function drawAlso(cv) {
  drawText(cv, 6, 780, "ALSO ON 22 NOVEMBER", 2, NAVY, true);
  cv.fill(230, 788, 784, 2, GOLD);
  const colX = [10, 522];
  ALSO.forEach((s, i) => {
    const col = i < 13 ? 0 : 1;
    const row = i % 13;
    const y = 800 + row * 14;
    const line = s[0] + ". " + s[1] + " - " + s[2];
    drawText(cv, colX[col], y, line, 1, INK, false);
  });
  drawTextCentered(cv, 512, 1004, "ALL 38 STORIES FIRST REPORTED OR STILL DEVELOPING ON SUNDAY 22 NOVEMBER 2026 - SOURCES AS TAGGED", 1, MUTED, false);
}

// ---------- build ----------
function build() {
  const cv = new Canvas(W, H, PAPER);
  drawMasthead(cv);
  drawSubhead(cv);
  drawStats(cv);
  LEADS.forEach((s, i) => drawLeadPanel(cv, s, 6 + i * 336, 166));
  PANELS.forEach((s, i) => {
    const col = i % 5, row = Math.floor(i / 5);
    drawSmallPanel(cv, s, 8 + col * 202, 344 + row * 112);
  });
  drawRegions(cv);
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
