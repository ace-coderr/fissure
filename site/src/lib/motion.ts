// The site's one motion language: a single easing curve and four durations.
// CSS uses the same values through the custom properties in styles/tokens.css.

import { type RefObject, useEffect, useState, useSyncExternalStore } from "react";

export const EASE = "cubic-bezier(0.22, 0.8, 0.12, 1)";
export const DUR = { fast: 160, base: 320, slow: 640, slower: 1100 } as const;

// ---- the same curve for JS-driven animation ----
const [X1, Y1, X2, Y2] = [0.22, 0.8, 0.12, 1];
const cx = 3 * X1;
const bx = 3 * (X2 - X1) - cx;
const ax = 1 - cx - bx;
const cy = 3 * Y1;
const by = 3 * (Y2 - Y1) - cy;
const ay = 1 - cy - by;
const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

/** The easing curve as a function: progress 0..1 in, eased progress out. */
export function ease(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = sampleX(t) - x;
    if (Math.abs(err) < 1e-5) break;
    const d = slopeX(t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  return sampleY(Math.min(1, Math.max(0, t)));
}

// ---- media queries ----
function useMedia(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** True when the visitor asked for reduced motion: show final states, animate nothing. */
export const useReducedMotion = (): boolean => useMedia("(prefers-reduced-motion: reduce)", false);

/** True for a mouse or trackpad (not touch). */
export const useFinePointer = (): boolean => useMedia("(hover: hover) and (pointer: fine)", false);

/** Becomes true once the element has entered the viewport (and stays true). */
export function useInView(ref: RefObject<Element | null>, rootMargin = "0px 0px -12% 0px"): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, seen]);
  return seen;
}

/** Resolve after `ms`, or reject-free no-op when cancelled. */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
