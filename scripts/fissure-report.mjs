#!/usr/bin/env node
// Pretty-prints Fissure results from `fe test --show-logs` output.
//
//   fe test --show-logs -f demo_ | node scripts/fissure-report.mjs [out/Contract.abi.json] [--expect-found]
//
// --expect-found exits with status 1 when no failure was found (used by CI).
//
// Reads stdin. Decodes the `Found` / `ShrunkStep` events of passing tests and
// the `Failure` / `InvariantBroken` / `Vacuous` revert data of failing ones.
// With an ABI file, selectors are shown as function signatures. Documentation
// tooling only: the Fissure library itself is written in Fe.

import { readFileSync } from "node:fs";

// ---- Keccak-256 (not SHA3-256: Ethereum uses the original padding) ----
const MASK = (1n << 64n) - 1n;
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROT = [
  [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14],
];
const rotl = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK);

function keccakF(s) {
  for (let round = 0; round < 24; round++) {
    const c = [0, 1, 2, 3, 4].map((x) => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) s[x + 5 * y] ^= d;
    }
    const b = new Array(25).fill(0n);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x][y]);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        s[x + 5 * y] = b[x + 5 * y] ^ (~b[((x + 1) % 5) + 5 * y] & MASK & b[((x + 2) % 5) + 5 * y]);
    s[0] ^= RC[round];
  }
}

export function keccak256(input) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const rate = 136;
  const padded = new Uint8Array(Math.ceil((data.length + 1) / rate) * rate);
  padded.set(data);
  padded[data.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const s = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let j = 7; j >= 0; j--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + j]);
      s[i] ^= lane;
    }
    keccakF(s);
  }
  let hex = "";
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 8; j++) hex += ((s[i] >> BigInt(8 * j)) & 0xffn).toString(16).padStart(2, "0");
  return hex;
}

// ---- decoding helpers ----
const words = (hex) => {
  const out = [];
  for (let i = 0; i + 64 <= hex.length; i += 64) out.push(BigInt("0x" + hex.slice(i, i + 64)));
  return out;
};
const h = (n) => "0x" + n.toString(16);

const EVENTS = {
  [keccak256("Found(uint256,uint256,uint256,uint256,uint256)")]: "Found",
  [keccak256("ShrunkStep(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)")]: "ShrunkStep",
  [keccak256("MutantResult(uint256,bool,uint256,uint256,uint256,uint256,uint256,uint256)")]: "MutantResult",
  [keccak256("MultiMutantResult(uint256,bool,uint256,uint256,uint256,uint256,uint256,uint256)")]: "MultiMutantResult",
  [keccak256("HeldOutResult(uint256,uint256,bool,uint256,uint256,uint256,uint256,uint256,uint256)")]: "HeldOutResult",
};
const ERRORS = {
  [keccak256("Failure(uint256,uint256,uint256,uint256[])").slice(0, 8)]: "Failure",
  [keccak256("Vacuous(uint256)").slice(0, 8)]: "Vacuous",
  [keccak256("EmptyMenu()").slice(0, 8)]: "EmptyMenu",
  [keccak256("InvariantBroken(uint256,uint256,uint256)").slice(0, 8)]: "InvariantBroken",
  [keccak256("Underfunded(uint256,uint256)").slice(0, 8)]: "Underfunded",
  [keccak256("Unreached(uint256)").slice(0, 8)]: "Unreached",
  [keccak256("OutOfBudget(uint256)").slice(0, 8)]: "OutOfBudget",
  "08c379a0": "Error",
};

function loadSignatures(path) {
  const sigs = {};
  if (!path) return sigs;
  const abi = JSON.parse(readFileSync(path, "utf8"));
  for (const f of abi.filter((e) => e.type === "function")) {
    const sig = `${f.name}(${f.inputs.map((i) => i.type).join(",")})`;
    sigs[BigInt("0x" + keccak256(sig).slice(0, 8)).toString()] = sig;
  }
  return sigs;
}

const args = process.argv.slice(2);
const expectFound = args.includes("--expect-found");
const sigs = loadSignatures(args.find((a) => !a.startsWith("--")));
const nameOf = (selector) => sigs[selector.toString()] ?? "selector " + h(selector).padStart(10, "0");

function printSequence(seed, invariant, originalLen, steps, extra = "") {
  console.log(`  seed ${seed}   broken invariant #${invariant}`);
  console.log(`  ${originalLen} calls shrunk to ${steps.length}${extra}`);
  steps.forEach((s, i) => {
    const args = [s.w0, s.w1, s.w2].map((w) => w.toString()).join(", ");
    const value = s.value === 0n ? "" : `  value=${s.value} wei`;
    const label = s.selector === undefined ? `menu entry ${s.variant}` : nameOf(s.selector);
    const by = s.who === undefined || s.who === 0n ? "" : `   [sender: relay ${s.who}]`;
    console.log(`    ${i + 1}. ${label}${value}   words=[${args}]${by}`);
  });
  const relays = steps.reduce((m, s) => (s.who !== undefined && s.who > m ? s.who : m), 0n);
  const cast = relays > 0n ? ` (multi-sender: use a Cast of at least ${relays} relays)` : "";
  console.log(`  reproduce: fuzz with Config { seed: ${seed}, .. } or replay the calls above${cast}`);
}

// ---- parse the fe output ----
const text = readFileSync(0, "utf8").replace(/^﻿/, "");
let test = null;
const found = {};
const mutants = [];
const multi = [];
const heldout = [];
let any = false;
for (const line of text.split(/\r?\n/)) {
  const t = line.match(/^\s*(PASS|FAIL)\s+\[[^\]]+\]\s+(\S+)/);
  if (t) {
    test = t[2];
    continue;
  }
  const log = line.match(/topics: \[(0x[0-9a-f]{64})[^\]]*\], data: 0x([0-9a-f]*)/);
  if (log && test) {
    const name = EVENTS[log[1].slice(2)];
    const w = words(log[2]);
    if (name === "HeldOutResult") {
      heldout.push({ test, id: w[0], mode: w[1], found: w[2] === 1n, seed: w[3], invariant: w[4], originalLen: w[5], shrunkLen: w[6], attempts: w[7], accepted: w[8] });
    } else if (name === "MultiMutantResult") {
      multi.push({ test, id: w[0], found: w[1] === 1n, seed: w[2], invariant: w[3], originalLen: w[4], shrunkLen: w[5], attempts: w[6], accepted: w[7] });
    } else if (name === "MutantResult") {
      mutants.push({ test, id: w[0], found: w[1] === 1n, seed: w[2], invariant: w[3], originalLen: w[4], shrunkLen: w[5], attempts: w[6], accepted: w[7] });
    } else if (name === "Found") {
      found[test] = { seed: w[0], invariant: w[1], originalLen: w[2], shrunkLen: w[3], attempts: w[4], steps: [] };
    } else if (name === "ShrunkStep" && found[test]) {
      found[test].steps.push({ variant: w[1], selector: w[2], value: w[3], w0: w[4], w1: w[5], w2: w[6], who: w[7] });
    }
    continue;
  }
  const rev = line.match(/Test reverted: 0x([0-9a-f]*)/);
  if (rev && test) {
    const sel = rev[1].slice(0, 8);
    const name = ERRORS[sel];
    const body = rev[1].slice(8);
    if (name === "Failure") {
      const w = words(body); // seed, invariant, original_len, offset, len, steps...
      const len = Number(w[4]);
      const steps = [];
      for (let i = 0; i < len / 6; i++) {
        const [variant, value, w0, w1, w2, who] = w.slice(5 + i * 6, 11 + i * 6);
        steps.push({ variant, value, w0, w1, w2, who });
      }
      any = true;
      console.log(`\n${test}: FISSURE FOUND A FAILURE`);
      printSequence(w[0], w[1], w[2], steps);
    } else if (name === "Vacuous") {
      any = true;
      console.log(`\n${test}: VACUOUS - no call was accepted (${words(body)[0]} made); nothing was tested`);
    } else if (name === "InvariantBroken") {
      const w = words(body);
      any = true;
      console.log(`\n${test}: invariant #${w[2]} broke at call ${w[1]} (seed ${w[0]})`);
    } else if (name === "Underfunded") {
      const w = words(body);
      any = true;
      console.log(`
${test}: UNDERFUNDED - the sender holds ${w[0]} wei but needs ${w[1]}; raise the test's balance`);
    } else if (name === "OutOfBudget") {
      any = true;
      console.log(`
${test}: OUT OF BUDGET - only ${words(body)[0]} gas left; use fewer steps or runs (unoptimised builds spend more)`);
    } else if (name === "Unreached") {
      any = true;
      console.log(`
${test}: UNREACHED - menu entry ${words(body)[0]} was never accepted by the contract; the invariants say nothing about it`);
    } else if (name === "EmptyMenu") {
      any = true;
      console.log(`\n${test}: EMPTY MENU - no calls to make`);
    }
  }
}
for (const [name, f] of Object.entries(found)) {
  any = true;
  console.log(`\n${name}: FISSURE FOUND A FAILURE`);
  printSequence(f.seed, f.invariant, f.originalLen, f.steps, ` in ${f.attempts} replays`);
}
function printTable(title, rows) {
  any = true;
  console.log("");
  console.log(title);
  console.log("  mutant  verdict  invariant  calls->shrunk  replays  accepted calls");
  for (const m of rows.sort((a, b) => Number(a.id - b.id))) {
    const lens = m.found ? `${m.originalLen}->${m.shrunkLen}` : "-";
    const verdict = m.found ? "CAUGHT" : m.id === 0n ? "clean" : "missed";
    console.log(`  ${String(m.id).padStart(6)}  ${verdict.padEnd(7)}  ${String(m.found ? m.invariant : "-").padStart(9)}  ${lens.padEnd(13)}  ${String(m.found ? m.attempts : "-").padStart(7)}  ${m.accepted}`);
  }
}
if (mutants.length > 0) printTable("MUTATION RESULTS (single sender)", mutants);
if (multi.length > 0) printTable("MUTATION RESULTS (test account + 2 relay senders)", multi);
if (heldout.length > 0) {
  any = true;
  const names = { 1: "one sender, generic generators", 2: "2 relays, generic generators", 3: "2 relays, tuned generators" };
  console.log("");
  console.log("HELD-OUT MUTANTS (written after the generators were frozen)");
  console.log("  mutant  " + [1, 2, 3].map((m) => names[m].padEnd(34)).join("  "));
  const ids = [...new Set(heldout.map((r) => r.id))].sort((a, b) => Number(a - b));
  for (const id of ids) {
    const cell = (mode) => {
      const r = heldout.find((x) => x.id === id && x.mode === BigInt(mode));
      if (!r) return "-".padEnd(34);
      return (r.found ? `CAUGHT #${r.invariant} ${r.originalLen}->${r.shrunkLen}` : "missed").padEnd(34);
    };
    console.log(`  ${String(id).padStart(6)}  ${cell(1)}  ${cell(2)}  ${cell(3)}`);
  }
}
if (!any) {
  console.log("No Fissure failures in this output.");
  if (expectFound) process.exit(1);
}
