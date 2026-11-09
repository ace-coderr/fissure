// @vitest-environment jsdom
// prefers-reduced-motion must give the final state with no animation, and the
// normal path must start from the animated state.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DotNumber } from "../components/DotNumber";
import { Hero } from "../components/Hero";
import { demo } from "../lib/data";
import Replay from "../views/Replay";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setReduced(reduce: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reduce && /prefers-reduced-motion/.test(q),
    media: q,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(node: React.ReactNode): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

describe("reduced motion shows the final state", () => {
  it("the hero is split and reads FISSURE", () => {
    setReduced(true);
    const el = mount(<Hero />);
    expect(el.querySelector(".hero-title")?.getAttribute("data-phase")).toBe("split");
    const letters = [...el.querySelectorAll(".half-a .hero-live")].map((n) => n.textContent).join("");
    expect(letters).toBe("FISSURE");
    expect(el.querySelector("h1")?.getAttribute("aria-label")).toBe("FISSURE");
  });

  it("dot-matrix numbers are at their value with no transition", () => {
    setReduced(true);
    const el = mount(<DotNumber value="114" label="114 tests" />);
    const strips = [...el.querySelectorAll<HTMLElement>(".strip")];
    expect(strips).toHaveLength(3);
    expect(strips.map((s) => s.style.transform)).toEqual([
      "translateY(calc(var(--cell) * -7))",
      "translateY(calc(var(--cell) * -7))",
      "translateY(calc(var(--cell) * -28))",
    ]);
    expect(strips.every((s) => s.style.transitionDuration === "0ms")).toBe(true);
    expect(el.querySelector("[role=img]")?.getAttribute("aria-label")).toBe("114 tests");
  });

  it("the replay shows the minimal sequence, the real counts, and no animation state", () => {
    setReduced(true);
    const el = mount(
      <MemoryRouter>
        <Replay />
      </MemoryRouter>,
    );
    const rows = [...el.querySelectorAll(".row")];
    expect(rows).toHaveLength(demo.originalLen);
    expect(rows.filter((r) => r.classList.contains("gone"))).toHaveLength(demo.originalLen - demo.shrunkLen);
    const kept = rows.filter((r) => !r.classList.contains("gone")).map((r) => r.textContent?.replace(/\s+/g, ""));
    expect(kept).toEqual(demo.shrunk.map((s) => `${s.index}. ${s.call}  value=${s.value} wei`.replace(/\s+/g, "")));
    const labels = [...el.querySelectorAll(".counter [role=img]")].map((n) => n.getAttribute("aria-label"));
    expect(labels).toEqual([`calls: ${demo.shrunkLen}`, `replays: ${demo.replays}`]);
    expect(el.querySelector(".replay-body")?.classList.contains("open")).toBe(false);
    expect(el.textContent).toContain(`${demo.originalLen} calls shrunk to ${demo.shrunkLen} in ${demo.replays} replays`);
  });
});

describe("with motion the animated start state is shown", () => {
  it("the hero starts scrambled and locked to the real seed's PRNG", () => {
    setReduced(false);
    const el = mount(<Hero />);
    expect(el.querySelector(".hero-title")?.getAttribute("data-phase")).toBe("scramble");
    const first = [...el.querySelectorAll(".half-a .hero-live")].map((n) => n.textContent).join("");
    // deterministic: the same seed gives the same first frame on every load
    act(() => root!.unmount());
    host!.remove();
    const again = mount(<Hero />);
    const second = [...again.querySelectorAll(".half-a .hero-live")].map((n) => n.textContent).join("");
    expect(second).toBe(first);
    expect(first).not.toBe("FISSURE");
  });
});
