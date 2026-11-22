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
// TOP 13 get a drawn visual panel; the rest appear in the numbered ALSO list.
// [num, headline, summary, source, region, scene, accent]
const TOP = [
  [1, "COP31 NEARS FINAL DEAL AFTER ALL-NIGHT TALKS", "Presidents unveil a new package in Antalya; delegates have until 03:00 GMT to object, vote at 06:00.", "REUTERS", "EUROPE", "globe", TEAL],
  [2, "ISRAEL SAYS HAMAS TIGHTENING GRIP ON GAZA", "Israel alleges the militant group is intensifying its hold on the Strip as the ceasefire frays.", "WIRE", "MIDDLE EAST", "flag", RED],
  [3, "129 BODIES PULLED FROM GAZA RUBBLE", "Rescue teams recover 129 people from debris in downtown Gaza as the toll of the war keeps rising.", "WIRE", "MIDDLE EAST", "building", ORANGE],
  [4, "TRUMP POSTS HIS OWN 'TRUMPCARE' PLAN", "The president shares a Democratic senator-elect's health plan on Truth Social, backing a deal with Democrats.", "WIRE", "N. AMERICA", "phone", BLUE],
  [5, "IRAN CLAIMS MISSILE HIT US F-16 OVER HORMUZ", "Tehran says its missile struck the jet, forcing an emergency landing; the claim is unverified.", "REPORT", "MIDDLE EAST", "plane", PURPLE],
  [6, "RUSSIAN DRONES HIT KHARKIV, 11 HURT", "Overnight strikes wound 11 people, including two children, in Ukraine's second city.", "WIRE", "EUROPE", "flame", RED],
  [7, "FRANCE AND US DRAFT UN DEAL FOR LEBANON", "Paris works with Washington on a resolution to fill the vacuum left as UNIFIL hands over in the south.", "WIRE", "EUROPE", "globe", BLUE],
  [8, "TRUMP PLAYS DOWN FBI DATABASE BREACH", "The president downplays the apparent hack of the FBI's NCIC crime database, adding a 'positive outlook'.", "WIRE", "N. AMERICA", "shield", NAVY2],
  [9, "EU CHIEFS PROPOSE BUDGET CUTS, TECH TAX", "EU Council chair floats deep cuts to the 2028-2034 budget and a levy on digital platforms.", "WIRE", "EUROPE", "chart", GREEN],
  [10, "GUPTA JAILED 19 YEARS IN PANNUN PLOT", "N. Gupta is sentenced to 19 years over the conspiracy to murder Sikh separatist Gurpatwant Pannun.", "WIRE", "N. AMERICA", "gavel", NAVY2],
  [11, "COURT APPROVES $7.25BN ROUNDUP DEAL", "A judge endorses the $7.25 billion settlement over Roundup weedkiller cancer claims.", "WIRE", "N. AMERICA", "dollar", GREEN],
  [12, "TAIWAN TAKES UP DRONE WARFARE", "As Trump grows closer to Xi, Taiwan's people turn to drones to defend the island.", "WIRE", "ASIA", "drone", TEAL],
  [13, "MADRID EDGE CELTA; ARSENAL HELD 2-2", "Real Madrid win 2-1 at Celta while Newcastle hold Arsenal 2-2 in Sunday's big European fixtures.", "SCOREZAAP", "EUROPE", "ball", GREEN],
];
// [num, headline, source, region]
const ALSO = [
  [14, "FINLAND PROBES DRONE STRIKE ON RUSSIAN FREIGHTER", "WIRE", "EUROPE"],
  [15, "SWEDEN SUMMONS RUSSIAN ENVOY OVER KYIV EMBASSY BLAST", "WIRE", "EUROPE"],
  [16, "DENMARK SEEKS EU-WIDE CURBS ON RUSSIAN VISITORS", "WIRE", "EUROPE"],
  [17, "ZELENSKY: CRIMEA BRIDGE 'WILL NOT STAND'", "WIRE", "EUROPE"],
  [18, "UKRAINE HITS ISKANDER MISSILE-FUEL PLANT", "WIRE", "EUROPE"],
  [19, "RUSSIAN STRIKES DAMAGE ZAPORIZHZHIA PRESCHOOLS", "WIRE", "EUROPE"],
  [20, "MISSILE ATTACK ON ZELENSKY'S HOME CITY", "WIRE", "EUROPE"],
  [21, "ZELENSKY: NEXT PEACE TALKS MUST BRING RESULTS", "WIRE", "EUROPE"],
  [22, "FIRST LADY HOPES FOR UKRAINE TRUCE BY CHRISTMAS", "WIRE", "N. AMERICA"],
  [23, "TRUMP: CHINA'S NUCLEAR BUILD-UP 'HOT AND HEAVY'", "WIRE", "ASIA"],
  [24, "PALISADES FIRE SUSPECT CONVICTED", "WIRE", "N. AMERICA"],
  [25, "IRAQ REOPENS JURF AL-NASR-KARBALA ROAD", "WIRE", "MIDDLE EAST"],
  [26, "IRAQ BUSTS MAJOR NAJAF OIL-SMUGGLING RING", "WIRE", "MIDDLE EAST"],
  [27, "PALESTINIAN KILLED NEAR RAMALLAH", "WIRE", "MIDDLE EAST"],
  [28, "ISRAELI STRIKE KILLS 3 IN GAZA AID CAR", "WIRE", "MIDDLE EAST"],
  [29, "MIGRANT CARAVAN MARCHES ACROSS MEXICO TO US BORDER", "WIRE", "N. AMERICA"],
  [30, "TOP 10 DEFENCE-AI SPENDERS RANKED", "WIRE", "GLOBAL"],
  [31, "INDIA A THRASH NEPAL BY 306 RUNS", "TECHNOSPORTS", "ASIA"],
  [32, "PAKISTAN A BEAT UAE BY 61 RUNS", "TECHNOSPORTS", "ASIA"],
  [33, "MI EMIRATES WIN ILT20 OPENER BY 52 RUNS", "SCOREZAAP", "ASIA"],
  [34, "PALMEIRAS 1-1 FLAMENGO IN BRAZIL", "SCOREZAAP", "S. AMERICA"],
  [35, "SIXERS AND HURRICANES WIN IN WBBL", "TECHNOSPORTS", "OCEANIA"],
  [36, "ICE DANCERS QUIT WARSAW EVENT AFTER MINISTRY ROW", "WIRE", "EUROPE"],
  [37, "RAIN WARNING FOR SOUTH-WEST ENGLAND", "MET OFFICE", "EUROPE"],
  [38, "NIGERIA SIGNS DIGITAL PACT WITH 5 AFRICAN STATES", "LEGALBRIEF", "AFRICA"],
  [39, "IFFI ADDS NEW ANIMATION SECTION", "PW LIVE", "ASIA"],
  [40, "NATUROPATHY DAY MARKED ACROSS INDIA", "PW LIVE", "ASIA"],
  [41, "SENSEX SLIPS; CRUDE OIL FALLS 3%", "PW LIVE", "ASIA"],
];
const REGIONS = [
  ["EUROPE", 15, BLUE],
  ["MIDDLE EAST", 7, RED],
  ["N. AMERICA", 7, NAVY2],
  ["ASIA", 8, TEAL],
  ["AFRICA", 1, ORANGE],
  ["S. AMERICA", 1, GREEN],
  ["OCEANIA", 1, PURPLE],
];
const STATS = [
  ["129", "BODIES FOUND IN GAZA"],
  ["$7.25BN", "ROUNDUP SETTLEMENT"],
  ["19 YRS", "GUPTA SENTENCE"],
  ["11 HURT", "KHARKIV DRONE HIT"],
  ["306 RUNS", "INDIA A WIN"],
  ["~200", "NATIONS AT COP31"],
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

// ---------- layout ----------
function drawMasthead(cv) {
  cv.fill(0, 0, W, 92, NAVY);
  cv.fill(0, 92, W, 4, GOLD);
  drawTextCentered(cv, 512, 10, "SUNDAY 22 NOVEMBER 2026", 4, GOLD, true);
  drawTextCentered(cv, 512, 52, "41 STORIES FROM 7 REGIONS - THE WORLD IN ONE PICTURE", 2, WHITE, false);
  drawTextCentered(cv, 512, 76, "EVERY STORY FIRST REPORTED ON 22 NOVEMBER 2026", 1, [170, 190, 220], false);
}

function drawStats(cv) {
  const bw = 164, gap = 6, y = 96, h = 44;
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

function drawRegions(cv) {
  const y = 614, h = 28;
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
  const x = 6, y = 646, w = 1012, h = 154;
  cv.fill(x, y, w, h, WHITE);
  cv.rect(x, y, w, h, [210, 210, 215]);
  cv.fill(x, y, w, 3, NAVY);
  drawText(cv, x + 10, y + 9, "WHERE IT HAPPENED", 2, NAVY, true);
  drawText(cv, x + 700, y + 11, "RED PIN = TOP STORY NUMBER", 1, MUTED, false);
  const land = [96, 150, 80];
  const sea = [206, 228, 240];
  cv.fill(x + 6, y + 28, w - 12, h - 34, sea);
  // continents (rough shapes from circles + rects)
  cv.fill(120, 690, 150, 40, land); cv.circle(140, 700, 22, land); cv.circle(240, 705, 25, land);
  cv.fill(180, 720, 60, 16, land);
  cv.circle(215, 752, 17, land); cv.fill(200, 746, 30, 34, land);
  cv.fill(460, 680, 70, 30, land); cv.circle(470, 690, 15, land); cv.circle(510, 688, 14, land);
  cv.circle(440, 680, 6, land);
  cv.circle(480, 732, 26, land); cv.fill(460, 730, 45, 40, land); cv.circle(490, 762, 18, land);
  cv.fill(540, 675, 230, 45, land); cv.circle(600, 690, 30, land); cv.circle(700, 685, 35, land);
  cv.fill(650, 715, 90, 18, land); cv.circle(760, 700, 20, land);
  cv.fill(800, 748, 70, 22, land); cv.circle(815, 754, 12, land); cv.circle(850, 752, 10, land);
  const pins = [
    [600, 690], [545, 725], [560, 740], [148, 688], [582, 766], [520, 682],
    [500, 720], [188, 698], [470, 682], [158, 726], [205, 738], [700, 700], [435, 685],
  ];
  pins.forEach((p, i) => {
    const n = String(i + 1);
    cv.circle(p[0], p[1], 9, RED);
    cv.ring(p[0], p[1], 9, 1, WHITE);
    drawText(cv, p[0] - Math.floor(textWidth(n, 1) / 2), p[1] - 3, n, 1, WHITE, true);
  });
}

function drawAlso(cv) {
  drawText(cv, 6, 806, "ALSO ON 22 NOVEMBER", 2, NAVY, true);
  cv.fill(230, 814, 784, 2, GOLD);
  const colX = [10, 522];
  ALSO.forEach((s, i) => {
    const col = i < 14 ? 0 : 1;
    const row = i % 14;
    const y = 824 + row * 13;
    const line = s[0] + ". " + s[1] + " - " + s[2];
    drawText(cv, colX[col], y, line, 1, INK, false);
  });
  drawTextCentered(cv, 512, 1010, "ALL 41 STORIES FIRST REPORTED ON SUNDAY 22 NOVEMBER 2026 - SOURCES AS TAGGED", 1, MUTED, false);
}

// ---------- build ----------
function build() {
  const cv = new Canvas(W, H, PAPER);
  drawMasthead(cv);
  drawStats(cv);
  TOP.forEach((s, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    drawTopPanel(cv, s, 6 + col * 340, 146 + row * 94);
  });
  drawRegions(cv);
  drawMap(cv);
  drawAlso(cv);
  return encodePNG(cv.px, W, H);
}

function main() {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const png = build();
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
  console.log("entry.png bytes: " + png.length);
  console.log("stories: " + (TOP.length + ALSO.length));
}
main();
