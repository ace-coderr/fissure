// The signature view: the real failing sequence of the demo test, shrunk on screen.
// Everything shown (seed, calls, values, lengths, replay count) is from site/data.
// Which calls were dropped is derived from the shrinker's fixed order and verified
// by replaying that candidate (see demo.shrinkTrace); the library logs no attempts.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DotNumber } from "../components/DotNumber";
import { RiseHeading } from "../components/Motion";
import { useTitle } from "../lib/title";
import { Bracket, copyText } from "../components/primitives";
import { demo, REPO, stats } from "../lib/data";
import { callLine, shortDecimal } from "../lib/format";
import { FissurePrng } from "../lib/prng";
import { sleep, useInView, useReducedMotion } from "../lib/motion";

interface Row {
  id: number; // original index (0-based)
  label: string; // "1." ...
  full: string; // the call text
  typed: number; // characters shown
  struck: boolean;
  gone: boolean;
  kept: boolean;
}

interface Stage {
  head: number;
  seed: number;
  rows: Row[];
  open: boolean; // the crack is open: the failure has been found
  calls: string;
  replays: string;
  result: number;
  repro: number;
}

const HEAD = "demo_vault_bug_is_found_and_shrunk: FISSURE FOUND A FAILURE";
const SEED_LINE = `  seed ${shortDecimal(demo.seed)}   broken invariant #${demo.invariant.id}`;
const RESULT = `  ${demo.originalLen} calls shrunk to ${demo.shrunkLen} in ${demo.replays} replays`;
const REPRO = `  reproduce: fuzz with Config { seed: ${shortDecimal(demo.seed)}, .. }\n  or replay the calls above`;

const originalText = (i: number, valueOverride?: string): string => {
  const s = demo.original[i];
  return callLine(s.call, s.words, valueOverride ?? s.value);
};

function initialRows(): Row[] {
  const keptSet = new Set(demo.shrinkTrace.kept);
  return demo.original.map((_, i) => ({
    id: i,
    label: `${i + 1}.`,
    full: originalText(i),
    typed: 0,
    struck: false,
    gone: false,
    kept: keptSet.has(i),
  }));
}

function finalStage(): Stage {
  const rows = initialRows().map((r) => {
    const keptPos = demo.shrinkTrace.kept.indexOf(r.id);
    const final = keptPos >= 0 ? demo.shrunk[keptPos] : null;
    return {
      ...r,
      label: final ? `${final.index}.` : r.label,
      full: final ? callLine(final.call, final.words, final.value) : r.full,
      typed: 9999,
      struck: !final,
      gone: !final,
    };
  });
  return { head: HEAD.length, seed: SEED_LINE.length, rows, open: false, calls: String(demo.shrunkLen), replays: String(demo.replays), result: RESULT.length, repro: REPRO.length };
}

function emptyStage(): Stage {
  return { head: 0, seed: 0, rows: initialRows(), open: false, calls: String(demo.originalLen), replays: "00", result: 0, repro: 0 };
}

const clip = (text: string, n: number) => (
  <>
    <span>{text.slice(0, n)}</span>
    <span className="ghost">{text.slice(n)}</span>
  </>
);

export default function Replay() {
  useTitle("Replay: a failure, shrunk · Fissure");
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, "0px 0px -20% 0px");
  const [stage, setStage] = useState<Stage>(() => (reduced ? finalStage() : emptyStage()));
  const [playing, setPlaying] = useState(false);
  const run = useRef(0);
  const started = useRef(false);

  const set = useCallback((f: (s: Stage) => Stage) => setStage((s) => f(s)), []);

  const play = useCallback(async () => {
    const id = ++run.current;
    const live = () => run.current === id;
    if (reduced) {
      setStage(finalStage());
      setPlaying(false);
      return;
    }
    setPlaying(true);
    setStage(emptyStage());
    await sleep(250);

    // type a string into a Stage counter, char by char
    const type = async (key: "head" | "seed" | "result" | "repro", total: number, ms: number) => {
      for (let n = 1; n <= total && live(); n++) {
        set((s) => ({ ...s, [key]: n }));
        await sleep(ms);
      }
    };
    const typeRow = async (i: number, ms: number) => {
      const len = originalText(i).length;
      for (let n = 1; n <= len && live(); n++) {
        set((s) => ({ ...s, rows: s.rows.map((r) => (r.id === i ? { ...r, typed: n } : r)) }));
        await sleep(ms);
      }
    };

    await type("head", HEAD.length, 6);
    if (!live()) return;
    await type("seed", SEED_LINE.length, 4);
    for (let i = 0; i < demo.original.length && live(); i++) {
      await sleep(180);
      await typeRow(i, 9);
    }
    if (!live()) return;
    await sleep(500);

    // the failure is found: the crack opens
    set((s) => ({ ...s, open: true }));
    await sleep(900);

    // drop calls one at a time: strike, then collapse
    let remaining = demo.originalLen;
    for (const i of demo.shrinkTrace.dropped) {
      if (!live()) return;
      set((s) => ({ ...s, rows: s.rows.map((r) => (r.id === i ? { ...r, struck: true } : r)) }));
      await sleep(620);
      remaining -= 1; // outside the updater: React may run updaters twice
      const calls = String(remaining);
      set((s) => ({ ...s, rows: s.rows.map((r) => (r.id === i ? { ...r, gone: true } : r)), calls }));
      await sleep(760);
    }
    if (!live()) return;

    // simplify the value of the call(s) the shrinker lowered: scramble, then settle
    const prng = new FissurePrng(BigInt(demo.seed));
    for (const sim of demo.shrinkTrace.simplified) {
      for (let f = 0; f < 11 && live(); f++) {
        const digits = Math.max(sim.to.length, Math.round(sim.from.length * (1 - f / 11)));
        const noise = Array.from({ length: digits }, () => String(prng.below(10))).join("");
        set((s) => ({ ...s, rows: s.rows.map((r) => (r.id === sim.index ? { ...r, full: originalText(sim.index, noise) } : r)) }));
        await sleep(55);
      }
      const keptPos = demo.shrinkTrace.kept.indexOf(sim.index);
      const fin = demo.shrunk[keptPos];
      set((s) => ({ ...s, rows: s.rows.map((r) => (r.id === sim.index ? { ...r, full: callLine(fin.call, fin.words, fin.value) } : r)) }));
      await sleep(420);
    }
    if (!live()) return;

    // the crack closes; the minimal sequence stays and is renumbered
    set((s) => ({ ...s, open: false }));
    await sleep(700);
    set((s) => ({
      ...s,
      rows: s.rows.map((r) => {
        const pos = demo.shrinkTrace.kept.indexOf(r.id);
        return pos >= 0 ? { ...r, label: `${demo.shrunk[pos].index}.` } : r;
      }),
      replays: String(demo.replays),
    }));
    await sleep(500);
    await type("result", RESULT.length, 8);
    await type("repro", REPRO.length, 4);
    if (live()) setPlaying(false);
  }, [reduced, set]);

  // start once when the stage scrolls into view
  useEffect(() => {
    if (inView && !started.current) {
      started.current = true;
      void play();
    }
  }, [inView, play]);
  useEffect(() => () => void (run.current = -1), []);
  useEffect(() => {
    if (reduced) setStage(finalStage());
  }, [reduced]);

  const skip = () => {
    run.current++;
    setStage(finalStage());
    setPlaying(false);
  };

  const [copied, setCopied] = useState(false);
  const orig = demo.original;
  const simp = demo.shrinkTrace.simplified[0];

  return (
    <>
      <section className="wrap replay-top">
        <Bracket n="01">Replay</Bracket>
        <RiseHeading as="h1" text="A failure, shrunk" className="head head-1" />
        <p className="sec-lede">
          This is the real failing run of the demo test, replayed from the repository&apos;s own output: seed, calls and values are the
          ones <code className="code">fe test</code> produced. Fissure may run up to {demo.config.runs} seeds of {demo.config.steps} calls against
          the vault with the seeded bug; it stops at the first run that breaks the invariant, and shrinks it.
        </p>
      </section>

      <section className="replay wrap" ref={stageRef} aria-labelledby="stage-title">
        <h2 id="stage-title" className="sr-only">
          The replay
        </h2>
        <div className="replay-grid">
          <div className="replay-side">
            <div className="counters">
              <div className="counter">
                <Bracket>calls</Bracket>
                <DotNumber value={stage.calls} label={`calls: ${stage.calls}`} cell={11} immediate />
              </div>
              <div className="counter">
                <Bracket>replays</Bracket>
                <DotNumber value={stage.replays} label={`replays: ${stage.replays}`} cell={11} immediate />
              </div>
            </div>
            <div className="replay-actions">
              <button className="btn btn-solid" onClick={() => void play()}>
                {playing ? "Restart" : "Replay"} <span aria-hidden="true">↺</span>
              </button>
              <button className="btn" onClick={skip}>
                Skip to the end
              </button>
            </div>
            <dl className="facts">
              <div>
                <dt>seed</dt>
                <dd>
                  <span className="seed" title={demo.seed}>
                    {shortDecimal(demo.seed, 14, 10)}
                  </span>{" "}
                  <button
                    className="mini mini-light"
                    onClick={async () => {
                      if (await copyText(demo.seed)) {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1600);
                      }
                    }}
                    aria-label="Copy the full seed"
                  >
                    {copied ? "copied" : "copy"}
                  </button>
                </dd>
              </div>
              <div>
                <dt>invariant</dt>
                <dd>
                  #{demo.invariant.id}: {demo.invariant.text}
                </dd>
              </div>
              <div>
                <dt>the bug</dt>
                <dd>{demo.bug}</dd>
              </div>
            </dl>
          </div>

          <figure className="term replay-term on-dark">
            <div className="term-bar">
              <span>fe test -f demo_vault_bug_is_found --show-logs</span>
              <span className="dim">{demo.provenance.fe}</span>
            </div>
            <div className={`term-body replay-body ${stage.open ? "open" : ""}`} aria-hidden="true">
              <p className="hl line">{clip(HEAD, stage.head)}</p>
              <p className="line">{clip(SEED_LINE, stage.seed)}</p>
              <ol className="rows">
                {stage.rows.map((r) => (
                  <li key={r.id} className={`row ${r.struck ? "struck" : ""} ${r.gone ? "gone" : ""} ${r.kept ? "kept" : ""}`}>
                    <div className="row-in">
                      <span className="idx">{r.label}</span>
                      <span className="call">{clip(r.full, r.typed)}</span>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="line">{clip(RESULT, stage.result)}</p>
              <p className="line dim">{clip(REPRO, stage.repro)}</p>
              <svg className={`replay-crack ${stage.open ? "open" : ""}`} viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M5 0 L2 14 L8 28 L1 44 L9 60 L3 76 L7 100" pathLength={1} />
              </svg>
            </div>
            <p className="sr-only">
              Result: {demo.originalLen} calls shrunk to {demo.shrunkLen} in {demo.replays} replays. The minimal failing sequence is{" "}
              {demo.shrunk.map((s) => callLine(s.call, s.words, s.value)).join(", then ")}. Seed {demo.seed}.
            </p>
          </figure>
        </div>
      </section>

      <section className="sec wrap" aria-labelledby="read">
        <div className="sec-head">
          <Bracket n="02">Reading it</Bracket>
          <RiseHeading text="What you just watched" />
        </div>
        <ol className="notes" id="read">
          <li>
            <Bracket n="a">measured</Bracket>
            <p>
              The failing run had <strong>{demo.originalLen} calls</strong>: {orig.map((s, i) => `${i + 1}. ${callLine(s.call, s.words, s.value)}`).join("; ")}. After shrinking there are{" "}
              <strong>{demo.shrunkLen}</strong>, found in <strong>{demo.replays} replays</strong> on freshly deployed contracts. All of this is the
              decoded output of <code className="code">fe test</code>.
            </p>
          </li>
          <li>
            <Bracket n="b">derived, and checked</Bracket>
            <p>
              The library does not log individual attempts, so the order of the drops is derived. {demo.shrinkTrace.rule} Dropping calls{" "}
              {demo.shrinkTrace.dropped.map((i) => i + 1).join(" and ")} left {demo.shrinkTrace.kept.map((i) => i + 1).join(" and ")}, and
              that exact candidate was replayed in a scratch copy of the repository: it still broke invariant #
              {demo.shrinkTrace.candidateReplayInvariant}.
              {simp ? (
                <>
                  {" "}
                  The shrinker then lowered call {simp.index + 1}&apos;s value from {simp.from} wei to {simp.to} wei.
                </>
              ) : null}
            </p>
          </li>
          <li>
            <Bracket n="c">why 1 wei</Bracket>
            <p>
              The bug triggers on a deposit of exactly 1 wei made while the account already has a balance, so two deposits of 1 wei is the
              smallest sequence that shows it. That is the whole bug, in two calls.
            </p>
          </li>
          <li>
            <Bracket n="d">the PRNG</Bracket>
            <p>
              The hero on the front page is driven by this seed&apos;s PRNG. The TypeScript port is checked at build time against values Fissure&apos;s
              own Fe code produced: first words{" "}
              <span className="words">{demo.prng.next.slice(0, 3).map((w) => shortDecimal(w, 8, 4)).join(" · ")}</span>.
            </p>
          </li>
        </ol>
        <p className="fine">
          Reproduce it: <code className="code">fe test -f demo_ --show-logs</code>. Code commit{" "}
          <a className="link" href={`${REPO}/commit/${demo.provenance.codeCommit}`} target="_blank" rel="noreferrer">
            {demo.provenance.codeCommit.slice(0, 7)}
          <span className="sr-only"> (opens in a new tab)</span></a>
          , captured {demo.provenance.captured}. <Link className="link" to="/mutants">See how it does on {stats.mutants.total} mutants of an ERC-20 →</Link>
        </p>
      </section>
    </>
  );
}
