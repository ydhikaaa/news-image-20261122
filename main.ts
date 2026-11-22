// news-image-20261122 — "Sum up 22 November's world news in one image"
// Hand-written from scratch: PNG encoder, 5x7 bitmap font, all drawing code.
// Node 22+ stdlib only (node:zlib, node:fs, node:path). No network at runtime.
// Deterministic: no Date.now / Math.random anywhere in the output path.
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

// ---------- story data: every story first reported on Sunday 22 Nov 2026 ----------
// Story 1 is the giant lead. TOP 2-13 get a drawn visual panel; the rest appear
// in the numbered ALSO list. Items first reported 21 Nov or earlier are NOT
// listed as news: they appear only in the DATE CHECK box below.
// [num, headline, summary, source, region, scene, accent]
const TOP = [
  [2, "11 KILLED AFTER CARTEL BOSS CAPTURE", "Violence erupts in Sinaloa after troops seize FBI-wanted boss Meza Flores; 11 dead in the backlash.", "WIRE", "N. AMERICA", "flame", RED],
  [3, "POLICE JAILED OVER RACIST ATTACK", "French officers jailed in a landmark ruling over racist violence against a black man.", "WIRE", "EUROPE", "gavel", BLUE],
  [4, "WHITE HOUSE SEIZES REPORTERS' PHONES", "Journalists' phones seized on Air Force One after the Shenzhen summit, in a press-freedom row.", "WIRE", "N. AMERICA", "phone", NAVY2],
  [5, "US 'WOULD WELCOME' LATIN AMERICAN UN CHIEF", "Ambassador Waltz says Washington would accept a UN leader from Latin America amid gridlock.", "WIRE", "S. AMERICA", "globe", PURPLE],
  [6, "FINLAND TIGHTENS SECURITY AFTER DRONE HIT", "Helsinki steps up Baltic security after drones hit a Russia-bound freighter in the Gulf of Finland.", "WIRE", "EUROPE", "shield", BLUE],
  [7, "NEPAL PM HEADS TO INDIA ON FIRST TRIP", "PM Balendra Shah flies to New Delhi on Sunday, his first foreign trip since taking office.", "WIRE", "ASIA", "flag", TEAL],
  [8, "TRUMP: FLIGHT SYSTEMS OUTDATED BUT SAFE", "The president calls US flight systems outdated but safe after a week of ground stops and outages.", "WIRE", "N. AMERICA", "plane", ORANGE],
  [9, "SENATOR: AI CHIP SALES TO CHINA RISK SECURITY", "A top Senate lawmaker says selling AI chips to China puts US security at risk.", "WIRE", "N. AMERICA", "chart", RED],
  [10, "THAI YOUTH PROTEST FOR EDUCATION REFORM", "Young protesters march in Bangkok demanding education and political change.", "WIRE", "ASIA", "building", GREEN],
  [11, "SPAIN TO EXPAND BANK TAX FOR HOUSING", "Madrid plans to widen its banking tax to fund housing, the PM says.", "WIRE", "EUROPE", "dollar", GREEN],
  [12, "GRIPEN FAILED TO STOP MISSILE OVER POLAND", "A Swedish Gripen could not intercept a Russian-made missile over Polish soil, reports say.", "WIRE", "EUROPE", "drone", TEAL],
  [13, "BANGLADESH BOOSTS SECURITY AS HASINA VOWS RETURN", "Dhaka tightens security ahead of ex-PM Hasina's vowed return from exile.", "WIRE", "ASIA", "shield", ORANGE],
];
// [num, headline, source, region]
const ALSO = [
  [14, "EL SALVADOR TROOPS RECLAIM HAITI STADIUM", "DUMPLING", "N. AMERICA"],
  [15, "INDIAN-ORIGIN COUPLE SHOT DEAD NEAR CANADA WALMART", "WIRE", "N. AMERICA"],
  [16, "STATES AIM FOR KILLER-ROBOT RULES BY 2028", "WIRE", "WORLD"],
  [17, "BESSENT: NO MORE CURBS ON NVIDIA CHIP SALES", "WIRE", "N. AMERICA"],
  [18, "SUPERCELL STORM SHOCKS SOUTH BRAZIL TOWN", "WIRE", "S. AMERICA"],
  [19, "FINLAND MINISTER: RUSSIAN ATTACKS THREAT TO NATO", "WIRE", "EUROPE"],
  [20, "ZELENSKY SEEKS NATO-TYPE SECURITY PLEDGES", "WIRE", "EUROPE"],
  [21, "INDIA FACE NZ IN WELLINGTON TEST", "WIRE", "OCEANIA"],
  [22, "ARTETA SWEATS ON RAYA SCAN AFTER NEWCASTLE DRAW", "CNA", "EUROPE"],
  [23, "FEMA OFFICE SHUT BY BED BUGS; 1,000 SENT HOME", "WIRE", "N. AMERICA"],
  [24, "SCIENTISTS SEQUENCE WHALE GENOMES FROM BREATH", "WIRE", "N. AMERICA"],
  [25, "4,000-YEAR-OLD BRONZE RING FOUND IN SWISS ALPS", "WIRE", "EUROPE"],
  [26, "NZ RECALLS KIDS' GARDEN SETS OVER ASBESTOS FEARS", "ABC", "OCEANIA"],
  [27, "SPAIN ARRESTS 4 OVER CEUTA SMUGGLING RING", "WIRE", "EUROPE"],
  [28, "JAPAN DOWN TO LAST CAPTIVE SEA OTTER", "WIRE", "ASIA"],
  [29, "INDONESIA EX-DRUGS CHIEF JAILED 20 YEARS", "WIRE", "ASIA"],
  [30, "TURKEY DISMISSES MALAYSIA ROHINGYA PLAN", "WIRE", "ASIA"],
];
const REGIONS = [
  ["EUROPE", 9, BLUE],
  ["N. AMERICA", 9, NAVY2],
  ["ASIA", 6, TEAL],
  ["MIDDLE EAST", 1, RED],
  ["S. AMERICA", 2, GREEN],
  ["OCEANIA", 2, PURPLE],
  ["WORLD", 1, ORANGE],
];
const STATS = [
  ["06:00 GMT", "COP31 VOTE DUE"],
  ["~200", "NATIONS AT COP31"],
  ["130", "STATES WANT FOSSIL WORDS"],
  ["11", "KILLED AFTER MEXICO RAID"],
  ["1,000", "FEMA STAFF SENT HOME"],
  ["4,000 YRS", "AGE OF BRONZE RING"],
];

// ---------- drawn visual scenes (all shapes, no images) ----------
function drawScene(cv, x, y, w, h, scene, accent) {
  cv.fill(x, y, w, h, SKY);
  const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
  if (scene === "globe") {
    cv.circle(cx, cy, 26, BLUE);
    cv.ring(cx, cy, 26, 2, WHITE);
    cv.fill(cx - 2, cy - 26, 4, 52, [120, 190, 230]);
    cv.fill(cx - 26, cy - 2, 52, 4, [120, 190, 230]);
    cv.circle(cx - 12, cy - 10, 7, GREEN);
    cv.circle(cx + 12, cy + 12, 8, GREEN);
    cv.circle(cx + 14, cy - 12, 5, GREEN);
  } else if (scene === "flag") {
    cv.fill(x + 8, y + 10, w - 16, 14, RED);
    cv.fill(x + 8, y + 24, w - 16, 14, WHITE);
    cv.fill(x + 8, y + 38, w - 16, 14, BLUE);
    cv.fill(x + 8, y + 52, w - 16, 12, GOLD);
    cv.circle(cx, cy - 2, 7, GOLD);
  } else if (scene === "building") {
    cv.fill(x, y + 44, w, h - 44, [70, 70, 80]);
    cv.fill(x + 8, y + 18, 16, 46, [150, 150, 160]);
    cv.fill(x + 30, y + 30, 14, 34, [120, 120, 132]);
    cv.fill(x + 50, y + 8, 18, 56, [170, 170, 180]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) cv.fill(x + 12 + c * 6, y + 24 + r * 10, 3, 5, GOLD);
    for (let r = 0; r < 4; r++) cv.fill(x + 54 + (r % 2) * 6, y + 14 + r * 10, 3, 5, GOLD);
    cv.circle(cx + 18, y + 14, 8, GOLD);
  } else if (scene === "phone") {
    cv.fill(cx - 16, y + 8, 32, 56, INK);
    cv.fill(cx - 13, y + 12, 26, 44, WHITE);
    cv.fill(cx - 13, y + 12, 26, 10, BLUE);
    cv.fill(cx - 10, y + 28, 20, 3, [200, 200, 200]);
    cv.fill(cx - 10, y + 34, 14, 3, [200, 200, 200]);
    cv.fill(cx - 10, y + 40, 17, 3, [200, 200, 200]);
    cv.circle(cx, y + 60, 3, GOLD);
  } else if (scene === "plane") {
    cv.fill(x, y + 48, w, 16, [200, 210, 220]);
    cv.tri(cx - 26, cy + 8, cx + 30, cy - 6, cx + 30, cy + 8, [230, 230, 235]);
    cv.tri(cx - 6, cy - 6, cx + 6, cy - 22, cx + 10, cy - 6, [210, 210, 215]);
    cv.tri(cx - 18, cy + 8, cx - 8, cy + 20, cx - 2, cy + 8, [210, 210, 215]);
    cv.circle(cx + 22, cy + 1, 4, BLUE);
    cv.fill(cx - 30, cy + 2, 8, 2, ORANGE);
  } else if (scene === "flame") {
    cv.tri(cx, y + 8, cx - 18, cy + 14, cx + 18, cy + 14, ORANGE);
    cv.circle(cx, cy + 10, 16, ORANGE);
    cv.circle(cx, cy + 16, 10, GOLD);
    cv.circle(cx, cy + 20, 5, [255, 240, 180]);
    cv.fill(x, y + 56, w, 8, [90, 60, 50]);
  } else if (scene === "shield") {
    cv.tri(cx - 20, y + 10, cx + 20, y + 10, cx, y + 26, NAVY2);
    cv.fill(cx - 20, y + 10, 40, 30, NAVY2);
    cv.tri(cx - 20, y + 40, cx + 20, y + 40, cx, y + 58, NAVY2);
    drawText(cv, cx - 6, y + 22, "!", 2, GOLD, true);
    cv.fill(cx - 14, y + 46, 28, 3, GOLD);
  } else if (scene === "chart") {
    cv.fill(x, y + 56, w, 4, INK);
    const bars = [18, 30, 24, 42, 34];
    for (let i = 0; i < bars.length; i++) {
      cv.fill(x + 10 + i * 13, y + 56 - bars[i], 9, bars[i], i % 2 ? BLUE : GREEN);
    }
    cv.line(x + 8, y + 14, x + 66, y + 26, RED);
    cv.line(x + 8, y + 14, x + 66, y + 26, RED);
  } else if (scene === "gavel") {
    cv.fill(cx - 20, y + 16, 34, 10, [120, 82, 40]);
    cv.fill(cx - 24, y + 13, 6, 16, [90, 60, 28]);
    cv.fill(cx + 16, y + 13, 6, 16, [90, 60, 28]);
    cv.line(cx - 2, y + 26, cx + 14, y + 52, [90, 60, 28]);
    cv.line(cx - 1, y + 26, cx + 15, y + 52, [90, 60, 28]);
    cv.fill(cx + 4, y + 52, 30, 6, [120, 82, 40]);
  } else if (scene === "dollar") {
    cv.circle(cx, cy, 26, GREEN);
    cv.ring(cx, cy, 26, 2, WHITE);
    drawText(cv, cx - 9, cy - 14, "$", 4, WHITE, true);
  } else if (scene === "drone") {
    cv.fill(cx - 12, cy - 8, 24, 16, INK);
    cv.circle(cx - 20, cy - 14, 8, [60, 60, 70]);
    cv.circle(cx + 20, cy - 14, 8, [60, 60, 70]);
    cv.circle(cx - 20, cy + 14, 8, [60, 60, 70]);
    cv.circle(cx + 20, cy + 14, 8, [60, 60, 70]);
    cv.fill(cx - 28, cy - 16, 16, 3, [180, 180, 190]);
    cv.fill(cx + 12, cy - 16, 16, 3, [180, 180, 190]);
    cv.fill(cx - 28, cy + 13, 16, 3, [180, 180, 190]);
    cv.fill(cx + 12, cy + 13, 16, 3, [180, 180, 190]);
    cv.circle(cx, cy, 4, RED);
  } else if (scene === "ball") {
    cv.circle(cx, cy, 26, WHITE);
    cv.ring(cx, cy, 26, 2, INK);
    cv.circle(cx, cy, 8, INK);
    cv.circle(cx - 16, cy - 14, 4, INK);
    cv.circle(cx + 16, cy - 14, 4, INK);
    cv.circle(cx - 18, cy + 12, 4, INK);
    cv.circle(cx + 18, cy + 12, 4, INK);
    cv.circle(cx, cy + 20, 4, INK);
    cv.fill(x, y + 58, w, 6, GREEN);
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
const LAND = [96, 150, 80];
const LAND_EDGE = [74, 118, 64];

// Scanline polygon fill; pts are [x, y] pixel coords; clip(x, y) optionally limits the fill.
function polyFill(cv, pts, color, clip) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) {
        if (!clip || clip(x, y)) cv.set(x, y, color);
      }
    }
  }
}
function polyOutline(cv, pts, color) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    cv.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), color);
  }
}
// Draw all continents through a projection fn(lon, lat) -> [x, y]; clip limits the fill (globe disc).
function drawContinents(cv, project, clip, outline) {
  for (const poly of CONTINENTS) {
    polyFill(cv, poly.map((p) => project(p[0], p[1])), LAND, clip);
  }
  if (outline) {
    for (const poly of CONTINENTS) {
      polyOutline(cv, poly.map((p) => project(p[0], p[1])), LAND_EDGE);
    }
  }
}

// ---------- layout ----------
function drawMasthead(cv) {
  cv.fill(0, 0, W, 92, NAVY);
  cv.fill(0, 92, W, 4, GOLD);
  drawTextCentered(cv, 512, 10, "SUNDAY 22 NOVEMBER 2026", 4, GOLD, true);
  drawTextCentered(cv, 512, 52, "30 STORIES FROM 7 REGIONS - THE WORLD IN ONE PICTURE", 2, WHITE, false);
  drawTextCentered(cv, 512, 76, "EVERY STORY FIRST REPORTED ON 22 NOVEMBER 2026", 1, [170, 190, 220], false);
}

function drawStats(cv) {
  const bw = 164, gap = 6, y = 230, h = 44;
  STATS.forEach((s, i) => {
    const x = 6 + i * (bw + gap);
    cv.fill(x, y, bw, h, WHITE);
    cv.rect(x, y, bw, h, [210, 210, 215]);
    cv.fill(x, y, bw, 3, GOLD);
    drawTextCentered(cv, x + bw / 2, y + 8, s[0], 3, RED, true);
    drawTextCentered(cv, x + bw / 2, y + 31, s[1], 1, MUTED, false);
  });
}

function drawTopPanel(cv, story, px, py) {
  const [num, headline, summary, source, region, scene, accent] = story;
  cv.fill(px, py, 330, 88, WHITE);
  cv.rect(px, py, 330, 88, [210, 210, 215]);
  cv.fill(px, py, 330, 3, accent);
  drawScene(cv, px + 4, py + 6, 80, 76, scene, accent);
  // number badge
  cv.circle(px + 16, py + 18, 10, RED);
  cv.ring(px + 16, py + 18, 10, 1, WHITE);
  const ns = String(num);
  drawText(cv, px + 16 - Math.floor(textWidth(ns, 1) / 2), py + 15, ns, 1, WHITE, true);
  // headline (max 2 lines)
  const hl = wrapText(headline, 232, 1).slice(0, 2);
  hl.forEach((ln, i) => drawText(cv, px + 90, py + 6 + i * 9, ln, 1, INK, true));
  // summary (max 3 lines)
  const sm = wrapText(summary, 232, 1).slice(0, 3);
  sm.forEach((ln, i) => drawText(cv, px + 90, py + 27 + i * 9, ln, 1, [60, 60, 68], false));
  // source + region
  drawText(cv, px + 90, py + 76, source + "  -  " + region, 1, accent, true);
}

function drawLead(cv) {
  const x = 6, y = 96, w = 1012, h = 130;
  cv.fill(x, y, w, h, WHITE);
  cv.rect(x, y, w, h, [210, 210, 215]);
  cv.fill(x, y, w, 3, RED);
  // big globe visual: real continents clipped to the disc, drawn by hand
  const gx = x + 8, gy = y + 8, gw = 150, gh = 114;
  cv.fill(gx, gy, gw, gh, SKY);
  const cx = gx + 75, cy = gy + 57, gr = 52;
  cv.circle(cx, cy, gr, BLUE);
  const gProject = (lon, lat) => [cx + (lon / 180) * 50, cy - (lat / 90) * 50];
  drawContinents(cv, gProject, (px, py) => (px - cx) * (px - cx) + (py - cy) * (py - cy) <= 50 * 50, false);
  cv.fill(cx - 2, cy - gr, 4, gr * 2, [120, 190, 230]);
  cv.fill(cx - gr, cy - 2, gr * 2, 4, [120, 190, 230]);
  cv.ring(cx, cy, gr, 3, WHITE);
  cv.rect(gx, gy, gw, gh, [200, 200, 205]);
  // red LEAD tag + giant headline
  cv.fill(x + 170, y + 8, 44, 14, RED);
  drawText(cv, x + 176, y + 11, "LEAD", 1, WHITE, true);
  drawText(cv, x + 222, y + 8, "COP31 UNVEILS NEW DEAL TEXT", 2, RED, true);
  drawText(cv, x + 170, y + 30, "AS TALKS RUN INTO SUNDAY", 2, INK, true);
  drawText(cv, x + 170, y + 58, "AFTER DEADLOCK OVER FOSSIL FUELS, THE ANTALYA PRESIDENCY PUTS A NEW PACKAGE", 1, [60, 60, 68], false);
  drawText(cv, x + 170, y + 67, "TO NEARLY 200 NATIONS. 130 STATES DEMANDED A TRANSITION AWAY FROM FOSSIL FUELS.", 1, [60, 60, 68], false);
  drawText(cv, x + 170, y + 92, "DELEGATES HAVE UNTIL 03:00 GMT TO OBJECT - VOTE AT 06:00 GMT - REUTERS", 1, TEAL, true);
  drawText(cv, x + 170, y + 108, "NOT SETTLED: THE VOTE HAS NOT HAPPENED YET", 1, RED, true);
}

function drawRegions(cv) {
  const y = 652, h = 28;
  drawText(cv, 6, y + 4, "STORIES BY REGION:", 1, INK, true);
  const x0 = 150;
  const bw = 122, gap = 5;
  REGIONS.forEach((r, i) => {
    const x = x0 + i * (bw + gap);
    cv.fill(x, y, bw, h, WHITE);
    cv.rect(x, y, bw, h, [210, 210, 215]);
    cv.fill(x, y, 4, h, r[2]);
    drawTextCentered(cv, x + bw / 2 + 2, y + 10, r[0] + " " + r[1], 1, INK, true);
  });
}

function drawMap(cv) {
  const x = 6, y = 684, w = 1012, h = 112;
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
  // Recognizable continents with a darker coastline edge.
  drawContinents(cv, project, null, true);
  // Pins: story number -> true location. 1 Antalya (COP31), 2 Sinaloa, 3 Paris,
  // 4 Washington DC, 5 Brazil, 6 Finland (nudged ~1 deg E of the border so it
  // clears the Poland pin), 7 Nepal, 8 central USA, 9 Beijing, 10 Bangkok,
  // 11 Madrid, 12 Warsaw, 13 Dhaka. Radius 7, spread so no two touch.
  const pins = [
    [594, 736], [214, 743], [515, 729], [296, 735], [365, 762], [582, 721],
    [741, 741], [247, 735], [829, 734], [787, 749], [499, 734], [567, 727], [759, 743],
  ];
  pins.forEach((p, i) => {
    const n = String(i + 1);
    cv.circle(p[0], p[1], 7, RED);
    cv.ring(p[0], p[1], 7, 1, WHITE);
    drawText(cv, p[0] - Math.floor(textWidth(n, 1) / 2), p[1] - 3, n, 1, WHITE, true);
  });
}

function drawDateCheck(cv) {
  const x = 6, y = 800, w = 1012, h = 64;
  cv.fill(x, y, w, h, [255, 244, 238]);
  cv.rect(x, y, w, h, RED);
  cv.fill(x, y, w, 3, RED);
  drawText(cv, x + 10, y + 8, "DATE CHECK - NOT SUNDAY'S NEWS: FIRST REPORTED SAT 21 NOV OR EARLIER", 1, RED, true);
  drawText(cv, x + 10, y + 21, "PERU QUAKE - ICJ MYANMAR VERDICT (19 NOV) - SHENZHEN DECLARATION - WALL ST FALL", 1, INK, false);
  drawText(cv, x + 10, y + 32, "IRAN STRIKES ON US BASES IN BAHRAIN - EL CHAPO ISIDRO CAPTURED - KRYVYI RIH ATTACK", 1, INK, false);
  drawText(cv, x + 10, y + 43, "GUPTA JAILED 19 YRS (20 NOV) - ROUNDUP $7.25BN (20 NOV) - HEGSETH CANADA MEMO (20 NOV)", 1, INK, false);
  drawText(cv, x + 10, y + 54, "NOT SETTLED: COP31 VOTE AT 06:00 GMT STILL TO COME - IRAN TANKER CONVOY STILL MOORED OFF KHARG", 1, RED, true);
}

function drawAlso(cv) {
  drawText(cv, 6, 868, "ALSO ON 22 NOVEMBER", 2, NAVY, true);
  cv.fill(230, 876, 784, 2, GOLD);
  const colX = [10, 522];
  ALSO.forEach((s, i) => {
    const col = i < 9 ? 0 : 1;
    const row = i % 9;
    const y = 886 + row * 12;
    const line = s[0] + ". " + s[1] + " - " + s[2];
    drawText(cv, colX[col], y, line, 1, INK, false);
  });
  drawTextCentered(cv, 512, 1004, "ALL 30 STORIES FIRST REPORTED ON SUNDAY 22 NOVEMBER 2026 - SOURCES AS TAGGED", 1, MUTED, false);
}

// ---------- build ----------
function build() {
  const cv = new Canvas(W, H, PAPER);
  drawMasthead(cv);
  drawLead(cv);
  drawStats(cv);
  TOP.forEach((s, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    drawTopPanel(cv, s, 6 + col * 340, 278 + row * 94);
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
  console.log("stories: " + (1 + TOP.length + ALSO.length));
}
main();
