// Motion pieces built on the shared easing and durations: masked heading rise,
// the ticker, and the pointer field. Text is always real DOM text.

import { type CSSProperties, type ElementType, useEffect, useRef } from "react";
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

/** A ticker of real phrases from the output. Static (and wrapped) under reduced motion. */
export function Ticker({ items, label }: { items: string[]; label: string }) {
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
    <section className="ticker on-dark" aria-label={label}>
      <div className="ticker-track" style={{ "--n": items.length } as CSSProperties}>
        {run(false)}
        {run(true)}
      </div>
    </section>
  );
}

/**
 * Text near the cursor shifts slightly away from it. Elements opt in with the
 * `data-shift` attribute. Uses the CSS `translate` property (so it never fights
 * a `transform` animation), is off for touch and for reduced motion, and only
 * does work while the pointer is moving.
 */
export function PointerField() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const active = fine && !reduced;
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
      const next = new Set<HTMLElement>();
      document.querySelectorAll<HTMLElement>("[data-shift]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -R || r.top > window.innerHeight + R) return;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = cx - s.x;
        const dy = cy - s.y;
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
