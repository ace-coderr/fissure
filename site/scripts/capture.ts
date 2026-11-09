// Capture the raw, decoded output the site is built from.
//
//   npm run capture            (needs `fe` 26.5.0 on PATH, and Node)
//   FE="C:\path\to\fe-wrapper.cmd" npm run capture     (e.g. a WSL wrapper on Windows)
//
// It runs the repository's own commands and stores their decoded text in
// site/data/raw/. Nothing is invented: `npm run data` then turns these files
// into site/data/*.json. The Fe sources are never modified. The one thing the
// library does not emit, the failing sequence BEFORE shrinking and the first
// PRNG outputs, is obtained by running a throwaway test in a COPY of the
// repository in the OS temp directory (the repository itself is untouched).

import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const raw = resolve(here, "..", "data", "raw");
const FE = process.env.FE ?? "fe";
const QUOTED_FE = FE.includes(" ") && !FE.startsWith('"') ? `"${FE}"` : FE;

function run(cmd: string, cwd: string, input?: string): string {
  const r = spawnSync(cmd, { cwd, shell: true, input, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  return out.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

function git(args: string): string {
  return run(`git ${args}`, root).trim();
}

function decode(abi: string, feOutput: string): string {
  const r = spawnSync(`"${process.execPath}" scripts/fissure-report.mjs ${abi}`, {
    cwd: root,
    shell: true,
    input: feOutput,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return (r.stdout ?? "").replace(/\r\n/g, "\n");
}

mkdirSync(raw, { recursive: true });

// ---- provenance ----
const feVersion = run(`${QUOTED_FE} --version`, root).trim();
if (!feVersion.startsWith("fe 26.5.0")) {
  throw new Error(`expected fe 26.5.0, got: ${feVersion}`);
}
const dirty = git("status --porcelain -- src scripts fe.toml .github package.json");
if (dirty) {
  throw new Error("the library or scripts have uncommitted changes; commit first so the data names a real commit:\n" + dirty);
}
const submission = readFileSync(join(root, "SUBMISSION.md"), "utf8");
const codeCommit = /commit `([0-9a-f]{40})`; later commits change only/.exec(submission)?.[1] ?? "";
writeFileSync(
  join(raw, "meta.txt"),
  [
    `head_commit=${git("rev-parse HEAD")}`,
    `code_commit=${codeCommit}`,
    `fe_version=${feVersion}`,
    `captured_utc=${new Date().toISOString().slice(0, 10)}`,
    "",
  ].join("\n"),
);

// ---- the whole test suite ----
console.log("capture: fe test (whole suite)");
const all = run(`${QUOTED_FE} test`, root);
const summary = /test result: .*$/m.exec(all)?.[0] ?? "";
const passLines = (all.match(/^PASS /gm) ?? []).length;
const failLines = (all.match(/^FAIL /gm) ?? []).length;
writeFileSync(join(raw, "tests.txt"), `${summary}\nPASS lines: ${passLines}\nFAIL lines: ${failLines}\n`);
if (failLines > 0) throw new Error("the test suite has failures; the site must not be built from it");

// ---- the demo and the mutation results, decoded by the repository's own script ----
console.log("capture: fe build");
run(`${QUOTED_FE} build`, root);
copyFileSync(join(root, "out", "VaultBug.abi.json"), join(raw, "VaultBug.abi.json"));
console.log("capture: demo");
writeFileSync(join(raw, "demo.decoded.txt"), decode("out/VaultBug.abi.json", run(`${QUOTED_FE} test --show-logs -f demo_vault_bug_is_found`, root)));
console.log("capture: mutants (single, relays, held-out)");
writeFileSync(join(raw, "mutants.decoded.txt"), decode("out/CoolCoin.abi.json", run(`${QUOTED_FE} test --show-logs -f mutant_`, root)));

// ---- original sequence and PRNG outputs, from a COPY of the repository ----
console.log("capture: original sequence and PRNG outputs (scratch copy)");
const scratch = mkdtempSync(join(tmpdir(), "fissure-capture-"));
try {
  cpSync(join(root, "src"), join(scratch, "src"), { recursive: true });
  cpSync(join(root, "fe.toml"), join(scratch, "fe.toml"));
  writeFileSync(join(scratch, "src", "zz_site_capture_tests.fe"), SCRATCH_TEST());
  const out = run(`${QUOTED_FE} test --show-logs -f zz_site_capture`, scratch);
  if (!/test result: ok/.test(out)) throw new Error("scratch capture test failed:\n" + out.slice(0, 2000));
  const records: string[] = [];
  for (const m of out.matchAll(/data: 0x([0-9a-f]+)/g)) {
    const words = m[1].match(/.{64}/g) ?? [];
    // our events start with the marker word 0x...f155c0de; vault events do not
    if (words.length >= 3 && BigInt("0x" + words[0]) === 0xf155c0den) {
      records.push(words.map((w) => BigInt("0x" + w).toString()).join(" "));
    }
  }
  if (records.length === 0) throw new Error("no capture events found");
  writeFileSync(join(raw, "original.txt"), records.join("\n") + "\n");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log("capture: done ->", existsSync(raw) ? raw : "?");

// The throwaway test. It reuses the repository's own harness (BugVault) and
// library, replays the failing run of the demo, and emits what the library
// does not: the original steps and the first PRNG outputs of the demo seed.
function SCRATCH_TEST(): string {
  return `use ingot::demo_tests::BugVault
use core::ptr::MemVec
use ingot::hunt::hunt
use ingot::menu::{Menu, Step}
use ingot::prng::{Draw, Prng}
use ingot::runner::{Config, Harness, fuzz, replay}

fn selector_of<H: Harness>(_ variant: u256) -> u256 {
    H::Calls::selector_at(variant)
}

#[event]
struct Meta { marker: u256, tag: u256, seed: u256, original_len: u256, shrunk_len: u256 }

#[event]
struct Orig { marker: u256, tag: u256, index: u256, variant: u256, selector: u256, value: u256, w0: u256, w1: u256, w2: u256, who: u256 }

#[event]
struct Out { marker: u256, tag: u256, kind: u256, index: u256, value: u256 }

#[test(balance = 1_000_000_000_000_000_000_000_000_000_000)]
fn zz_site_capture() uses (evm: mut Evm) {
    let cfg = Config { seed: 2026, steps: 80, gas: 300000 }
    let h = hunt<BugVault>(cfg, 50)
    assert!(h.found)
    evm.emit(Meta { marker: 0xf155c0de, tag: 10, seed: h.seed, original_len: h.original_len, shrunk_len: h.shrunk.steps.len() as u256 })
    let run = fuzz<BugVault>(Config { seed: h.seed, steps: 80, gas: 300000 }, 9)
    assert!(run.broken == h.shrunk.invariant)
    assert!(run.steps.len() as u256 == h.original_len)
    var i: usize = 0
    while i < run.steps.len() {
        let s = run.steps[i]
        evm.emit(Orig {
            marker: 0xf155c0de,
            tag: 11,
            index: i as u256,
            variant: s.variant,
            selector: selector_of<BugVault>(s.variant),
            value: s.value,
            w0: s.w0,
            w1: s.w1,
            w2: s.w2,
            who: s.who,
        })
        i = i + 1
    }
    // The shrinker's first candidate drops the first chunk of two calls
    // (src/shrink.fe, pass 1). Replay exactly that candidate: it must still fail.
    assert!(run.steps.len() == 4)
    var cand = MemVec<Step>::new()
    cand.push(run.steps[2])
    cand.push(run.steps[3])
    evm.emit(Out { marker: 0xf155c0de, tag: 13, kind: 3, index: 0, value: replay<BugVault>(cand, 300000, 5_000_000) })
    evm.emit(Out { marker: 0xf155c0de, tag: 14, kind: 4, index: 0, value: evm.address().word() })
    var p = Prng::seeded(h.seed)
    var k: u256 = 0
    while k < 16 {
        evm.emit(Out { marker: 0xf155c0de, tag: 12, kind: 1, index: k, value: p.next() })
        k = k + 1
    }
    k = 0
    while k < 8 {
        evm.emit(Out { marker: 0xf155c0de, tag: 12, kind: 2, index: k, value: Prng::derive(h.seed, k) })
        k = k + 1
    }
}
`;
}
