// Small shared pieces: bracket labels, inline code in data strings, the crack.

import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";

/** [ 03 / SEQ ] */
export function Bracket({ n, children }: { n?: string; children: ReactNode }) {
  return (
    <span className="bracket">
      [ {n ? `${n} / ` : ""}
      {children} ]
    </span>
  );
}

/** Turn `code` spans in a plain string (the README pitch) into <code>. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="code">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** The signature motif. Points are percentages of the box it is drawn in. */
export const CRACK: ReadonlyArray<readonly [number, number]> = [
  [54, 0],
  [50, 16],
  [58, 31],
  [49, 47],
  [57, 63],
  [51, 79],
  [56, 100],
];

/** A jagged line that draws itself: `progress` 0 (hidden) to 1 (whole). It measures
 * its box and draws in real pixels, so the stroke stays uniform at any size. */
export function Crack({ progress, className = "" }: { progress: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ w: 100, h: 100 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const d = CRACK.map(([x, y], i) => `${i === 0 ? "M" : "L"}${((x / 100) * box.w).toFixed(1)} ${((y / 100) * box.h).toFixed(1)}`).join(" ");
  const style = { "--p": progress } as CSSProperties;
  return (
    <svg ref={ref} className={`crack ${className}`} viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true" style={style}>
      <path d={d} pathLength={1} />
    </svg>
  );
}

/** clip-path polygons that cut a box along the crack: the left and right halves. */
export const CRACK_LEFT = `polygon(0 0, ${CRACK.map(([x, y]) => `${x}% ${y}%`).join(", ")}, 0 100%)`;
export const CRACK_RIGHT = `polygon(${CRACK.map(([x, y]) => `${x}% ${y}%`).join(", ")}, 100% 100%, 100% 0)`;

/** Copy text to the clipboard; resolves false where that is not allowed. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
