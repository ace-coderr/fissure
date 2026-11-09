// WCAG 2 contrast ratios for every text/background pair the site uses, computed
// from the design tokens in src/styles/tokens.css.   npm run contrast
// Exit status 1 if any pair is below its required ratio (4.5 for body text, 3 for
// large text and UI components).

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(site, "src/styles/tokens.css"), "utf8");
const tok = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
};

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const mix = (fg: RGB, bg: RGB, a: number): RGB => fg.map((c, i) => c * a + bg[i] * (1 - a)) as RGB;
const lum = ([r, g, b]: RGB): number => {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGB, b: RGB): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const paper = rgb(tok("paper"));
const paperDeep = rgb(tok("paper-deep"));
const ink = rgb(tok("ink"));
const inkSoft = rgb(tok("ink-soft"));
const rust = rgb(tok("rust"));
const rustBright = rgb(tok("rust-bright"));
const graphite = rgb(tok("graphite"));
const graphite2 = rgb(tok("graphite-2"));
const onDark = rgb(tok("on-dark"));
const onDarkSoft = rgb(tok("on-dark-soft"));
const white: RGB = [255, 255, 255];

const pairs: [string, RGB, RGB, number][] = [
  ["body text: ink on paper", ink, paper, 4.5],
  ["secondary text: ink-soft on paper", inkSoft, paper, 4.5],
  ["secondary text: ink-soft on paper-deep (table header, open row)", inkSoft, paperDeep, 4.5],
  ["bracket labels, links: rust on paper", rust, paper, 4.5],
  ["rust on paper-deep (open row, header)", rust, paperDeep, 4.5],
  ["inline code: ink on paper-deep", ink, paperDeep, 4.5],
  ["MISSED badge: rust on its hatch stripe (rust 14% over paper)", rust, mix(rust, paper, 0.14), 4.5],
  ["why-box text: ink on rust 8% over paper", ink, mix(rust, paper, 0.08), 4.5],
  ["why-box label: rust on rust 8% over paper", rust, mix(rust, paper, 0.08), 4.5],
  ["nav active link: rust on paper (94% opaque)", rust, mix(paper, [255, 255, 255], 0.94), 4.5],
  ["buttons: paper on ink", paper, ink, 4.5],
  ["solid button hover: white on rust", white, rust, 4.5],
  ["CAUGHT badge: paper on ink", paper, ink, 4.5],
  ["dark panels: on-dark on graphite", onDark, graphite, 4.5],
  ["dark secondary text: on-dark-soft on graphite", onDarkSoft, graphite, 4.5],
  ["dark secondary text: on-dark-soft on graphite-2", onDarkSoft, graphite2, 4.5],
  ["dark accents: rust-bright on graphite", rustBright, graphite, 4.5],
  ["footer pill: white on graphite", white, graphite, 4.5],
  ["footer pill hover: graphite on white", graphite, white, 4.5],
  ["ticker text: on-dark on graphite", onDark, graphite, 4.5],
  ["focus ring on paper: rust vs paper (UI, 3:1)", rust, paper, 3],
  ["focus ring on dark: rust-bright vs graphite (UI, 3:1)", rustBright, graphite, 3],
  ["input/button border on paper: ink vs paper (UI, 3:1)", ink, paper, 3],
  ["dot-matrix digits: ink on paper (large graphic, 3:1)", ink, paper, 3],
];

let bad = 0;
console.log("ratio  need  pair");
for (const [name, fg, bg, need] of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= need;
  if (!ok) bad++;
  console.log(`${r.toFixed(2).padStart(5)}  ${need.toFixed(1)}  ${ok ? "ok  " : "FAIL"} ${name}`);
}
if (bad > 0) {
  console.log(`\n${bad} pair(s) below the required ratio`);
  process.exit(1);
}
