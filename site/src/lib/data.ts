// Typed access to the generated data (site/data/*.json, from `npm run data`).

import demoJson from "../../data/demo.json";
import mutantsJson from "../../data/mutants.json";
import statsJson from "../../data/stats.json";
import tickerJson from "../../data/ticker.json";

export interface Provenance {
  codeCommit: string;
  capturedAtCommit: string;
  fe: string;
  captured: string;
  sources: string[];
}

export interface DemoStep {
  index: number;
  call: string;
  value: string;
  words: string[];
  sender: number;
}

export interface Demo {
  provenance: Provenance & { seed: string; note: string };
  seed: string;
  seedHex: string;
  config: { seed: number; steps: number; gas: number; runs: number };
  invariant: { id: number; text: string };
  bug: string;
  originalLen: number;
  shrunkLen: number;
  replays: number;
  original: DemoStep[];
  shrunk: DemoStep[];
  shrinkTrace: {
    derived: boolean;
    rule: string;
    dropped: number[];
    kept: number[];
    candidateReplayInvariant: number;
    simplified: { index: number; from: string; to: string }[];
  };
  prng: { verified: boolean; next: string[]; derive: string[] };
}

export interface Cell {
  verdict: "caught" | "missed" | "clean";
  invariant: number | null;
  seed: string | null;
  originalLen: number | null;
  shrunkLen: number | null;
  replays: number | null;
  accepted: number | null;
  atDeployment: boolean;
  steps: { call: string; value: string; words: string[]; sender: number }[];
}

export interface Mutant {
  id: number;
  title: string;
  description: string;
  kind: string | null;
  heldOut: boolean;
  control: boolean;
  reason: string | null;
  single: Cell | null;
  relaysTuned: Cell | null;
  relaysGeneric: Cell | null;
}

export interface Mutants {
  provenance: Provenance;
  harnesses: { single: string; relaysTuned: string; relaysGeneric: string };
  invariants: Record<string, string>;
  mutants: Mutant[];
}

export interface Count {
  caught: number;
  total: number;
}

export interface Stats {
  provenance: Provenance;
  pitch: string;
  tests: number;
  demo: { originalLen: number; shrunkLen: number; replays: number };
  mutants: {
    total: number;
    step7: { single: Count; relays: Count };
    heldOut: { single: Count; relaysGeneric: Count; relaysTuned: Count };
  };
  revertRate: { untyped: string; typed: string; calls: number };
}

export const demo = demoJson as unknown as Demo;
export const mutants = mutantsJson as unknown as Mutants;
export const stats = statsJson as unknown as Stats;
export const ticker = (tickerJson as { items: string[] }).items;

export const REPO = "https://github.com/ace-coderr/fissure";
export const shortSha = (sha: string): string => sha.slice(0, 7);
