// Parsers for the repository's own decoded output and docs. They throw on
// anything unexpected: the site must never be built from data it misread.

export interface Step {
  index: number;
  call: string;
  value: string; // wei, decimal string ("0" when none)
  words: string[];
  sender: number; // 0 = the test account, 1.. = relays
}

export interface Failure {
  test: string;
  seed: string;
  invariant: number;
  originalLen: number;
  shrunkLen: number;
  replays: number | null;
  steps: Step[];
}

const STEP = /^\s+(\d+)\. (.+?)\s{2,}(?:value=(\d+) wei\s+)?words=\[([^\]]*)\](?:\s+\[sender: relay (\d+)\])?\s*$/;

/** Parse every "FISSURE FOUND A FAILURE" block of decoded output. */
export function parseFailures(text: string): Failure[] {
  const out: Failure[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const head = /^(\S+): FISSURE FOUND A FAILURE$/.exec(lines[i]);
    if (!head) continue;
    const seedLine = /^\s+seed (\d+)\s+broken invariant #(\d+)$/.exec(lines[i + 1] ?? "");
    const lenLine = /^\s+(\d+) calls shrunk to (\d+)(?: in (\d+) replays)?$/.exec(lines[i + 2] ?? "");
    if (!seedLine || !lenLine) throw new Error(`unexpected failure block at line ${i + 1}: ${lines.slice(i, i + 3).join(" | ")}`);
    const steps: Step[] = [];
    let j = i + 3;
    while (j < lines.length && STEP.test(lines[j])) {
      const m = STEP.exec(lines[j])!;
      steps.push({ index: Number(m[1]), call: m[2], value: m[3] ?? "0", words: m[4].split(",").map((w) => w.trim()), sender: Number(m[5] ?? 0) });
      j++;
    }
    if (steps.length !== Number(lenLine[2])) {
      throw new Error(`${head[1]}: ${steps.length} steps listed but the header says ${lenLine[2]}`);
    }
    out.push({
      test: head[1],
      seed: seedLine[1],
      invariant: Number(seedLine[2]),
      originalLen: Number(lenLine[1]),
      shrunkLen: Number(lenLine[2]),
      replays: lenLine[3] === undefined ? null : Number(lenLine[3]),
      steps,
    });
  }
  return out;
}

export interface TableRow {
  id: number;
  verdict: "caught" | "missed" | "clean";
  invariant: number | null;
  originalLen: number | null;
  shrunkLen: number | null;
  replays: number | null;
  accepted: number | null;
}

const verdictOf = (v: string): TableRow["verdict"] => (v === "CAUGHT" ? "caught" : v === "clean" ? "clean" : "missed");

/** The two MUTATION RESULTS tables: "single sender" and "test account + 2 relay senders". */
export function parseResultTable(text: string, title: string): TableRow[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.startsWith(title));
  if (start < 0) throw new Error(`table not found: ${title}`);
  const rows: TableRow[] = [];
  for (let i = start + 2; i < lines.length; i++) {
    const m = /^\s+(\d+)\s+(CAUGHT|missed|clean)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)$/.exec(lines[i]);
    if (!m) break;
    const caught = m[2] === "CAUGHT";
    const lens = /^(\d+)->(\d+)$/.exec(m[4]);
    rows.push({
      id: Number(m[1]),
      verdict: verdictOf(m[2]),
      invariant: caught ? Number(m[3]) : null,
      originalLen: caught && lens ? Number(lens[1]) : null,
      shrunkLen: caught && lens ? Number(lens[2]) : null,
      replays: caught ? Number(m[5]) : null,
      accepted: Number(m[6]),
    });
  }
  if (rows.length === 0) throw new Error(`table is empty: ${title}`);
  return rows;
}

export interface HeldRow {
  id: number;
  single: Pick<TableRow, "verdict" | "invariant" | "originalLen" | "shrunkLen">;
  relaysGeneric: Pick<TableRow, "verdict" | "invariant" | "originalLen" | "shrunkLen">;
  relaysTuned: Pick<TableRow, "verdict" | "invariant" | "originalLen" | "shrunkLen">;
}

function heldCell(cell: string): HeldRow["single"] {
  const t = cell.trim();
  if (t === "missed") return { verdict: "missed", invariant: null, originalLen: null, shrunkLen: null };
  const m = /^CAUGHT #(\d+) (\d+)->(\d+)$/.exec(t);
  if (!m) throw new Error(`unexpected held-out cell: "${cell}"`);
  return { verdict: "caught", invariant: Number(m[1]), originalLen: Number(m[2]), shrunkLen: Number(m[3]) };
}

/** The HELD-OUT MUTANTS table (fixed-width cells, as printed by scripts/fissure-report.mjs). */
export function parseHeldOutTable(text: string): HeldRow[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.startsWith("HELD-OUT MUTANTS"));
  if (start < 0) throw new Error("held-out table not found");
  const rows: HeldRow[] = [];
  for (let i = start + 2; i < lines.length; i++) {
    const l = lines[i];
    const m = /^\s+(\d+)  /.exec(l);
    if (!m) break;
    rows.push({
      id: Number(m[1]),
      single: heldCell(l.slice(10, 44)),
      relaysGeneric: heldCell(l.slice(46, 80)),
      relaysTuned: heldCell(l.slice(82, 116)),
    });
  }
  if (rows.length === 0) throw new Error("held-out table is empty");
  return rows;
}

/** "test name" -> which mutant and which configuration. */
export function classifyTest(test: string): { id: number; config: "single" | "relaysTuned" | "relaysGeneric"; heldOut: boolean } | null {
  let m = /^heldout_mutant_(\d+)_(single|relays_generic|relays_tuned)$/.exec(test);
  if (m) {
    const config = m[2] === "single" ? "single" : m[2] === "relays_generic" ? "relaysGeneric" : "relaysTuned";
    return { id: Number(m[1]), config, heldOut: true };
  }
  m = /^multi_mutant_(\d+)_/.exec(test);
  if (m) return { id: Number(m[1]), config: "relaysTuned", heldOut: false };
  m = /^mutant_(\d+)_/.exec(test);
  if (m) return { id: Number(m[1]), config: "single", heldOut: false };
  return null;
}

const plain = (s: string): string => s.replace(/`/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

export interface MutationDocs {
  titles: Record<number, string>;
  descriptions: Record<number, string>;
  kinds: Record<number, string>;
  reasons: Record<number, string>;
  invariants: Record<number, string>;
}

/** Titles, descriptions, miss reasons and invariants from docs/mutation.md. */
export function parseMutationDocs(md: string): MutationDocs {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const titles: Record<number, string> = {};
  const descriptions: Record<number, string> = {};
  const kinds: Record<number, string> = {};
  const invariants: Record<number, string> = {};
  for (const l of lines) {
    let m = /^\| (\d+) ([^|]+?) \| /.exec(l);
    if (m && !/^(Mutant|Id)/.test(m[2])) titles[Number(m[1])] ??= plain(m[2]);
    m = /^\| (\d+) \| ([^|]+?) \| (?:\*\*)?(caught|missed|clean)/.exec(l);
    if (m) descriptions[Number(m[1])] ??= plain(m[2]);
    m = /^\| (1[2-7]) \| ([^|]+?) \| ([^|]+?) \| /.exec(l);
    if (m) {
      descriptions[Number(m[1])] ??= plain(m[2]);
      kinds[Number(m[1])] = plain(m[3]);
    }
    m = /^\| (\d+) \| ([^|]+?) \|\s*$/.exec(l);
    if (m) invariants[Number(m[1])] = plain(m[2]);
  }
  // invariant 10 is described in the prose of the multi-sender section
  const inv10 = /invariant 10: ([^)]+)\)/.exec(md);
  if (inv10) invariants[10] = plain(inv10[1]);
  // bullets, with their continuation lines
  const bullets: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("- **")) continue;
    let text = lines[i].slice(2);
    while (i + 1 < lines.length && lines[i + 1].startsWith("  ")) text += " " + lines[++i].trim();
    bullets.push(text);
  }
  const reasons: Record<number, string> = {};
  for (const b of bullets) {
    let m = /^\*\*(\d+), ([^:]+): ([^*]+?)\*\* ?(.*)$/s.exec(b);
    if (m) reasons[Number(m[1])] = plain(`${m[3]}. ${m[4]}`).replace(/\.\./g, ".");
    m = /^\*\*Missed, with the reason: mutant (\d+)([^*]*)\*\* ?(.*)$/s.exec(b);
    if (m) reasons[Number(m[1])] = plain(m[3]);
  }
  return { titles, descriptions, kinds, reasons, invariants };
}

/** The "All calls" row of docs/revert-rate.md: untyped and typed revert rates. */
export function parseRevertRate(md: string): { untyped: string; typed: string; calls: number } {
  const m = /\| \*\*All calls\*\* \| \*\*(\d+\.\d)% \((\d+)\/(\d+)\)\*\* \| \*\*(\d+\.\d)% \((\d+)\/(\d+)\)\*\* \|/.exec(md);
  if (!m) throw new Error("revert-rate row not found in docs/revert-rate.md");
  return { untyped: m[1], typed: m[4], calls: Number(m[3]) };
}

export interface OriginalRaw {
  meta: { seed: string; originalLen: number; shrunkLen: number };
  steps: { index: number; variant: number; selector: number; value: string; w0: string; w1: string; w2: string; who: number }[];
  next: string[];
  derive: string[];
  candidateReplay: number;
  testAccount: string;
}

const MARKER = "4048928990"; // 0xf155c0de

/** The scratch capture (site/data/raw/original.txt). Tags: 10 meta, 11 step, 12 PRNG output, 13 candidate replay. */
export function parseOriginal(text: string): OriginalRaw {
  let meta: OriginalRaw["meta"] | null = null;
  const steps: OriginalRaw["steps"] = [];
  const next: string[] = [];
  const derive: string[] = [];
  let candidateReplay = -1;
  let testAccount = "";
  for (const line of text.trim().split("\n")) {
    const w = line.trim().split(" ");
    if (w[0] !== MARKER) throw new Error(`capture line without marker: ${line.slice(0, 40)}`);
    const tag = Number(w[1]);
    if (tag === 10) meta = { seed: w[2], originalLen: Number(w[3]), shrunkLen: Number(w[4]) };
    else if (tag === 11) steps.push({ index: Number(w[2]), variant: Number(w[3]), selector: Number(w[4]), value: w[5], w0: w[6], w1: w[7], w2: w[8], who: Number(w[9]) });
    else if (tag === 12) (w[2] === "1" ? next : derive)[Number(w[3])] = w[4];
    else if (tag === 13) candidateReplay = Number(w[4]);
    else if (tag === 14) testAccount = w[4];
    else throw new Error(`unknown capture tag ${tag}`);
  }
  if (!meta) throw new Error("capture has no meta record");
  if (steps.length !== meta.originalLen) throw new Error("capture step count does not match the original length");
  if (next.length !== 16 || derive.length !== 8) throw new Error("capture PRNG outputs are incomplete");
  if (candidateReplay < 0) throw new Error("capture has no candidate replay record");
  if (!testAccount) throw new Error("capture has no test account record");
  return { meta, steps, next, derive, candidateReplay, testAccount };
}
