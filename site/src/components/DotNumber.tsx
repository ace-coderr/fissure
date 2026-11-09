// Dot-matrix numbers that roll up like odometers when scrolled into view.
// The visible dots are decoration (aria-hidden); the number is the aria-label.

import { type CSSProperties, useRef } from "react";
import { useInView, useReducedMotion } from "../lib/motion";

// 5 x 7 dot patterns.
const G: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ">": ["00000", "01000", "00100", "11111", "00100", "01000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

// One <path> per glyph (all its dots as sub-paths) instead of one <circle> per dot:
// about a third of the DOM nodes, and the same picture.
const R = 0.4;
const glyphPath = (ch: string): string => {
  const rows = G[ch] ?? G[" "];
  let d = "";
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === "1") d += `M${(x + 0.5 - R).toFixed(2)} ${y + 0.5}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0`;
    }),
  );
  return d;
};
const PATHS: Record<string, string> = Object.fromEntries(Object.keys(G).map((ch) => [ch, glyphPath(ch)]));

function Glyph({ ch }: { ch: string }) {
  return (
    <svg className="glyph" viewBox="0 0 5 7" aria-hidden="true">
      <path d={PATHS[ch] ?? PATHS[" "]} />
    </svg>
  );
}

function Wheel({ digit, delay, instant }: { digit: number; delay: number; instant: boolean }) {
  const style = {
    transform: `translateY(calc(var(--cell) * ${-7 * digit}))`,
    transitionDelay: instant ? "0ms" : `${delay}ms`,
    transitionDuration: instant ? "0ms" : undefined,
  } as CSSProperties;
  return (
    <span className="wheel" aria-hidden="true">
      <span className="strip" style={style}>
        {"0123456789".split("").map((d) => (
          <Glyph key={d} ch={d} />
        ))}
      </span>
    </span>
  );
}

interface Props {
  /** Text to show, for example "114", "9/11" or "67.2%". */
  value: string;
  /** What a screen reader says for the whole number. */
  label: string;
  /** Size of one dot: px, or any CSS length such as a clamp(). */
  cell?: number | string;
  /** Start rolling immediately instead of when scrolled into view. */
  immediate?: boolean;
  className?: string;
}

export function DotNumber({ value, label, cell = 9, immediate = false, className = "" }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const seen = useInView(ref, "0px 0px -8% 0px");
  const live = immediate || seen || reduced;
  let n = 0;
  return (
    <span ref={ref} role="img" aria-label={label} className={`dotnum ${className}`} style={{ "--cell": typeof cell === "number" ? `${cell}px` : cell } as CSSProperties}>
      {[...value].map((ch, i) =>
        ch >= "0" && ch <= "9" ? (
          <Wheel key={i} digit={live ? Number(ch) : 0} delay={150 + n++ * 110} instant={reduced} />
        ) : (
          <span key={i} className={`wheel fixed ${live ? "on" : ""}`} aria-hidden="true">
            <Glyph ch={ch} />
          </span>
        ),
      )}
    </span>
  );
}
