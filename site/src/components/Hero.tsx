// The hero. Letters scramble and lock in, driven by the real PRNG of the demo's
// failing run (the TypeScript port is checked against Fe's own outputs by
// `npm run data`). Then a crack line splits the headline into two halves that
// part and settle. "FISSURE" is real DOM text throughout.

import { type CSSProperties, useEffect, useState } from "react";
import { demo } from "../lib/data";
import { FissurePrng } from "../lib/prng";
import { useReducedMotion } from "../lib/motion";
import { Crack, CRACK_LEFT, CRACK_RIGHT } from "./primitives";

const FINAL = "FISSURE";
// Glyphs that fit a headline cell (no W, M or symbols that overflow); the narrow I gets narrow glyphs.
const ALPHABET = "ABCDEFGHJKLNPQRSTUVXYZ2345679";
const NARROW = "I1!|:;";
const FRAME_MS = 55;
const LOCK_AT = FINAL.split("").map((_, i) => 560 + i * 150); // when each letter locks
const ALL_LOCKED = LOCK_AT[LOCK_AT.length - 1] + 120;
const CRACK_MS = 760;

type Phase = "scramble" | "crack" | "split";

function frame(prng: FissurePrng, elapsed: number): string[] {
  return FINAL.split("").map((c, i) => {
    if (elapsed >= LOCK_AT[i]) return c;
    const set = c === "I" ? NARROW : ALPHABET;
    return set[prng.below(set.length)];
  });
}

function Line({ letters, hidden }: { letters: string[]; hidden?: boolean }) {
  return (
    <span className="hero-line" aria-hidden={hidden || undefined}>
      {FINAL.split("").map((c, i) => (
        <span className="hero-cell" key={i}>
          <span className="hero-ghost">{c}</span>
          <span className="hero-live">{letters[i]}</span>
        </span>
      ))}
    </span>
  );
}

export function Hero() {
  const reduced = useReducedMotion();
  const [letters, setLetters] = useState<string[]>(() => (reduced ? FINAL.split("") : frame(new FissurePrng(BigInt(demo.seed)), 0)));
  const [phase, setPhase] = useState<Phase>(reduced ? "split" : "scramble");

  useEffect(() => {
    if (reduced) {
      setLetters(FINAL.split(""));
      setPhase("split");
      return;
    }
    const prng = new FissurePrng(BigInt(demo.seed));
    const t0 = performance.now();
    setPhase("scramble");
    let timer = 0;
    let crackTimer = 0;
    const tick = () => {
      const elapsed = performance.now() - t0;
      if (elapsed >= ALL_LOCKED) {
        window.clearInterval(timer);
        setLetters(FINAL.split(""));
        setPhase("crack");
        crackTimer = window.setTimeout(() => setPhase("split"), CRACK_MS);
        return;
      }
      setLetters(frame(prng, elapsed));
    };
    timer = window.setInterval(tick, FRAME_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(crackTimer);
    };
  }, [reduced]);

  const style = { "--clip-a": CRACK_LEFT, "--clip-b": CRACK_RIGHT } as CSSProperties;
  return (
    <div className="hero-title" data-phase={phase} style={style}>
      <h1 className="hero-h1" aria-label={FINAL}>
        <span className="half half-a">
          <Line letters={letters} hidden />
        </span>
        <span className="half half-b">
          <Line letters={letters} hidden />
        </span>
        <Crack progress={phase === "scramble" ? 0 : 1} className="hero-crack" />
      </h1>
    </div>
  );
}
