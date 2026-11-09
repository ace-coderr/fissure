// The site must say what the README and docs say. These tests fail if a number
// on the site (generated from the raw captures) drifts from the repository's own
// prose, or if the data is older than the code it claims to describe.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repo = resolve(site, "..");
const read = (p: string) => readFileSync(join(repo, p), "utf8").replace(/\r\n/g, "\n");
const data = (f: string) => JSON.parse(readFileSync(join(site, "data", f), "utf8"));

const stats = data("stats.json");
const demo = data("demo.json");
const readme = read("README.md");
const mutationMd = read("docs/mutation.md");
const submission = read("SUBMISSION.md");

describe("the site agrees with the README and docs", () => {
  it("test count", () => {
    expect(readme).toContain(`${stats.tests} Fe tests`);
  });
  it("the demo: 4 calls shrunk to 2 in 19 replays", () => {
    expect(readme).toContain(`${demo.originalLen} calls shrunk to ${demo.shrunkLen} in ${demo.replays} replays`);
  });
  it("the ERC-20 mutants (steps 7 and 8)", () => {
    const m = stats.mutants.step7;
    expect(readme).toContain(`${m.single.caught} caught and shrunk`);
    expect(readme).toContain(`${m.relays.caught} of ${m.relays.total} with`);
    expect(mutationMd).toContain(`**${m.single.caught} of ${m.single.total} mutants caught`);
    expect(mutationMd).toContain(`**${m.relays.caught} of ${m.relays.total}**`);
  });
  it("the held-out mutants (step 9)", () => {
    const h = stats.mutants.heldOut;
    expect(readme).toContain(`caught ${h.single.caught} with one sender and ${h.relaysTuned.caught} with relays`);
    expect(mutationMd).toContain(`**${h.single.caught} of ${h.single.total}**`);
    expect(mutationMd).toContain(`**${h.relaysTuned.caught} of ${h.relaysTuned.total}**`);
    expect(h.relaysGeneric.caught).toBe(h.relaysTuned.caught);
  });
  it("the revert rates", () => {
    expect(readme).toContain(`${stats.revertRate.untyped}%`);
    expect(readme).toContain(`${stats.revertRate.typed}%`);
  });
  it("17 mutants plus a control", () => {
    expect(stats.mutants.total).toBe(17);
    const ids = data("mutants.json").mutants.map((m: { id: number }) => m.id);
    expect(ids).toEqual(Array.from({ length: 18 }, (_, i) => i));
  });
});

describe("the data is not stale", () => {
  it("was captured from the code commit SUBMISSION.md names", () => {
    const named = /commit `([0-9a-f]{40})`; later commits change only/.exec(submission)?.[1];
    expect(named).toBeTruthy();
    // If this fails, the library changed after the data was captured: run
    // `npm run capture` then `npm run data`.
    expect(stats.provenance.codeCommit).toBe(named);
    expect(demo.provenance.codeCommit).toBe(named);
  });
  it("uses the pinned Fe version", () => {
    expect(stats.provenance.fe).toBe("fe 26.5.0 (3dab95f)");
    expect(readme).toContain("fe 26.5.0 (3dab95f)");
  });
  it("the README pitch on the site is the README's", () => {
    expect(readme).toContain(`**Pitch:** ${stats.pitch}`);
  });
});

describe("nothing on the site claims what the repo does not", () => {
  const src = [
    "src/views/Overview.tsx",
    "src/views/Replay.tsx",
    "src/views/Mutants.tsx",
    "src/components/Layout.tsx",
  ].map((f) => readFileSync(join(site, f), "utf8"));
  const all = src.join("\n");
  it("hard-coded numbers are only ones that come from the data", () => {
    // Digits written into the JSX prose (outside data expressions) would drift silently.
    // Only JSX text nodes (between a > and a <), with {expressions} removed.
    const nodes = [...all.matchAll(/>([^<>{}]*\d[^<>{}]*)</g)].map((m) => m[1]);
    const stray = nodes.filter((t) => !t.includes(";")).flatMap((t) => [...t.replace(/ERC-20/g, "ERC").matchAll(/\b(\d{2,})\b/g)].map((m) => m[1]));
    expect(stray).toEqual([]);
  });
  it("mentions the honest limits", () => {
    expect(all).toMatch(/author-made/);
    expect(all).toMatch(/derived/i);
    expect(all).toMatch(/locally minimal/);
  });
});
