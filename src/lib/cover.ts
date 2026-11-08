// Обложки, которые рисует сам сайт: SVG из названия и автора, без картинок и запросов.
//
// - Стиль зависит только от автора: книги одного автора выглядят как одна серия.
//   Фамилия — последнее слово автора не короче трёх букв: «Булгаков», «М. А. Булгаков»
//   и «Михаил Булгаков» — одно и то же. Без автора стиль решает название.
// - Вариант стиля, краски, шрифт и фигуры — от названия и фамилии.
// - «Сюжет» (композиции киноафиш) выпадает чаще остальных стилей.
// - Текст переносится и уменьшается по настоящим шрифтам (canvas measureText), поэтому
//   рисовать — после loadCoverFonts(). SVG вставляется в страницу как есть: картинка <img>
//   шрифтов страницы не видит.
// - Модуль не зависит от Preact: его же собирает страница-прототип обложек.

export interface CoverBook {
  title: string;
  author: string;
}

// ---------- Число книги ----------

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
const surname = (author: string) => words(author).filter((w) => w.length >= 3).pop() ?? '';

function hash(key: string): number {
  let h = 0x811c9dc5;
  for (const ch of key) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

type Rng = () => number;
function rng(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)];
function weighted<T extends { w?: number }>(r: Rng, list: readonly T[]): T {
  const total = list.reduce((n, x) => n + (x.w ?? 1), 0);
  let x = r() * total;
  for (const item of list) {
    x -= item.w ?? 1;
    if (x < 0) return item;
  }
  return list[list.length - 1];
}
// Вариант: число берётся всегда, чтобы показ вариантов не сдвигал остальное.
function variant(r: Rng, n: number, force?: number): number {
  const v = Math.floor(r() * n);
  return force ?? v;
}

// ---------- Мелочи ----------

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) =>
  '#' +
  rgb(a)
    .map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0'))
    .join('');
const f1 = (n: number) => n.toFixed(1);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const up = (s: string) => s.toLocaleUpperCase('ru');
const initial = (s: string) => (s.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toLocaleUpperCase('ru');

// id внутри SVG — с меткой ID; при вставке метка заменяется уникальной приставкой,
// иначе две одинаковые обложки на странице делили бы градиенты.
const ID = '';
let idN = 0;
const uid = (p: string) => `${ID}${p}${++idN}`;

// ---------- Шрифты ----------

interface Font {
  name: string;
  family: string; // для canvas
  css: string; // для SVG
  weight: number;
  upper?: boolean;
  ls?: number;
}
const SANS: Font = { name: 'system-ui', family: 'system-ui, sans-serif', css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", weight: 600 };
const F = {
  literata: { name: 'Literata', family: 'Literata', css: 'Literata, Georgia, serif', weight: 600 },
  playfair: { name: 'Playfair Display', family: '"Playfair Display"', css: "'Playfair Display', Georgia, serif", weight: 700 },
  oswald: { name: 'Oswald', family: 'Oswald', css: "Oswald, 'Arial Narrow', sans-serif", weight: 600, upper: true, ls: 0.6 },
  russo: { name: 'Russo One', family: '"Russo One"', css: "'Russo One', sans-serif", weight: 400 },
} satisfies Record<string, Font>;
const cased = (font: Font, s: string) => (font.upper ? up(s) : s);

let fonts: Promise<void> | null = null;
let fontsLoaded = false;
// Загрузить шрифты обложек вместе с кириллицей; без них подбор размера текста неверен.
export function loadCoverFonts(): Promise<void> {
  fonts ??= Promise.all(Object.values(F).map((f) => document.fonts.load(`${f.weight} 20px ${f.family}`, 'Аяё Zz09').catch(() => []))).then(() => {
    fontsLoaded = true;
  });
  return fonts;
}
export const coverFontsLoaded = () => fontsLoaded;

// ---------- Текст: перенос по словам и подбор размера ----------

interface FitOpts extends Font {
  maxW: number;
  maxLines: number;
  max: number;
  min: number;
  lh: number;
}
interface Fitted extends FitOpts {
  size: number;
  lines: string[];
}

let ctx: CanvasRenderingContext2D | null = null;
function measure(text: string, f: Font & { size: number }): number {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  ctx.font = `${f.weight} ${f.size}px ${f.family}`;
  return ctx.measureText(text).width + (f.ls ?? 0) * text.length;
}
function wrap(text: string, f: FitOpts & { size: number }): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${w}` : w;
    if (!line || measure(next, f) <= f.maxW) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}
function fit(text: string, o: FitOpts): Fitted | null {
  if (!text.trim()) return null;
  for (let size = o.max; size >= o.min; size -= 0.5) {
    const f = { ...o, size };
    const lines = wrap(text, f);
    if (lines.length <= o.maxLines && lines.every((l) => measure(l, f) <= o.maxW)) return { ...f, lines };
  }
  const f = { ...o, size: o.min };
  let lines = wrap(text, f);
  if (lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    let last = lines[o.maxLines - 1] + '…';
    while (measure(last, f) > o.maxW && last.length > 2) last = last.slice(0, -2).trimEnd() + '…';
    lines[o.maxLines - 1] = last;
  }
  return { ...f, lines };
}
const block = (t: Fitted | null) => (t ? (t.lines.length - 1) * t.size * t.lh : 0);
// Строки — tspan; слишком длинное слово ужимается по ширине.
function txt(t: Fitted | null, x: number, y: number, fill: string, anchor = 'start', extra = ''): string {
  if (!t) return '';
  const spans = t.lines
    .map((l, i) => {
      const squeeze = measure(l, t) > t.maxW ? ` textLength="${t.maxW}" lengthAdjust="spacingAndGlyphs"` : '';
      return `<tspan x="${f1(x)}" y="${f1(y + i * t.size * t.lh)}"${squeeze}>${esc(l)}</tspan>`;
    })
    .join('');
  const ls = t.ls ? ` letter-spacing="${t.ls}"` : '';
  return `<text font-family="${t.css}" font-weight="${t.weight}" font-size="${t.size}" fill="${fill}" text-anchor="${anchor}"${ls}${extra}>${spans}</text>`;
}
const authorLine = (b: CoverBook, maxW: number, maxLines = 2, ls = 1.2) =>
  fit(up(b.author), { ...SANS, maxW, maxLines, max: 9.5, min: 7, lh: 1.35, ls });
const svg = (body: string) => `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

// force — вариант, sky — цветовая схема «Сюжета»; оба только для страницы-прототипа.
type Draw = (b: CoverBook, r: Rng, force?: number, sky?: number) => [string, number];

// ============ Переплёт ============

const CLOTH = ['#7b2d26', '#2e5949', '#24426b', '#5a3b5d', '#7d5320', '#2f5f6b', '#474d57', '#6b3e26', '#44522c', '#743f5b', '#1f4e5f', '#8f3b2a'];
const cloth: Draw = (b, r, force) => {
  const v = variant(r, 4, force);
  const bg = pick(r, CLOTH);
  const font = pick(r, [F.literata, F.playfair]);
  const cream = '#f4ead4';
  const gold = '#d8b77c';
  const id = uid('c');
  let body: string;
  if (v === 0) {
    // Рамка: двойная тиснёная рамка, ромб под названием.
    const t = fit(b.title, { ...font, maxW: 134, maxLines: 5, max: 26, min: 12, lh: 1.2 })!;
    const a = authorLine(b, 140);
    const ty = 124 - block(t) / 2 + t.size * 0.35;
    const oy = ty + block(t) + 24;
    body = `<rect x="16" y="14" width="170" height="272" fill="none" stroke="${gold}" stroke-opacity=".8" stroke-width="1.4"/><rect x="21" y="19" width="160" height="262" fill="none" stroke="${gold}" stroke-opacity=".45" stroke-width=".7"/>
${txt(t, 101, ty, cream, 'middle')}<path d="M101 ${f1(oy - 4)}l4 4-4 4-4-4z" fill="${gold}"/><path d="M79 ${f1(oy)}h16M107 ${f1(oy)}h16" stroke="${gold}" stroke-width=".8"/>
${txt(a, 101, 262 - block(a), cream, 'middle', ' fill-opacity=".85"')}`;
  } else if (v === 1) {
    // Корешок: тёмная «кожа» слева с золотыми полосками.
    const t = fit(b.title, { ...font, maxW: 116, maxLines: 6, max: 24, min: 11, lh: 1.2 })!;
    const a = authorLine(b, 118);
    const ty = 128 - block(t) / 2 + t.size * 0.35;
    const oy = ty + block(t) + 20;
    body = `<rect width="54" height="300" fill="${mix(bg, '#000000', 0.45)}"/><path d="M54 0V300M59 0V300" stroke="${gold}" stroke-opacity=".8"/><path d="M10 38H44M10 44H44M10 256H44M10 262H44" stroke="${gold}" stroke-width="1.3"/>
${txt(t, 128, ty, cream, 'middle')}<path d="M112 ${f1(oy)}H144" stroke="${gold}"/>
${txt(a, 128, 266 - block(a), cream, 'middle', ' fill-opacity=".85"')}`;
  } else if (v === 2) {
    // Наклейка: бумажная этикетка с названием.
    const ink = mix(bg, '#000000', 0.25);
    const t = fit(b.title, { ...font, maxW: 112, maxLines: 4, max: 20, min: 10, lh: 1.18 })!;
    const a = authorLine(b, 150);
    const ty = 133 - block(t) / 2 + t.size * 0.35;
    body = `<rect x="34" y="78" width="132" height="110" rx="3" fill="#efe6cf"/><rect x="39" y="83" width="122" height="100" rx="2" fill="none" stroke="${ink}" stroke-opacity=".45" stroke-width=".8"/>
${txt(t, 100, ty, ink, 'middle')}${txt(a, 100, 228, cream, 'middle', ' fill-opacity=".85"')}`;
  } else {
    // Серия: золотые полосы, автор сверху, буква-эмблема внизу.
    const t = fit(b.title, { ...font, maxW: 160, maxLines: 4, max: 26, min: 12, lh: 1.18 })!;
    const a = authorLine(b, 160);
    const ty = 150 - block(t) / 2 + t.size * 0.35;
    body = `<path d="M0 34.5H200M0 41.5H200M0 258.5H200M0 265.5H200" stroke="${gold}" stroke-width="1.6"/>
${txt(a, 100, 72, cream, 'middle', ' fill-opacity=".85"')}${txt(t, 100, ty, cream, 'middle')}
<circle cx="100" cy="227" r="11" fill="none" stroke="${gold}"/><text x="100" y="231.5" text-anchor="middle" font-family="${F.literata.css}" font-weight="700" font-size="12" fill="${gold}">${esc(initial(b.title))}</text>`;
  }
  return [
    svg(`<defs><pattern id="${id}w" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1H4M1 0V4" stroke="#fff" stroke-opacity=".05" stroke-width=".8"/><path d="M0 3H4M3 0V4" stroke="#000" stroke-opacity=".08" stroke-width=".8"/></pattern>
<linearGradient id="${id}s" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset=".05" stop-color="#000" stop-opacity=".1"/><stop offset=".09" stop-color="#fff" stop-opacity=".08"/><stop offset=".16" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<rect width="200" height="300" fill="${bg}"/><rect width="200" height="300" fill="url(#${id}w)"/>${body}<rect width="200" height="300" fill="url(#${id}s)"/>`),
    v,
  ];
};

// ============ Орнамент ============

const PALETTES: [string, string, string, string][] = [
  ['#22313f', '#3f6e8c', '#ece5d3', '#d9893b'],
  ['#3b2a40', '#8c4f6e', '#f1e4d6', '#e2a64a'],
  ['#1f3d36', '#4f8a6e', '#ede6d1', '#c8553d'],
  ['#3f2a22', '#a6532c', '#f2e5cf', '#3d6b7d'],
  ['#262b45', '#5868a3', '#eceef3', '#e98a54'],
  ['#352f24', '#8c7b3a', '#efe8d3', '#9c3d3d'],
  ['#1e2e48', '#c79f3a', '#f2ece0', '#7a2e3b'],
  ['#2c3a2a', '#7a9a58', '#f0ecd8', '#d27a2c'],
  ['#3a2433', '#c06c84', '#f3e6e3', '#355c7d'],
  ['#203540', '#2f8f9d', '#eef2ee', '#e0b13c'],
];
// Фигуры плитки размера s: четверть круга, полукруг, треугольник, круг, полосы, кольцо, пусто.
const SH: Record<string, (c: string, s: number) => string> = {
  q: (c, s) => `<path d="M0 0H${s}A${s} ${s} 0 0 1 0 ${s}Z" fill="${c}"/>`,
  h: (c, s) => `<path d="M0 0H${s}A${s / 2} ${s / 2} 0 0 1 0 0Z" fill="${c}"/>`,
  t: (c, s) => `<path d="M0 0H${s}V${s}Z" fill="${c}"/>`,
  c: (c, s) => `<circle cx="${s / 2}" cy="${s / 2}" r="${s * 0.32}" fill="${c}"/>`,
  l: (c, s) => `<path d="M0 ${s * 0.25}H${s}M0 ${s * 0.75}H${s}" stroke="${c}" stroke-width="${s * 0.18}"/>`,
  o: (c, s) => `<circle cx="${s / 2}" cy="${s / 2}" r="${s * 0.3}" fill="none" stroke="${c}" stroke-width="${s * 0.14}"/>`,
  n: () => '',
};
const ornament: Draw = (b, r, force) => {
  const v = variant(r, 4, force);
  const [dark, mid, light, accent] = pick(r, PALETTES);
  const fills = [dark, mid, accent, light];
  const font = pick(r, [F.literata, F.oswald]);
  const other = (i: number) => fills[(i + 1 + Math.floor(r() * 3)) % 4];
  const tiles = (cols: number, rows: number, s: number, y0: number, kinds: string[]) => {
    let out = '';
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = f1(col * s);
        const y = f1(y0 + row * s);
        const bi = Math.floor(r() * 4);
        const shape = SH[pick(r, kinds)](other(bi), s);
        const rot = Math.floor(r() * 4) * 90;
        out += `<rect x="${x}" y="${y}" width="${f1(s + 0.4)}" height="${f1(s + 0.4)}" fill="${fills[bi]}"/>`;
        if (shape) out += `<g transform="translate(${x} ${y}) rotate(${rot} ${s / 2} ${s / 2})">${shape}</g>`;
      }
    }
    return out;
  };
  const titleFit = (maxW: number, max: number) => fit(cased(font, b.title), { ...font, maxW, maxLines: 3, max, min: 10, lh: 1.15 });
  const plate = (top: number) =>
    `<rect y="${top}" width="200" height="${300 - top}" fill="${light}"/><rect y="${top}" width="200" height="3" fill="${dark}"/>
${txt(titleFit(168, 17), 16, top + 26, dark)}${txt(authorLine(b, 168, 1, 1.1), 16, 286, mid)}`;
  let body: string;
  if (v === 0) body = tiles(4, 4, 50, 0, ['q', 'h', 't', 'c', 'l', 'n']) + plate(200);
  else if (v === 1) body = tiles(5, 5, 40, 0, ['q', 'h', 'c', 'o', 'c']) + plate(200);
  else if (v === 2) {
    // Треугольники на всю обложку, название — в рамке посередине.
    const t = titleFit(128, 18)!;
    const ty = 142 - block(t) / 2 + t.size * 0.35;
    body = `${tiles(4, 6, 50, 0, ['t', 't', 'h'])}<rect x="24" y="92" width="152" height="116" fill="${light}" stroke="${dark}" stroke-width="2"/>
${txt(t, 100, ty, dark, 'middle')}${txt(authorLine(b, 128, 1, 1.1), 100, 196, mid, 'middle')}`;
  } else {
    // Радуги: плашка сверху, ниже вложенные дуги.
    const s = 200 / 3;
    let arcs = '';
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const x = f1(col * s);
        const y = f1(100 + row * s);
        const bi = Math.floor(r() * 4);
        const rot = Math.floor(r() * 4) * 90;
        const k = [other(bi), fills[bi], other(bi)];
        const rings = [1, 0.68, 0.36].map((m, i) => SH.q(k[i], +f1(s * m))).join('');
        arcs += `<rect x="${x}" y="${y}" width="${f1(s + 0.4)}" height="${f1(s + 0.4)}" fill="${fills[bi]}"/><g transform="translate(${x} ${y}) rotate(${rot} ${f1(s / 2)} ${f1(s / 2)})">${rings}</g>`;
      }
    }
    body = `${arcs}<rect width="200" height="100" fill="${light}"/><rect y="97" width="200" height="3" fill="${dark}"/>
${txt(titleFit(168, 17), 16, 28, dark)}${txt(authorLine(b, 168, 1, 1.1), 16, 86, mid)}`;
  }
  return [svg(body), v];
};

// ============ Акварель ============

const glow: Draw = (b, r, force) => {
  const v = variant(r, 4, force);
  const h = r() * 360;
  const id = uid('g');
  const font = pick(r, [F.playfair, F.literata, F.russo]);
  const blobs = (n: number, s0: number, s1: number, l0: number, l1: number, box: number[], rad: number[]) => {
    let defs = '';
    let shapes = '';
    for (let i = 0; i < n; i++) {
      const c = hsl(h + (r() - 0.5) * 110, s0 + r() * (s1 - s0), l0 + r() * (l1 - l0));
      defs += `<radialGradient id="${id}b${i}"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
      shapes += `<circle cx="${f1(box[0] + r() * (box[2] - box[0]))}" cy="${f1(box[1] + r() * (box[3] - box[1]))}" r="${f1(rad[0] + r() * (rad[1] - rad[0]))}" fill="url(#${id}b${i})"/>`;
    }
    return [defs, shapes];
  };
  const shade = `<linearGradient id="${id}d" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>`;
  let body: string;
  if (v === 0) {
    // Сумерки: тёмная основа, яркие пятна, название белым внизу.
    const [d, s] = blobs(4, 45, 65, 42, 56, [0, 0, 200, 230], [90, 160]);
    const t = fit(b.title, { ...font, maxW: 164, maxLines: 4, max: 30, min: 14, lh: 1.1 });
    body = `<defs>${d}${shade}</defs><rect width="200" height="300" fill="${hsl(h, 40, 20)}"/>${s}<rect width="200" height="300" fill="url(#${id}d)"/>
${txt(authorLine(b, 164, 2, 1.4), 18, 34, '#fff', 'start', ' fill-opacity=".88"')}${txt(t, 18, 268 - block(t), '#fff')}`;
  } else if (v === 1) {
    // Пастель: светлая основа, нежные пятна, тёмное название сверху.
    const ink = hsl(h, 45, 20);
    const [d, s] = blobs(4, 50, 70, 70, 84, [0, 0, 200, 300], [90, 150]);
    const t = fit(b.title, { ...font, maxW: 164, maxLines: 4, max: 28, min: 14, lh: 1.1 })!;
    const a = authorLine(b, 164, 2, 1.4);
    body = `<defs>${d}</defs><rect width="200" height="300" fill="${hsl(h, 40, 93)}"/>${s}
${txt(t, 18, 22 + t.size * 0.9, ink)}${txt(a, 18, 282 - block(a), ink, 'start', ' fill-opacity=".75"')}`;
  } else if (v === 2) {
    // Солнце: небо-градиент, одно большое мягкое светило, тонкая рамка.
    const t = fit(b.title, { ...font, maxW: 156, maxLines: 3, max: 26, min: 13, lh: 1.1 });
    const sun = hsl(h + 50, 80, 72);
    body = `<defs><linearGradient id="${id}k" x2="0" y2="1"><stop offset="0" stop-color="${hsl(h, 45, 22)}"/><stop offset="1" stop-color="${hsl(h + 40, 55, 55)}"/></linearGradient>
<radialGradient id="${id}u"><stop offset="0" stop-color="${sun}"/><stop offset=".35" stop-color="${sun}" stop-opacity=".85"/><stop offset="1" stop-color="${sun}" stop-opacity="0"/></radialGradient>${shade}</defs>
<rect width="200" height="300" fill="url(#${id}k)"/><circle cx="100" cy="${f1(110 + r() * 30)}" r="${f1(100 + r() * 30)}" fill="url(#${id}u)"/><rect width="200" height="300" fill="url(#${id}d)"/>
<rect x="10" y="10" width="180" height="280" fill="none" stroke="#fff" stroke-opacity=".55"/>
${txt(authorLine(b, 156, 1, 1.6), 100, 38, '#fff', 'middle', ' fill-opacity=".85"')}${txt(t, 100, 250 - block(t), '#fff', 'middle')}`;
  } else {
    // Окно: пятна внутри круга на тёмном фоне, название под ним.
    const [d, s] = blobs(4, 50, 70, 50, 65, [28, 40, 172, 184], [50, 90]);
    const t = fit(b.title, { ...font, maxW: 164, maxLines: 2, max: 24, min: 12, lh: 1.1 });
    body = `<defs>${d}<clipPath id="${id}w"><circle cx="100" cy="112" r="72"/></clipPath></defs>
<rect width="200" height="300" fill="${hsl(h, 25, 15)}"/><g clip-path="url(#${id}w)"><rect width="200" height="300" fill="${hsl(h, 35, 30)}"/>${s}</g>
<circle cx="100" cy="112" r="78" fill="none" stroke="${hsl(h, 30, 70)}" stroke-opacity=".5"/>
${txt(t, 100, 226, '#f4efe6', 'middle')}${txt(authorLine(b, 164, 1, 1.6), 100, 284, hsl(h, 30, 75), 'middle')}`;
  }
  return [svg(body), v];
};

// ============ Плакат ============

const STRONG = ['#e4572e', '#2a6db0', '#f2b134', '#2e8b57', '#c03a6b', '#6c4bc4', '#13979b', '#d1402f', '#1f2f8a', '#e07a1f'];
const poster: Draw = (b, r, force) => {
  const k = variant(r, 7, force);
  const layout = Math.floor(r() * 3);
  const font = pick(r, [F.oswald, F.russo, F.playfair]);
  const c = pick(r, STRONG);
  const colored = layout === 2;
  const bg = colored ? c : '#f2efe8';
  const sc = colored ? mix(c, '#000000', 0.32) : c;
  const ink = colored ? '#fbf7ee' : '#1c1e21';
  const textTop = layout !== 1;
  // Фигура — в той половине, где нет названия.
  const y0 = textTop ? 130 : 0;
  const y1 = textTop ? 300 : 175;
  const my = (y0 + y1) / 2;
  let shape: string;
  if (k === 0) shape = `<circle cx="${f1(130 + r() * 50)}" cy="${f1(my + (r() - 0.5) * 40)}" r="${f1(70 + r() * 25)}" fill="${sc}"/>`;
  else if (k === 1) {
    const cy = my + (r() - 0.5) * 30;
    const rr = 60 + r() * 25;
    shape = `<path d="M200 ${f1(cy - rr)}A${f1(rr)} ${f1(rr)} 0 0 0 200 ${f1(cy + rr)}Z" fill="${sc}"/>`;
  } else if (k === 2) {
    const R = 110 + r() * 40;
    shape = textTop
      ? `<path d="M200 ${f1(300 - R)}A${f1(R)} ${f1(R)} 0 0 0 ${f1(200 - R)} 300H200Z" fill="${sc}"/>`
      : `<path d="M${f1(200 - R)} 0A${f1(R)} ${f1(R)} 0 0 0 200 ${f1(R)}V0Z" fill="${sc}"/>`;
  } else if (k === 3) {
    const w = 34 + r() * 16;
    const cut = r() * 40;
    const top = textTop ? y0 + cut : 0;
    const bottom = textTop ? 300 : y1 - cut;
    shape = `<rect x="${f1(150 + r() * 10 - w / 2)}" y="${f1(top)}" width="${f1(w)}" height="${f1(bottom - top)}" fill="${sc}"/>`;
  } else if (k === 4) {
    const cx = 110 + r() * 60;
    shape = `<g fill="none" stroke="${sc}" stroke-width="11">${[70, 46, 22].map((rr) => `<circle cx="${f1(cx)}" cy="${f1(my)}" r="${rr}"/>`).join('')}</g>`;
  } else if (k === 5) {
    const a = y0 + 20 + r() * 30;
    shape = `<path d="M0 ${f1(y1 - 10)}L200 ${f1(a)}V${f1(a + 46)}L0 ${f1(y1 + 36)}Z" fill="${sc}"/>`;
  } else {
    let dots = '';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) dots += `<circle cx="${92 + i * 22}" cy="${f1(my - 33 + j * 22)}" r="6.5"/>`;
    shape = `<g fill="${sc}">${dots}</g>`;
  }
  const t = fit(cased(font, b.title), { ...font, maxW: 168, maxLines: 5, max: 36, min: 14, lh: 1.08 })!;
  const a = fit(b.author, { ...SANS, maxW: 140, maxLines: 2, max: 11, min: 8, lh: 1.3 });
  const title = textTop ? txt(t, 16, 16 + t.size * 0.9, ink) : txt(t, 16, 280 - block(t), ink);
  const author = textTop ? txt(a, 16, 286 - block(a), ink) : txt(a, 16, 28, ink);
  return [svg(`<rect width="200" height="300" fill="${bg}"/>${shape}${title}${author}`), k];
};

// ============ Сюжет: композиции киноафиш ============

interface Sky {
  name: string;
  g: [string, string, string]; // небо сверху вниз
  sun: string; // светило, огни
  ground: string; // земля, силуэты
  top: string; // имя автора
  accent?: string; // туфли, пламя, радужка
  night?: boolean;
  w?: number; // как часто выпадает
}
const SKIES: Sky[] = [
  { name: 'Сине-оранжевый', g: ['#0a2233', '#1d5a6c', '#e3793a'], sun: '#ffb45e', ground: '#061620', top: '#ffd8b0', accent: '#ff7a2f', w: 5 },
  { name: 'Закат', g: ['#2b2350', '#b0476b', '#f2a65a'], sun: '#ffd27a', ground: '#1d1730', top: '#f6e7ef' },
  { name: 'Рассвет', g: ['#3a5a8c', '#e8a3a0', '#f6d8b0'], sun: '#fff1c9', ground: '#2a2d3e', top: '#fbeee6' },
  { name: 'Ночь', g: ['#0b1530', '#1d3461', '#3e5c8a'], sun: '#f1ead2', ground: '#060b18', top: '#e6ecf7', night: true },
  { name: 'Туман', g: ['#7d8c8a', '#c9d1c8', '#ece9dd'], sun: '#ffffff', ground: '#3e4945', top: '#1f2624', accent: '#9a3b2f' },
  { name: 'Полдень', g: ['#3f88c5', '#8cc4e6', '#dcf0f6'], sun: '#fff7d6', ground: '#23382c', top: '#ffffff', accent: '#e4572e' },
  { name: 'Пустыня', g: ['#c65d2e', '#f0a868', '#f8dfb4'], sun: '#fff3d9', ground: '#5a2a16', top: '#fff1e4' },
  { name: 'Сумерки', g: ['#14332e', '#2f6b5e', '#a7cba6'], sun: '#f3f0c8', ground: '#0b1c18', top: '#e3efe6' },
  { name: 'Лиловая ночь', g: ['#1a1030', '#4b2a6b', '#a45d8c'], sun: '#ffe6c2', ground: '#0d0818', top: '#f1e6f6', night: true },
  { name: 'Нуар', g: ['#0d0d0f', '#2b2b30', '#77777c'], sun: '#f4f4f0', ground: '#040405', top: '#e9e9e9', accent: '#c8102e', w: 2 },
  { name: 'Неон', g: ['#14062c', '#3c0f5e', '#c2187a'], sun: '#3ef0ff', ground: '#08020f', top: '#ffd0f2', accent: '#ff2bd6', night: true, w: 2 },
  { name: 'Сепия', g: ['#3b2a1a', '#8a6a44', '#e6cfa0'], sun: '#fff1d0', ground: '#24180e', top: '#f6e8cc', accent: '#b5462b' },
  { name: 'Лёд', g: ['#06121f', '#163a5a', '#7fa8c9'], sun: '#e8f4ff', ground: '#030a12', top: '#dbeeff', accent: '#4fc3ff', night: true },
  { name: 'Кровь', g: ['#120404', '#4a0a0a', '#a3201c'], sun: '#ffd9c2', ground: '#070101', top: '#ffd6d0', accent: '#ff3b2f' },
];

const TROPES = [
  'Горы',
  'Фигура на холме',
  'Лицо в небе',
  'Ночной город',
  'Дорога',
  'Море',
  'Планета',
  'Лес',
  'Дерево',
  'Двое',
  'Ноги',
  'Силуэт в огнях',
  'Спиной к спине',
  'Глаза',
  'Силуэт на фоне огня',
  'Маленькие на просторе',
  'Головы в ряд',
];

// Профиль головы, смотрит вправо: от затылка через лоб, нос и губы к шее (рамка ~42…184 × 38…215).
const PROFILE =
  'M58 215C52 180 40 150 42 115C44 70 78 38 118 40C150 42 166 66 166 92C166 100 165 106 168 112L182 132C184 136 180 139 174 139C175 144 178 147 176 151C174 154 172 155 175 158C176 163 172 166 168 167C170 176 166 184 154 186C146 187 140 186 136 190C132 200 134 208 136 215Z';
// Плечи под профилем и длинные волосы — в тех же координатах.
const SHOULDERS = 'M58 210C40 222 18 238 8 300H178C172 252 154 224 136 210Z';
const HAIR = 'M62 58C30 92 24 150 34 214C44 224 58 222 68 212C54 170 56 118 78 78Z';
// Человек в плаще и шляпе, анфас: ноги в точке (0, 0), рост 174.
const COAT_FIGURE =
  'M-20-154Q0-162 20-154Q0-150-20-154ZM-12-155C-12-168-8-174 0-174C8-174 12-168 12-155ZM-8-154C-8-142-4-136 0-136C4-136 8-142 8-154ZM0-138C-10-136-22-132-28-124C-34-94-36-54-38-14L-16-12-12-10-10 0H-3L-1-8H1L3 0H10L12-10 16-12 38-14C36-54 34-94 28-124C22-132 10-136 0-138Z';
// Женщина в платье: ноги в точке (0, 0), рост ~150.
const DRESS_FIGURE =
  'M-9-140A9 9 0 1 0 9-140A9 9 0 1 0-9-140ZM-10-142C-12-126-12-116-8-110H8C12-116 12-126 10-142ZM-6-128C-14-126-18-118-18-108L-14-80C-14-70-12-64-10-60L-26-12H-4V0H-1V-12H1V0H4V-12H26L10-60C12-64 14-70 14-80L18-108C18-118 14-126 6-128Z';
// Нога в туфле на шпильке, сбоку: бедро сверху в (0…26, 0), носок в (37, 145).
const LEG = 'M0 0C2 25 5 45 7 62C4 75 3 88 7 100C9 110 10 120 11 128L19 127C21 112 23 95 22 80C21 70 22 64 22 60C24 40 26 20 26 0Z';
const SHOE = 'M10 126L10 132L11 146H13L14 135C20 137 28 141 37 145C39 144 38 141 34 139C27 134 22 130 19 126Z';

function ridge(r: Rng, base: number, amp: number): string {
  let y = base - r() * amp * 0.6;
  let d = `M0 300L0 ${f1(y)}`;
  for (let x = 10; x <= 200; x += 10) {
    y = Math.max(base - amp, Math.min(base + amp * 0.25, y + (r() - 0.5) * amp * 0.9));
    d += `L${x} ${f1(y)}`;
  }
  return d + 'L200 300Z';
}
function stars(r: Rng, hz: number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++)
    out += `<circle cx="${f1(r() * 200)}" cy="${f1(r() * (hz - 40))}" r="${(0.4 + r() * 0.8).toFixed(2)}" fill-opacity="${(0.35 + r() * 0.55).toFixed(2)}"/>`;
  return `<g fill="#fff">${out}</g>`;
}
const hill = (s: Sky, hz: number) => `<path d="M0 ${f1(hz + 12)}Q100 ${f1(hz - 18)} 200 ${f1(hz + 12)}V300H0Z" fill="${s.ground}"/>`;
const person = (d: string, x: number, y: number, k: number, fill: string) =>
  `<path d="${d}" transform="translate(${f1(x)} ${f1(y)}) scale(${k})" fill="${fill}"/>`;
// Размытые огни: круги с мягким краем трёх цветов.
function bokeh(r: Rng, id: string, colors: string[], n: number, box: number[], rad: number[]): [string, string] {
  const defs = colors
    .map(
      (c, i) =>
        `<radialGradient id="${id}o${i}"><stop offset="0" stop-color="${c}" stop-opacity=".85"/><stop offset=".7" stop-color="${c}" stop-opacity=".45"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`,
    )
    .join('');
  let dots = '';
  for (let i = 0; i < n; i++)
    dots += `<circle cx="${f1(box[0] + r() * (box[2] - box[0]))}" cy="${f1(box[1] + r() * (box[3] - box[1]))}" r="${f1(rad[0] + r() * (rad[1] - rad[0]))}" fill="url(#${id}o${Math.floor(r() * colors.length)})" opacity="${(0.4 + r() * 0.5).toFixed(2)}"/>`;
  return [defs, dots];
}
// Мокрый асфальт: вертикальные отсветы огней.
function wetStreaks(r: Rng, id: string, s: Sky, hz: number): [string, string] {
  const defs = `<linearGradient id="${id}r" x2="0" y2="1"><stop offset="0" stop-color="${s.sun}" stop-opacity=".55"/><stop offset="1" stop-color="${s.sun}" stop-opacity="0"/></linearGradient>`;
  let out = '';
  for (let i = 0; i < 9; i++) out += `<rect x="${f1(r() * 196)}" y="${f1(hz)}" width="${f1(1.5 + r() * 4)}" height="${f1(40 + r() * (300 - hz))}" fill="url(#${id}r)"/>`;
  return [defs, out];
}
// Бюст анфас: голова, шея, плечи; верх головы в (x, y), размер k.
function bust(x: number, y: number, k: number, fill: string, edge: string): string {
  const p = (dx: number, dy: number) => `${f1(x + dx * k)} ${f1(y + dy * k)}`;
  return `<path d="M${p(-36, 82)}L${p(-34, 64)}C${p(-32, 46)} ${p(-16, 40)} ${p(-6, 39)}L${p(-6, 32)}C${p(-13, 28)} ${p(-14, 16)} ${p(-13, 12)}C${p(-13, 2)} ${p(-7, 0)} ${p(0, 0)}C${p(7, 0)} ${p(13, 2)} ${p(13, 12)}C${p(14, 16)} ${p(13, 28)} ${p(6, 32)}L${p(6, 39)}C${p(16, 40)} ${p(32, 46)} ${p(34, 64)}L${p(36, 82)}Z" fill="${fill}" stroke="${edge}" stroke-width="2"/>`;
}

const scene: Draw = (b, r, force, sky) => {
  const drawnSky = weighted(r, SKIES);
  const s = sky === undefined ? drawnSky : SKIES[sky];
  const id = uid('s');
  let hz = 196 + r() * 14;
  const font = pick(r, [F.oswald, F.playfair, F.russo, F.literata]);
  const kind = variant(r, TROPES.length, force);
  const accent = s.accent ?? s.sun;
  const ground = () => `<rect y="${f1(hz)}" width="200" height="${f1(300 - hz)}" fill="${s.ground}"/>`;
  const faceFill = `<linearGradient id="${id}f" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/></linearGradient>`;
  let art = '';
  let defs = '';
  if (kind === 0) {
    // Горы слоями: чем дальше, тем ближе к цвету неба.
    art = `<circle cx="${f1(50 + r() * 100)}" cy="${f1(hz - 70 - r() * 30)}" r="${f1(20 + r() * 16)}" fill="${s.sun}"/>`;
    for (let i = 0; i < 3; i++) art += `<path d="${ridge(r, hz - 46 + i * 22, 34 - i * 8)}" fill="${mix(s.g[2], s.ground, 0.35 + i * 0.32)}"/>`;
  } else if (kind === 1) {
    // Одинокая фигура на холме на фоне огромного солнца.
    const fx = 92 + r() * 16;
    art = `<circle cx="${f1(fx)}" cy="${f1(hz - 44)}" r="${f1(56 + r() * 14)}" fill="${s.sun}"/>${hill(s, hz)}${person(COAT_FIGURE, fx, hz - 5, 0.17, s.ground)}
<path d="M${f1(30 + r() * 30)} 70l5 3 5-3M${f1(140 + r() * 20)} 52l4 2.4 4-2.4" stroke="${s.ground}" stroke-width="1.2" fill="none" stroke-opacity=".7"/>`;
  } else if (kind === 2) {
    // Лицо в небе, внизу — далёкие холмы.
    const flip = r() < 0.5 ? 'translate(200 0) scale(-1 1) ' : '';
    defs = faceFill;
    art = `<path d="${PROFILE}" transform="${flip}translate(14 -14) scale(.9)" fill="url(#${id}f)"/><path d="${ridge(r, hz - 8, 14)}" fill="${mix(s.g[2], s.ground, 0.6)}"/>${ground()}`;
  } else if (kind === 3) {
    // Ночной город под большой луной; в окнах свет.
    art = `<circle cx="${f1(40 + r() * 120)}" cy="${f1(70 + r() * 40)}" r="${f1(26 + r() * 16)}" fill="${s.sun}"/>`;
    let windows = '';
    for (let x = -4; x < 200; ) {
      const w = 9 + r() * 14;
      const h = 18 + r() * 62 * (1 - Math.abs(x - 100) / 160);
      art += `<rect x="${f1(x)}" y="${f1(hz - h)}" width="${f1(w + 0.6)}" height="${f1(h + 1)}" fill="${s.ground}"/>`;
      for (let wy = hz - h + 5; wy < hz - 5; wy += 7) {
        for (let wx = x + 2.5; wx < x + w - 3; wx += 5) if (r() < 0.16) windows += `<rect x="${f1(wx)}" y="${f1(wy)}" width="2" height="3"/>`;
      }
      x += w;
    }
    art += `<g fill="${s.sun}" fill-opacity=".85">${windows}</g>${ground()}`;
  } else if (kind === 4) {
    // Дорога к горизонту, солнце садится в точку схода.
    art = `<circle cx="100" cy="${f1(hz - 4)}" r="${f1(24 + r() * 12)}" fill="${s.sun}"/>${ground()}<path d="M98 ${f1(hz)}H102L172 300H28Z" fill="${mix(s.ground, s.g[2], 0.22)}"/>`;
    for (const t of [0.06, 0.16, 0.3, 0.5, 0.78]) {
      const w = 0.8 + t * 3;
      art += `<rect x="${f1(100 - w / 2)}" y="${f1(hz + (300 - hz) * t)}" width="${f1(w)}" height="${f1(3 + t * 22)}" fill="${s.sun}" fill-opacity=".8"/>`;
    }
  } else if (kind === 5) {
    // Море: дорожка от солнца по воде и далёкий парус.
    const sx = 50 + r() * 100;
    const bx = 30 + r() * 140;
    art = `<circle cx="${f1(sx)}" cy="${f1(hz - 26 - r() * 40)}" r="${f1(18 + r() * 14)}" fill="${s.sun}"/><rect y="${f1(hz)}" width="200" height="${f1(300 - hz)}" fill="${mix(s.g[1], s.ground, 0.6)}"/>`;
    for (let i = 0; i < 7; i++) {
      const w = 34 - i * 3.5;
      art += `<rect x="${f1(sx - w / 2 + (r() - 0.5) * 6)}" y="${f1(hz + 5 + i * 7)}" width="${f1(w)}" height="1.6" fill="${s.sun}" fill-opacity=".55"/>`;
    }
    art += `<path d="M${f1(bx)} ${f1(hz - 1)}l0-22 12 20zM${f1(bx - 7)} ${f1(hz + 1)}h20l-3 4h-14z" fill="${s.ground}"/>`;
  } else if (kind === 6) {
    // Планета с кольцом в звёздном небе.
    const cx = 60 + r() * 80;
    const cy = 80 + r() * 50;
    const R = 34 + r() * 14;
    defs = `<radialGradient id="${id}p" cx=".35" cy=".35"><stop offset="0" stop-color="${s.sun}"/><stop offset="1" stop-color="${mix(s.sun, s.ground, 0.65)}"/></radialGradient>`;
    const ring = (sweep: number) =>
      `<path d="M${f1(cx - R * 1.75)} ${f1(cy)}A${f1(R * 1.75)} ${f1(R * 0.38)} 0 0 ${sweep} ${f1(cx + R * 1.75)} ${f1(cy)}" fill="none" stroke="${s.sun}" stroke-width="3" stroke-opacity=".8"/>`;
    art = `${stars(r, hz, 45)}<g transform="rotate(-16 ${f1(cx)} ${f1(cy)})">${ring(1)}<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R)}" fill="url(#${id}p)"/>${ring(0)}</g>
<circle cx="${f1(cx > 100 ? 40 : 160)}" cy="${f1(40 + r() * 30)}" r="5" fill="${s.sun}" fill-opacity=".8"/><path d="${ridge(r, hz - 4, 12)}" fill="${s.ground}"/>`;
  } else if (kind === 7) {
    // Лес: три ряда елей, дальние светлее.
    art = `<circle cx="${f1(40 + r() * 120)}" cy="${f1(hz - 80 - r() * 40)}" r="${f1(18 + r() * 14)}" fill="${s.sun}"/>${ground()}`;
    for (let row = 0; row < 3; row++) {
      const base = hz - 4 + row * 14;
      let d = '';
      for (let x = -10 + r() * 10; x < 210; ) {
        const hgt = (24 + r() * 30) * (1 + row * 0.3);
        const w = hgt * 0.42;
        d += `M${f1(x)} ${f1(base - hgt)}L${f1(x + w / 2)} ${f1(base)}H${f1(x - w / 2)}Z`;
        x += w * 0.55 + r() * 8;
      }
      art += `<path d="${d}" fill="${mix(s.g[2], s.ground, 0.4 + row * 0.3)}"/>`;
    }
  } else if (kind === 8) {
    // Одинокое дерево на холме под большой луной.
    const tx = 72 + r() * 56;
    const ty = hz - 3;
    const crown = [
      [-14, 4, 14],
      [12, 2, 15],
      [0, -10, 17],
      [-6, 8, 13],
      [8, 10, 12],
    ]
      .map(([dx, dy, rr]) => `<circle cx="${f1(tx + dx)}" cy="${f1(ty - 52 + dy)}" r="${rr}"/>`)
      .join('');
    art = `<circle cx="${f1(tx + (r() - 0.5) * 70)}" cy="${f1(hz - 80)}" r="${f1(42 + r() * 14)}" fill="${s.sun}"/>${hill(s, hz)}
<g fill="${s.ground}"><path d="M${f1(tx - 2.5)} ${f1(ty)}l1-40h3l1 40z"/>${crown}</g>`;
  } else if (kind === 9) {
    // Двое: два профиля друг напротив друга.
    defs = faceFill;
    art = `<path d="${PROFILE}" transform="translate(-20 42) scale(.62)" fill="url(#${id}f)"/><path d="${PROFILE}" transform="translate(220 42) scale(-.62 .62)" fill="url(#${id}f)"/>
<path d="${ridge(r, hz - 6, 12)}" fill="${mix(s.g[2], s.ground, 0.6)}"/>${ground()}`;
  } else if (kind === 10) {
    // Ноги роковой красотки: шаг по мокрой улице, огни расплываются.
    hz = 150;
    const [bd, bk] = bokeh(r, id, [s.sun, accent, s.g[2]], 16, [0, 20, 200, 150], [8, 22]);
    const [wd, wet] = wetStreaks(r, id, s, hz);
    defs = bd + wd;
    const leg = (tf: string) => `<g transform="${tf}"><path d="${LEG}" fill="${mix(s.ground, '#000000', 0.2)}"/><path d="${SHOE}" fill="${accent}"/></g>`;
    const legs = leg('translate(84 64) rotate(13)') + leg('translate(96 62) rotate(-5)');
    art = `${bk}<rect y="${hz}" width="200" height="${300 - hz}" fill="${mix(s.ground, s.g[1], 0.25)}"/>${wet}
<g transform="translate(0 418) scale(1 -1)" opacity=".22">${legs}</g>${legs}<path d="M66 0H138L132 66Q101 76 70 66Z" fill="${s.ground}"/>`;
  } else if (kind === 11) {
    // Силуэт в плаще на фоне расплывшихся огней ночного города.
    const [bd, bk] = bokeh(r, id, [s.sun, accent, s.g[2]], 26, [0, 30, 200, hz + 10], [6, 24]);
    const [wd, wet] = wetStreaks(r, id, s, hz);
    defs = bd + wd;
    const x = 92 + r() * 16;
    art = `<rect width="200" height="300" fill="${s.ground}" fill-opacity=".45"/>${bk}${ground()}${wet}${person(COAT_FIGURE, x, hz + 18, 0.9, s.ground)}`;
  } else if (kind === 12) {
    // Пара спиной к спине: два профиля с плечами, затылок к затылку.
    const k = 0.72;
    const y = 30;
    const light = mix(s.sun, s.g[1], 0.25);
    const right = `<g transform="translate(${f1(100 - 42 * k)} ${y}) scale(${k})"><path d="${SHOULDERS}"/><path d="${PROFILE}"/></g>`;
    const left = `<g transform="translate(${f1(100 + 42 * k)} ${y}) scale(${-k} ${k})"><path d="${HAIR}"/><path d="${SHOULDERS}"/><path d="${PROFILE}"/></g>`;
    art = `<circle cx="100" cy="${f1(hz - 60)}" r="${f1(60 + r() * 20)}" fill="${s.sun}" fill-opacity=".35"/><g fill="${light}">${left}</g><g fill="${s.ground}">${right}</g>`;
  } else if (kind === 13) {
    // Крупный план глаз: полоса лица поперёк обложки.
    const skin = mix(s.sun, s.g[2], 0.35);
    const shadow = mix(skin, s.ground, 0.45);
    const iris = mix(accent, s.g[1], 0.3);
    // Радужка и зрачок — внутри контура глаза.
    const eye = (cx: number, dir: number) => {
      const lift = (r() - 0.5) * 4;
      const shape = `M${cx - 30} 132Q${cx} ${f1(110 + lift)} ${cx + 30} 132Q${cx} 148 ${cx - 30} 132Z`;
      defs += `<clipPath id="${id}e${cx}"><path d="${shape}"/></clipPath>`;
      return `<path d="${shape}" fill="${mix(skin, '#ffffff', 0.55)}"/>
<g clip-path="url(#${id}e${cx})"><circle cx="${f1(cx + dir * 3)}" cy="131" r="11" fill="${iris}"/><circle cx="${f1(cx + dir * 3)}" cy="131" r="5" fill="#0b0b0d"/><circle cx="${f1(cx + dir * 3 + 3)}" cy="127.5" r="2" fill="#fff"/></g>
<path d="M${cx - 31} 132Q${cx} ${f1(108 + lift)} ${cx + 31} 132" fill="none" stroke="${s.ground}" stroke-width="3" stroke-linecap="round"/>
<path d="M${cx - 30} ${f1(104 + lift)}Q${cx - 4} ${f1(94 + lift)} ${cx + 30} ${f1(100 + lift)}" fill="none" stroke="${shadow}" stroke-width="5" stroke-linecap="round"/>`;
    };
    const look = r() < 0.5 ? -1 : 1;
    defs += `<linearGradient id="${id}n" x2="1"><stop offset=".4" stop-color="${shadow}" stop-opacity="0"/><stop offset=".5" stop-color="${shadow}" stop-opacity=".55"/><stop offset=".6" stop-color="${shadow}" stop-opacity="0"/></linearGradient>`;
    art = `<rect width="200" height="300" fill="${s.ground}" fill-opacity=".6"/><rect y="86" width="200" height="74" fill="${skin}"/><rect y="86" width="200" height="74" fill="url(#${id}n)"/>
${eye(56, look)}${eye(144, look)}<rect y="84" width="200" height="2" fill="${s.ground}"/><rect y="160" width="200" height="2" fill="${s.ground}"/>`;
  } else if (kind === 14) {
    // Чёрный силуэт на фоне взрыва или огромного заката.
    const fire = r() < 0.5;
    const x = 90 + r() * 20;
    if (fire) {
      defs = `<radialGradient id="${id}x"><stop offset="0" stop-color="#fffbe8"/><stop offset=".25" stop-color="${s.sun}" stop-opacity=".95"/><stop offset=".6" stop-color="${accent}" stop-opacity=".6"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>`;
      let flames = `M0 ${f1(hz + 4)}`;
      for (let fx = 0; fx <= 200; fx += 7) flames += `L${fx} ${f1(hz - 6 - r() * 46 * Math.sin((fx / 200) * Math.PI))}`;
      flames += `L200 ${f1(hz + 6)}Z`;
      let smoke = '';
      for (let i = 0; i < 5; i++) smoke += `<circle cx="${f1(r() * 200)}" cy="${f1(10 + r() * 60)}" r="${f1(28 + r() * 22)}"/>`;
      art = `<circle cx="100" cy="${f1(hz - 30)}" r="150" fill="url(#${id}x)"/><g fill="${s.ground}" fill-opacity=".5">${smoke}</g><path d="${flames}" fill="${accent}" fill-opacity=".85"/>${ground()}`;
    } else {
      art = `<circle cx="100" cy="${f1(hz)}" r="${f1(84 + r() * 16)}" fill="${s.sun}"/>${ground()}`;
    }
    art += person(COAT_FIGURE, x, hz + 22, 0.72, '#050505');
  } else if (kind === 15) {
    // Маленькие герои на краю обрыва перед огромным морем.
    hz -= 30;
    const flip = r() < 0.5;
    const tf = flip ? 'translate(200 0) scale(-1 1)' : '';
    const sx = 60 + r() * 90;
    art = `<circle cx="${f1(sx)}" cy="${f1(hz - 40 - r() * 50)}" r="${f1(16 + r() * 18)}" fill="${s.sun}"/><rect y="${f1(hz)}" width="200" height="${f1(300 - hz)}" fill="${mix(s.g[1], s.ground, 0.55)}"/>
<path d="M${f1(sx - 14)} ${f1(hz + 3)}h28M${f1(sx - 9)} ${f1(hz + 9)}h18M${f1(sx - 5)} ${f1(hz + 15)}h10" stroke="${s.sun}" stroke-opacity=".5" stroke-width="1.5"/>
<g transform="${tf}"><path d="M0 ${f1(hz + 6)}L46 ${f1(hz + 10)}L64 ${f1(hz + 16)}L72 ${f1(hz + 34)}L80 300H0Z" fill="${s.ground}"/>${person(COAT_FIGURE, 44, hz + 9, 0.09, s.ground)}${person(DRESS_FIGURE, 53, hz + 10, 0.1, s.ground)}</g>`;
  } else {
    // Головы в ряд: бюсты всех героев, в центре — главный.
    const tones = [mix(s.sun, s.g[1], 0.2), mix(s.g[2], s.ground, 0.3), mix(accent, s.g[1], 0.35)];
    const row: [number, number, number][] = [
      [36, 74, 0.82],
      [164, 74, 0.82],
      [68, 62, 0.98],
      [132, 62, 0.98],
      [100, 48, 1.18],
    ];
    art = `<circle cx="100" cy="${f1(hz)}" r="90" fill="${s.sun}" fill-opacity=".3"/>${row.map(([x, y, k], i) => bust(x, y, k, tones[(i + Math.floor(r() * 3)) % 3], s.g[0])).join('')}
<path d="${ridge(r, hz - 2, 10)}" fill="${s.ground}"/>`;
  }
  const starry = s.night && kind !== 6 ? stars(r, hz, 45) : '';
  const t = fit(cased(font, b.title), { ...font, maxW: 168, maxLines: 3, max: 28, min: 12, lh: 1.08 })!;
  return [
    svg(`<defs>${defs}<linearGradient id="${id}k" x2="0" y2="${f1(hz)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${s.g[0]}"/><stop offset=".55" stop-color="${s.g[1]}"/><stop offset="1" stop-color="${s.g[2]}"/></linearGradient>
<linearGradient id="${id}d" x2="0" y2="1"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>
<rect width="200" height="300" fill="url(#${id}k)"/>${starry}${art}<rect width="200" height="300" fill="url(#${id}d)"/>
${txt(authorLine(b, 170, 1, 1.6), 100, 26, s.top, 'middle', ' fill-opacity=".9"')}${txt(t, 100, 284 - block(t), '#fbf7ee', 'middle')}`),
    kind,
  ];
};

// ============ Стиль выбирает автор ============

interface Style {
  id: string;
  name: string;
  draw: Draw;
  variants: string[];
  w: number;
}
export const COVER_STYLES: readonly Style[] = [
  { id: 'scene', name: 'Сюжет', draw: scene, variants: TROPES, w: 4 },
  { id: 'cloth', name: 'Переплёт', draw: cloth, variants: ['Рамка', 'Корешок', 'Наклейка', 'Серия'], w: 1 },
  { id: 'ornament', name: 'Орнамент', draw: ornament, variants: ['Плитки', 'Круги', 'Треугольники', 'Радуги'], w: 1 },
  { id: 'glow', name: 'Акварель', draw: glow, variants: ['Сумерки', 'Пастель', 'Солнце', 'Окно'], w: 1 },
  { id: 'poster', name: 'Плакат', draw: poster, variants: ['Круг', 'Полукруг', 'Четверть', 'Столб', 'Кольца', 'Диагональ', 'Точки'], w: 1 },
];
export const COVER_SKIES = SKIES.map((s) => s.name);

const bookKey = (b: CoverBook) => `${words(b.title).join(' ')}|${surname(b.author)}`;
const styleOf = (b: CoverBook) => weighted(rng(hash('style|' + (surname(b.author) || words(b.title).join(' ')))), COVER_STYLES);

export interface DrawnCover {
  svg: string;
  style: string;
  variant: string;
}

// Обложка книги; style и variant — только для страницы-прототипа, чтобы показать все варианты.
export function drawCover(b: CoverBook, opts: { style?: string; variant?: number; sky?: number } = {}): DrawnCover {
  const style = COVER_STYLES.find((s) => s.id === opts.style) ?? styleOf(b);
  const book = { title: b.title.trim() || 'Без названия', author: b.author.trim() };
  const [body, v] = style.draw(book, rng(hash(bookKey(book))), opts.variant, opts.sky);
  return { svg: body, style: style.name, variant: style.variants[v] };
}

const cache = new Map<string, string>();
let insertN = 0;

// SVG для вставки в страницу: из кеша, с уникальными id.
export function coverSvg(b: CoverBook): string {
  const key = `${b.title}\n${b.author}`;
  let body = cache.get(key);
  if (body === undefined) {
    if (cache.size > 3000) cache.clear();
    body = drawCover(b).svg;
    cache.set(key, body);
  }
  const prefix = `k${++insertN}-`;
  return body.replaceAll(ID, prefix);
}
