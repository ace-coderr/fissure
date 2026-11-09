// Turn the captured raw output (site/data/raw) and the repository's docs into
// site/data/*.json. Run with `npm run data`. Never hand-edit the JSON.
//
// Every file records where it came from: the commit whose code produced the
// numbers, the Fe version, the capture date and its source files. The script
// fails (and writes nothing) if anything does not parse or does not agree, for
// example if the TypeScript PRNG port disagrees with the values Fe produced.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { derive, FissurePrng } from "../src/lib/prng.ts";
import { keccak256Hex } from "./lib/keccak.ts";
import {
  classifyTest,
  parseFailures,
  parseHeldOutTable,
  parseMutationDocs,
  parseOriginal,
  parseResultTable,
  parseRevertRate,
} from "./lib/parse.ts";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = resolve(site, "..");
const raw = (f: string): string => readFileSync(join(site, "data", "raw", f), "utf8").replace(/\r\n/g, "\n");
const repoFile = (f: string): string => readFileSync(join(repo, f), "utf8").replace(/\r\n/g, "\n");

// ---------- provenance ----------
const metaText = raw("meta.txt");
const meta = Object.fromEntries(metaText.trim().split("\n").map((l) => l.split("=") as [string, string]));
for (const k of ["head_commit", "code_commit", "fe_version", "captured_utc"]) {
  if (!meta[k]) throw new Error(`meta.txt is missing ${k}`);
}
const provenance = (sources: string[], extra: Record<string, unknown> = {}) => ({
  codeCommit: meta.code_commit,
  capturedAtCommit: meta.head_commit,
  fe: meta.fe_version,
  captured: meta.captured_utc,
  sources,
  ...extra,
});

// ---------- the whole test suite ----------
const testsText = raw("tests.txt");
const testsPassed = Number(/(\d+) passed; 0 failed/.exec(testsText)?.[1]);
if (!Number.isFinite(testsPassed) || testsPassed <= 0) throw new Error("could not read the test count");

// ---------- the demo ----------
const demoFailures = parseFailures(raw("demo.decoded.txt"));
if (demoFailures.length !== 1) throw new Error("expected exactly one demo failure block");
const demo = demoFailures[0];
const orig = parseOriginal(raw("original.txt"));
if (orig.meta.seed !== demo.seed) throw new Error("the captured seed differs from the decoded demo seed");
if (orig.meta.originalLen !== demo.originalLen || orig.meta.shrunkLen !== demo.shrunkLen) throw new Error("capture and decoded demo disagree on lengths");

// PRNG port check: the TypeScript port must reproduce Fe's own outputs.
const seed = BigInt(demo.seed);
const prng = new FissurePrng(seed);
orig.next.forEach((v, i) => {
  const got = prng.next();
  if (got.toString() !== v) throw new Error(`PRNG port mismatch at next #${i}`);
});
orig.derive.forEach((v, i) => {
  if (derive(seed, BigInt(i)).toString() !== v) throw new Error(`PRNG port mismatch at derive #${i}`);
});

// selector -> signature, from the contract's ABI
const abi = JSON.parse(raw("VaultBug.abi.json")) as { type: string; name?: string; inputs?: { type: string }[] }[];
const bySelector = new Map<number, string>();
for (const f of abi.filter((e) => e.type === "function")) {
  const sig = `${f.name}(${(f.inputs ?? []).map((i) => i.type).join(",")})`;
  bySelector.set(parseInt(keccak256Hex(sig).slice(0, 8), 16), sig);
}
const originalSteps = orig.steps.map((s) => {
  const call = bySelector.get(s.selector);
  if (!call) throw new Error(`no ABI function for selector ${s.selector}`);
  return { index: s.index, call, value: s.value, words: [s.w0, s.w1, s.w2], sender: s.who };
});

// Which original calls the shrinker kept. The library does not log attempts, so
// this is derived, and checked: the shrinker's first candidate (src/shrink.fe,
// pass 1) drops the first chunk of floor(len / 2) calls. Fissure replayed that
// candidate in the capture and it still failed with the same invariant.
const chunk = Math.floor(demo.originalLen / 2);
const keptIdx = originalSteps.map((s) => s.index).filter((i) => i >= chunk);
const droppedIdx = originalSteps.map((s) => s.index).filter((i) => i < chunk);
const derivedOk =
  orig.candidateReplay === demo.invariant &&
  keptIdx.length === demo.shrunkLen &&
  keptIdx.every((i, k) => originalSteps[i].call === demo.steps[k].call);
if (!derivedOk) throw new Error("the derived shrink trace does not match the decoded result");

const demoSource = repoFile("src/demo_tests.fe");
const cfg = /fn config\(\) -> Config \{\s*Config \{ seed: (\d+), steps: (\d+), gas: (\d+) \}\s*\}/.exec(demoSource);
const runs = /hunt<BugVault>\(config\(\), (\d+)\)/.exec(demoSource);
const invariantText = /\/\/\/ The invariant: ([^\n]+)/.exec(demoSource)?.[1];
if (!cfg || !runs || !invariantText) throw new Error("could not read the demo configuration from src/demo_tests.fe");
const bugSource = repoFile("src/vault_bug.fe");
const bugParagraph = /\/\/ The bug: ([\s\S]*?)\n\/\/ Every other path/.exec(bugSource)?.[1]?.replace(/\n\/\/ ?/g, " ").trim();
if (!bugParagraph) throw new Error("could not read the bug description from src/vault_bug.fe");

const seedHex = "0x" + seed.toString(16).padStart(64, "0");
const demoJson = {
  provenance: provenance(["demo.decoded.txt", "original.txt", "VaultBug.abi.json", "src/demo_tests.fe", "src/vault_bug.fe"], {
    seed: demo.seed,
    note: "Original steps and PRNG outputs come from a throwaway test run in a copy of the repository (site/scripts/capture.ts); the library does not emit them. Which calls were dropped is derived and verified, see shrinkTrace.",
  }),
  contract: "vault_bug",
  seed: demo.seed,
  seedHex,
  testAccount: "0x" + BigInt(orig.testAccount).toString(16).padStart(40, "0"),
  config: { seed: Number(cfg[1]), steps: Number(cfg[2]), gas: Number(cfg[3]), runs: Number(runs[1]) },
  invariant: { id: demo.invariant, text: invariantText.replace(/\.$/, "") },
  bug: bugParagraph,
  originalLen: demo.originalLen,
  shrunkLen: demo.shrunkLen,
  replays: demo.replays,
  original: originalSteps,
  shrunk: demo.steps,
  shrinkTrace: {
    derived: true,
    rule: "Pass 1 of the shrinker tries dropping the first chunk of floor(length / 2) calls before anything else. Fissure replayed that exact candidate and it still broke the same invariant.",
    dropped: droppedIdx,
    kept: keptIdx,
    candidateReplayInvariant: orig.candidateReplay,
    // the kept call whose value the simplification pass lowered
    simplified: keptIdx
      .map((i, k) => ({ index: i, from: originalSteps[i].value, to: demo.steps[k].value }))
      .filter((s) => s.from !== s.to),
  },
  prng: { verified: true, next: orig.next, derive: orig.derive },
};

// ---------- mutants ----------
const mutantsText = raw("mutants.decoded.txt");
const failures = parseFailures(mutantsText);
const single = parseResultTable(mutantsText, "MUTATION RESULTS (single sender)");
const relays = parseResultTable(mutantsText, "MUTATION RESULTS (test account + 2 relay senders)");
const held = parseHeldOutTable(mutantsText);
const docs = parseMutationDocs(repoFile("docs/mutation.md"));

type Cell = {
  verdict: "caught" | "missed" | "clean";
  invariant: number | null;
  seed: string | null;
  originalLen: number | null;
  shrunkLen: number | null;
  replays: number | null;
  accepted: number | null;
  /** The invariant was already broken on the freshly deployed contract: caught before any call. */
  atDeployment: boolean;
  steps: { call: string; value: string; words: string[]; sender: number }[];
} | null;

const blank = (): NonNullable<Cell> => ({ verdict: "missed", invariant: null, seed: null, originalLen: null, shrunkLen: null, replays: null, accepted: null, atDeployment: false, steps: [] });
const cells = new Map<string, NonNullable<Cell>>();
const key = (id: number, cfgName: string) => `${id}:${cfgName}`;

for (const r of single) cells.set(key(r.id, "single"), { ...blank(), ...r, seed: null, steps: [] });
for (const r of relays) cells.set(key(r.id, "relaysTuned"), { ...blank(), ...r, seed: null, steps: [] });
for (const h of held) {
  for (const [name, c] of [["single", h.single], ["relaysGeneric", h.relaysGeneric], ["relaysTuned", h.relaysTuned]] as const) {
    cells.set(key(h.id, name), { ...blank(), verdict: c.verdict, invariant: c.invariant, originalLen: c.originalLen, shrunkLen: c.shrunkLen });
  }
}
for (const f of failures) {
  const c = classifyTest(f.test);
  if (!c) continue;
  const cell = cells.get(key(c.id, c.config));
  if (!cell) throw new Error(`failure block for ${f.test} has no table row`);
  if (cell.verdict !== "caught") throw new Error(`${f.test}: block says caught but the table does not`);
  if (cell.invariant !== f.invariant || cell.originalLen !== f.originalLen || cell.shrunkLen !== f.shrunkLen) {
    throw new Error(`${f.test}: the block and the table disagree`);
  }
  cell.seed = f.seed;
  cell.atDeployment = f.originalLen === 0;
  cell.replays = f.replays;
  cell.steps = f.steps.map((s) => ({ call: s.call, value: s.value, words: s.words, sender: s.sender }));
}
for (const [k, c] of cells) {
  if (c.verdict === "caught" && c.seed === null && c.originalLen !== 0) throw new Error(`caught cell ${k} has no seed block`);
}

const ids = [...new Set([...single.map((r) => r.id), ...relays.map((r) => r.id), ...held.map((h) => h.id)])].sort((a, b) => a - b);
const mutants = ids.map((id) => {
  const title = docs.titles[id];
  if (title === undefined) throw new Error(`no title for mutant ${id} in docs/mutation.md`);
  const missedAnywhere = ["single", "relaysTuned", "relaysGeneric"].some((n) => cells.get(key(id, n))?.verdict === "missed");
  if (id !== 0 && missedAnywhere && docs.reasons[id] === undefined) throw new Error(`mutant ${id} is missed somewhere but docs/mutation.md gives no reason`);
  return {
    id,
    title,
    description: docs.descriptions[id] ?? title,
    kind: docs.kinds[id] ?? null,
    heldOut: id >= 12,
    control: id === 0,
    reason: docs.reasons[id] ?? null,
    single: cells.get(key(id, "single")) ?? null,
    relaysTuned: cells.get(key(id, "relaysTuned")) ?? null,
    relaysGeneric: cells.get(key(id, "relaysGeneric")) ?? null,
  };
});

const countCaught = (name: "single" | "relaysTuned" | "relaysGeneric", from: number, to: number): { caught: number; total: number } => {
  const rows = mutants.filter((m) => m.id >= from && m.id <= to && m[name] !== null);
  return { caught: rows.filter((m) => m[name]!.verdict === "caught").length, total: rows.length };
};

const mutantsJson = {
  provenance: provenance(["mutants.decoded.txt", "docs/mutation.md"], {
    note: "Seeds, lengths and verdicts are from the decoded output of `fe test --show-logs -f mutant_`. Titles, descriptions and the reasons for misses are from docs/mutation.md.",
  }),
  harnesses: {
    single: "one sender, generic generators",
    relaysTuned: "test account + 2 relays, harness-specific generators",
    relaysGeneric: "test account + 2 relays, generic generators (held-out mutants only)",
  },
  invariants: docs.invariants,
  mutants,
};

// ---------- stats ----------
const revert = parseRevertRate(repoFile("docs/revert-rate.md"));
const pitch = /\*\*Pitch:\*\* ([^\n]+)/.exec(repoFile("README.md"))?.[1];
if (!pitch) throw new Error("could not read the pitch from README.md");
const statsJson = {
  provenance: provenance(["tests.txt", "demo.decoded.txt", "mutants.decoded.txt", "docs/revert-rate.md", "README.md"]),
  pitch,
  tests: testsPassed,
  demo: { originalLen: demo.originalLen, shrunkLen: demo.shrunkLen, replays: demo.replays },
  mutants: {
    total: mutants.filter((m) => !m.control).length,
    step7: { single: countCaught("single", 1, 11), relays: countCaught("relaysTuned", 1, 11) },
    heldOut: {
      single: countCaught("single", 12, 17),
      relaysGeneric: countCaught("relaysGeneric", 12, 17),
      relaysTuned: countCaught("relaysTuned", 12, 17),
    },
  },
  revertRate: { untyped: revert.untyped, typed: revert.typed, calls: revert.calls },
};

// ---------- ticker: real phrases from the output ----------
const sevenWords = seedHex.slice(2).match(/.{16}/g)!.map((w) => w);
const ticker = [
  `seed 0x${sevenWords[0]}…${sevenWords[3]}`,
  `${demo.originalLen} calls shrunk to ${demo.shrunkLen} in ${demo.replays} replays`,
  `broken invariant #${demo.invariant}`,
  ...demo.steps.map((s) => `${s.call} value=${s.value} wei`),
  ...Object.entries(docs.invariants).slice(0, 9).map(([id, text]) => `invariant ${id}: ${text}`),
  ...mutants.filter((m) => m.relaysTuned?.verdict === "caught" || m.single?.verdict === "caught").slice(0, 8).map((m) => `mutant ${m.id}: ${m.title}`),
  `revert rate ${revert.untyped}% → ${revert.typed}%`,
  `${testsPassed} tests, 0 failed`,
  meta.fe_version,
];

// ---------- write ----------
const out = join(site, "data");
mkdirSync(out, { recursive: true });
const write = (name: string, v: unknown) => writeFileSync(join(out, name), JSON.stringify(v, null, 2) + "\n");
write("demo.json", demoJson);
write("mutants.json", mutantsJson);
write("stats.json", statsJson);
write("ticker.json", { provenance: provenance(["demo.decoded.txt", "mutants.decoded.txt", "docs/mutation.md"]), items: ticker });
write("meta.json", { provenance: provenance(["meta.txt"]) });
console.log(
  `data: ${testsPassed} tests; demo ${demo.originalLen}->${demo.shrunkLen} in ${demo.replays} replays; ` +
    `mutants single ${statsJson.mutants.step7.single.caught}/${statsJson.mutants.step7.single.total}, ` +
    `relays ${statsJson.mutants.step7.relays.caught}/${statsJson.mutants.step7.relays.total}; PRNG port verified`,
);
