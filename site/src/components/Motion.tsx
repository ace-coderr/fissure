// Motion pieces built on the shared easing and durations: masked heading rise,
// the ticker, and the pointer field. Text is always real DOM text.

import { type CSSProperties, type ElementType, useEffect, useRef, useState } from "react";
import { useFinePointer, useInView, useReducedMotion } from "../lib/motion";

/** A heading whose words rise out of a mask on scroll, letter by letter. */
export function RiseHeading({
  text,
  as: Tag = "h2",
  className = "head head-2",
}: {
  text: string;
  as?: ElementType;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const seen = useInView(ref);
  const words = text.split(" ");
  let i = 0;
  return (
    <Tag ref={ref} aria-label={text} className={`rise ${className} ${seen || reduced ? "in" : ""}`}>
      {words.map((w, wi) => (
        <span key={wi} aria-hidden="true">
          <span className="rise-word" data-shift="">
            {[...w].map((ch, ci) => (
              <span key={ci} className="rise-ch" style={{ "--i": i++ } as CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
          {wi < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}

/**
 * A ticker of real phrases from the output. Static (and wrapped) under reduced
 * motion. Moving text that lasts longer than five seconds needs a way to stop it
 * (WCAG 2.2.2), so there is a pause button; hovering or focusing it also pauses.
 */
export function Ticker({ items, label }: { items: string[]; label: string }) {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const run = (hidden: boolean) => (
    <ul className="ticker-run" aria-hidden={hidden || undefined}>
      {items.map((t, k) => (
        <li key={k}>
          <span className="tick-sep" aria-hidden="true">
            /
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
  return (
    <section className={`ticker on-dark ${paused ? "paused" : ""}`} aria-label={label}>
      <div className="ticker-track" style={{ "--n": items.length } as CSSProperties}>
        {run(false)}
        {run(true)}
      </div>
      {reduced ? null : (
        <button className="ticker-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          <span className="sr-only">Ticker: </span>
          {paused ? "play" : "pause"}
        </button>
      )}
    </section>
  );
}

/** Whether the machine looks too weak for the pointer effect (it is cosmetic). */
function lowEnd(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2;
}

/**
 * Text near the cursor shifts slightly away from it. Elements opt in with the
 * `data-shift` attribute. Uses the CSS `translate` property (so it never fights
 * a `transform` animation), is off for touch, for reduced motion and for weak
 * machines, and only does work while the pointer is moving. Each frame reads
 * every rectangle first and writes afterwards, so it causes one layout, not one
 * per element.
 */
export function PointerField() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const active = fine && !reduced && !lowEnd();
  const state = useRef({ x: -9999, y: -9999, raf: 0, last: 0, shifted: new Set<HTMLElement>() });

  useEffect(() => {
    if (!active) return;
    const s = state.current;
    const R = 200;
    const MAX = 5;

    const frame = (t: number) => {
      s.raf = 0;
      if (t - s.last < 32) {
        s.raf = requestAnimationFrame(frame);
        return;
      }
      s.last = t;
      // read phase
      const els = Array.from(document.querySelectorAll<HTMLElement>("[data-shift]"));
      const rects = els.map((el) => el.getBoundingClientRect());
      // write phase
      const next = new Set<HTMLElement>();
      els.forEach((el, i) => {
        const r = rects[i];
        if (r.bottom < -R || r.top > window.innerHeight + R) return;
        const dx = r.left + r.width / 2 - s.x;
        const dy = r.top + r.height / 2 - s.y;
        const d = Math.hypot(dx, dy);
        if (d < R && d > 0.5) {
          const f = (1 - d / R) ** 2;
          el.style.translate = `${((dx / d) * MAX * f).toFixed(2)}px ${((dy / d) * MAX * f).toFixed(2)}px`;
          next.add(el);
        }
      });
      s.shifted.forEach((el) => {
        if (!next.has(el)) el.style.translate = "";
      });
      s.shifted = next;
    };

    const move = (e: PointerEvent) => {
      s.x = e.clientX;
      s.y = e.clientY;
      if (!s.raf) s.raf = requestAnimationFrame(frame);
    };
    const leave = () => {
      s.x = s.y = -9999;
      if (!s.raf) s.raf = requestAnimationFrame(frame);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
      s.shifted.forEach((el) => (el.style.translate = ""));
      s.shifted.clear();
    };
  }, [active]);

  return null;
}
