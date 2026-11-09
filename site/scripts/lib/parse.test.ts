import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { derive, FissurePrng } from "../../src/lib/prng.ts";
import { keccak256Hex } from "./keccak.ts";
import { classifyTest, parseFailures, parseHeldOutTable, parseOriginal, parseResultTable } from "./parse.ts";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const raw = (f: string) => readFileSync(join(site, "data", "raw", f), "utf8");
const json = (f: string) => JSON.parse(readFileSync(join(site, "data", f), "utf8"));

describe("keccak256", () => {
  it("matches known vectors", () => {
    expect(keccak256Hex("")).toBe("c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    expect(keccak256Hex("deposit()").slice(0, 8)).toBe("d0e30db0");
    expect(keccak256Hex("balanceOf(address)").slice(0, 8)).toBe("70a08231");
  });
});

describe("PRNG port", () => {
  const orig = parseOriginal(raw("original.txt"));
  const seed = BigInt(orig.meta.seed);
  it("reproduces the outputs Fe produced", () => {
    const p = new FissurePrng(seed);
    orig.next.forEach((v) => expect(p.next().toString()).toBe(v));
    orig.derive.forEach((v, i) => expect(derive(seed, BigInt(i)).toString()).toBe(v));
  });
  it("is total on zero", () => {
    expect(new FissurePrng(0n).below(0)).toBe(0);
  });
});

describe("decoded output", () => {
  it("the demo is one failure of 4 calls shrunk to 2", () => {
    const f = parseFailures(raw("demo.decoded.txt"));
    expect(f).toHaveLength(1);
    expect([f[0].originalLen, f[0].shrunkLen, f[0].replays]).toEqual([4, 2, 19]);
    expect(f[0].steps.map((s) => s.value)).toEqual(["1", "1"]);
  });
  it("the mutation tables parse and agree with the blocks", () => {
    const text = raw("mutants.decoded.txt");
    expect(parseResultTable(text, "MUTATION RESULTS (single sender)")).toHaveLength(12);
    expect(parseResultTable(text, "MUTATION RESULTS (test account + 2 relay senders)")).toHaveLength(12);
    expect(parseHeldOutTable(text)).toHaveLength(6);
    expect(classifyTest("heldout_mutant_13_relays_tuned")).toEqual({ id: 13, config: "relaysTuned", heldOut: true });
    expect(classifyTest("multi_mutant_9_wrong_spender")?.config).toBe("relaysTuned");
    expect(classifyTest("mutant_9_wrong_spender")?.config).toBe("single");
    expect(classifyTest("something_else")).toBeNull();
  });
  it("rejects a malformed failure block", () => {
    expect(() => parseFailures("t: FISSURE FOUND A FAILURE\n  oops\n")).toThrow();
  });
});

describe("generated data", () => {
  it("every miss has a reason and every caught cell has a seed or was caught at deployment", () => {
    const { mutants } = json("mutants.json");
    for (const m of mutants) {
      for (const n of ["single", "relaysTuned", "relaysGeneric"]) {
        const c = m[n];
        if (!c) continue;
        if (c.verdict === "caught") expect(c.seed !== null || c.atDeployment).toBe(true);
        if (c.verdict === "missed") expect(m.reason).toBeTruthy();
      }
    }
  });
  it("the headline numbers are the ones in the README", () => {
    const s = json("stats.json");
    expect(s.mutants.step7.single).toEqual({ caught: 7, total: 11 });
    expect(s.mutants.step7.relays).toEqual({ caught: 9, total: 11 });
    expect(s.mutants.heldOut.single).toEqual({ caught: 6, total: 6 });
    expect(s.mutants.heldOut.relaysGeneric).toEqual({ caught: 5, total: 6 });
    expect(s.mutants.heldOut.relaysTuned).toEqual({ caught: 5, total: 6 });
    expect(s.demo).toEqual({ originalLen: 4, shrunkLen: 2, replays: 19 });
  });
  it("every data file names its provenance", () => {
    for (const f of ["demo.json", "mutants.json", "stats.json", "ticker.json", "meta.json"]) {
      const p = json(f).provenance;
      expect(p.codeCommit).toMatch(/^[0-9a-f]{40}$/);
      expect(p.fe).toBe("fe 26.5.0 (3dab95f)");
      expect(p.sources.length).toBeGreaterThan(0);
    }
    expect(json("demo.json").provenance.seed).toMatch(/^\d{70,}$/);
  });
});
