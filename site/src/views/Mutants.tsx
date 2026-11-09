// Every mutant, caught or missed, per harness, with seeds, shrunk sequences and the
// reasons for the misses. All of it from site/data/mutants.json.

import { Fragment, useState } from "react";
import { DotNumber } from "../components/DotNumber";
import { RiseHeading } from "../components/Motion";
import { Bracket, copyText } from "../components/primitives";
import { type Cell, type Mutant, mutants, REPO, stats } from "../lib/data";
import { callLine, shortDecimal } from "../lib/format";

type Filter = "all" | "caught" | "missed" | "heldout";

const HARNESSES = [
  { key: "single" as const, name: "One sender", sub: "generic generators" },
  { key: "relaysTuned" as const, name: "Two relays", sub: "tuned generators" },
  { key: "relaysGeneric" as const, name: "Two relays", sub: "generic generators" },
];

const anyMissed = (m: Mutant) => HARNESSES.some((h) => m[h.key]?.verdict === "missed");
const anyCaught = (m: Mutant) => HARNESSES.some((h) => m[h.key]?.verdict === "caught");

function Verdict({ cell }: { cell: Cell | null }) {
  if (!cell) return <span className="v none">not run</span>;
  if (cell.verdict === "clean") return <span className="v clean">clean</span>;
  if (cell.verdict === "missed") return <span className="v missed">missed</span>;
  return (
    <span className="v-wrap">
      <span className="v caught">caught</span>
      <span className="v-meta">
        {cell.atDeployment ? "at deployment, 0 calls" : `${cell.originalLen} → ${cell.shrunkLen} calls`} · #{cell.invariant}
      </span>
    </span>
  );
}

function Seed({ seed }: { seed: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="seedline">
      <span title={seed}>{shortDecimal(seed, 12, 8)}</span>{" "}
      <button
        className="mini mini-light"
        onClick={async () => {
          if (await copyText(seed)) {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          }
        }}
        aria-label={`Copy the full seed ${shortDecimal(seed, 6, 4)}`}
      >
        {done ? "copied" : "copy"}
      </button>
    </span>
  );
}

function Detail({ m }: { m: Mutant }) {
  return (
    <div className="detail">
      <p className="detail-desc">
        {m.description.charAt(0).toUpperCase() + m.description.slice(1)}
        {m.kind ? <span className="dim-ink"> ({m.kind})</span> : null}
        {m.heldOut ? <span className="tag">held out</span> : null}
      </p>
      <div className="detail-grid">
        {HARNESSES.map((h) => {
          const c = m[h.key];
          if (!c) return null;
          return (
            <div key={h.key} className="detail-col">
              <p className="detail-h">
                {h.name} <span className="dim-ink">· {h.sub}</span>
              </p>
              {c.verdict === "caught" ? (
                <>
                  {c.atDeployment ? (
                    <p>
                      The invariant was already broken on the freshly deployed contract: caught before any call, so there is nothing to
                      shrink.
                    </p>
                  ) : (
                    <ol className="steps">
                      {c.steps.map((s, i) => (
                        <li key={i}>
                          {callLine(s.call, s.words, s.value)}
                          {s.sender > 0 ? <span className="dim-ink"> [relay {s.sender}]</span> : null}
                        </li>
                      ))}
                    </ol>
                  )}
                  {c.seed ? (
                    <p className="small">
                      seed <Seed seed={c.seed} />
                      {c.replays !== null ? ` · ${c.replays} replays` : ""}
                    </p>
                  ) : null}
                </>
              ) : c.verdict === "missed" ? (
                <>
                  {c.accepted !== null ? <p className="small">{c.accepted} calls accepted by the contract, no invariant broke.</p> : <p className="small">No invariant broke.</p>}
                  {m.reason ? (
                    <p className="why">
                      <span className="why-h">Why it was missed:</span> {m.reason}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="small">No bug here: the control must stay clean, and it does.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Mutants() {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const all = mutants.mutants;
  const shown = all.filter((m) => {
    if (filter === "caught") return anyCaught(m);
    if (filter === "missed") return anyMissed(m);
    if (filter === "heldout") return m.heldOut;
    return true;
  });
  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const s = stats.mutants;
  const misses = all.filter(anyMissed);

  return (
    <>
      <section className="wrap replay-top">
        <Bracket n="01">Mutants</Bracket>
        <RiseHeading as="h1" text={`${s.total} seeded bugs`} className="head head-1" />
        <p className="sec-lede">
          Each mutant is a copy of the ERC-20 from the Fe Guide (third-party code) with one bug seeded. Fissure ran against every one. Here is
          what it caught, what it missed, and why.
        </p>
      </section>

      <section className="wrap mut-sum" aria-label="Summary">
        <div className="mut-sum-grid">
          <div className="counter">
            <Bracket>one sender, 1–11</Bracket>
            <DotNumber value={`${s.step7.single.caught}/${s.step7.single.total}`} label={`${s.step7.single.caught} of ${s.step7.single.total} caught with one sender`} cell="clamp(6px, 0.7vw + 1px, 9px)" />
          </div>
          <div className="counter">
            <Bracket>two relays, 1–11</Bracket>
            <DotNumber value={`${s.step7.relays.caught}/${s.step7.relays.total}`} label={`${s.step7.relays.caught} of ${s.step7.relays.total} caught with relay senders`} cell="clamp(6px, 0.7vw + 1px, 9px)" />
          </div>
          <div className="counter">
            <Bracket>held out, one sender</Bracket>
            <DotNumber value={`${s.heldOut.single.caught}/${s.heldOut.single.total}`} label={`${s.heldOut.single.caught} of ${s.heldOut.single.total} held-out mutants caught with one sender`} cell="clamp(6px, 0.7vw + 1px, 9px)" />
          </div>
          <div className="counter">
            <Bracket>held out, relays</Bracket>
            <DotNumber value={`${s.heldOut.relaysTuned.caught}/${s.heldOut.relaysTuned.total}`} label={`${s.heldOut.relaysTuned.caught} of ${s.heldOut.relaysTuned.total} held-out mutants caught with relay senders`} cell="clamp(6px, 0.7vw + 1px, 9px)" />
          </div>
        </div>
        <p className="fine">
          &ldquo;Held out&rdquo; means written after the generators and harnesses were frozen, with the predictions committed before the first run.
          The mutants are author-made and small in number: this shows the machinery works on a contract of this size, not that Fissure finds bugs
          it was not shaped around.{" "}
          <a className="link" href={`${REPO}/blob/main/docs/mutation.md`} target="_blank" rel="noreferrer">
            Full study
          </a>
          .
        </p>
      </section>

      <section className="sec wrap" aria-labelledby="table-h">
        <div className="sec-head">
          <Bracket n="02">Every mutant</Bracket>
          <RiseHeading text="Caught or missed" />
        </div>
        <div className="chips" role="group" aria-label="Filter mutants">
          {(
            [
              ["all", "All"],
              ["caught", "Caught somewhere"],
              ["missed", "Missed somewhere"],
              ["heldout", "Held out"],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button key={k} className={`chip ${filter === k ? "on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="mtable-wrap">
          <table className="mtable" id="table-h">
            <caption className="sr-only">
              Mutants of the ERC-20, with the verdict for each harness. Select a row to see seeds, shrunk sequences and reasons.
            </caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Mutant</th>
                {HARNESSES.map((h) => (
                  <th scope="col" key={h.key}>
                    {h.name}
                    <span className="th-sub">{h.sub}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => {
                const isOpen = open.has(m.id);
                return (
                  <Fragment key={m.id}>
                    <tr className={`mrow ${isOpen ? "open" : ""} ${anyMissed(m) && !m.control ? "has-miss" : ""}`}>
                      <td className="c-id" data-label="#">
                        {m.id}
                      </td>
                      <td className="c-title" data-label="Mutant">
                        <button className="mbtn" aria-expanded={isOpen} aria-controls={`d-${m.id}`} onClick={() => toggle(m.id)}>
                          <span className="chev" aria-hidden="true">
                            {isOpen ? "−" : "+"}
                          </span>
                          {m.title}
                          {m.heldOut ? <span className="tag">held out</span> : null}
                        </button>
                      </td>
                      {HARNESSES.map((h) => (
                        <td key={h.key} data-label={`${h.name}, ${h.sub}`}>
                          <Verdict cell={m[h.key]} />
                        </td>
                      ))}
                    </tr>
                    {isOpen ? (
                      <tr className="mdetail" id={`d-${m.id}`}>
                        <td colSpan={5}>
                          <Detail m={m} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="fine">
          <code className="code">#5</code> is the id of the invariant that broke. They are listed below. Seeds are the failing run&apos;s seed (decimal); with{" "}
          <code className="code">fe test</code> they reproduce the run.
        </p>
      </section>

      <section className="dark on-dark" aria-labelledby="miss-h">
        <div className="wrap miss-in">
          <div className="sec-head">
            <Bracket n="03">The misses</Bracket>
            <RiseHeading text="Missed, and why" className="head head-2 on-dark-head" />
            <p className="dim">Nothing here is hidden: every mutant that any harness missed, with the reason from the study.</p>
          </div>
          <ul className="misses" id="miss-h">
            {misses.map((m) => (
              <li key={m.id}>
                <p className="miss-t">
                  <span className="miss-id">{m.id}</span> {m.title}
                </p>
                <p className="miss-where">
                  Missed by:{" "}
                  {HARNESSES.filter((h) => m[h.key]?.verdict === "missed")
                    .map((h) => `${h.name.toLowerCase()}, ${h.sub}`)
                    .join("; ")}
                  . Caught by:{" "}
                  {HARNESSES.filter((h) => m[h.key]?.verdict === "caught")
                    .map((h) => `${h.name.toLowerCase()}, ${h.sub}`)
                    .join("; ") || "none"}
                  .
                </p>
                <p>{m.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec wrap" aria-labelledby="inv-h">
        <div className="sec-head">
          <Bracket n="04">Invariants</Bracket>
          <RiseHeading text="What was checked" />
        </div>
        <ol className="invs" id="inv-h">
          {Object.entries(mutants.invariants)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([id, text]) => (
              <li key={id}>
                <span className="inv-id">#{id}</span> {text}
              </li>
            ))}
        </ol>
        <p className="fine">
          Invariants are written by the same author as the tool, and the mutants are of kinds they were built around. Data: {mutants.provenance.fe}, code
          commit {mutants.provenance.codeCommit.slice(0, 7)}, captured {mutants.provenance.captured}.
        </p>
      </section>
    </>
  );
}
