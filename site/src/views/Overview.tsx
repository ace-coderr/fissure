import { Link } from "react-router-dom";
import { Hero } from "../components/Hero";
import { DotNumber } from "../components/DotNumber";
import { RiseHeading, Ticker } from "../components/Motion";
import { Bracket, copyText, Inline } from "../components/primitives";
import { demo, REPO, shortSha, stats, ticker } from "../lib/data";
import { useState } from "react";

function Tile({ n, value, label, label2, note }: { n: string; value: string; label: string; label2: string; note: string }) {
  return (
    <li className="tile">
      <Bracket n={n}>{label2}</Bracket>
      <div className="tile-num">
        <DotNumber value={value} label={`${label}: ${value}`} cell="clamp(6px, 0.7vw + 1px, 9px)" />
      </div>
      <p className="tile-label" data-shift="">
        {label}
      </p>
      <p className="tile-note">{note}</p>
    </li>
  );
}

function SeedCopy() {
  const [done, setDone] = useState(false);
  return (
    <button
      className="mini"
      onClick={async () => {
        if (await copyText(demo.seed)) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        }
      }}
      aria-label="Copy the full seed"
    >
      {done ? "copied" : "copy seed"}
    </button>
  );
}

export default function Overview() {
  const m = stats.mutants;
  const seedShort = `${demo.seed.slice(0, 10)}…${demo.seed.slice(-7)}`;
  return (
    <>
      <section className="hero wrap">
        <p className="hero-kicker">
          <Bracket n="01">Invariant testing for Fe</Bracket>
        </p>
        <Hero />
        <div className="hero-copy">
          <p className="hero-pitch" data-shift="">
            <Inline text={stats.pitch.replace(/^Fissure is a/, "A")} />
          </p>
          <div className="hero-actions">
            <Link className="btn btn-solid" to="/replay">
              Watch a failure shrink <span aria-hidden="true">→</span>
            </Link>
            <a className="btn" href={REPO} target="_blank" rel="noreferrer">
              Read the code <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
          <p className="hero-meta">
            {stats.provenance.fe} · Apache-2.0 · code commit {shortSha(stats.provenance.codeCommit)}
          </p>
        </div>
      </section>

      <Ticker items={ticker} label="Phrases from Fissure's own output" />

      <section className="sec wrap" aria-labelledby="numbers">
        <div className="sec-head">
          <Bracket n="02">Numbers</Bracket>
          <RiseHeading text="Measured, not claimed" />
          <p className="sec-lede">
            From <code className="code">fe test</code> and the decoded results of the mutation study, at the commit named in the
            footer.
          </p>
        </div>
        <ul className="tiles" id="numbers">
          <Tile n="a" value={String(stats.tests)} label="tests, all passing" label2="Tests" note={`fe test, ${stats.provenance.fe}`} />
          <Tile
            n="b"
            value={String(stats.demo.replays)}
            label={`replays shrank ${stats.demo.originalLen} calls to ${stats.demo.shrunkLen}`}
            label2="Replay"
            note="the seeded bug in vault_bug"
          />
          <Tile
            n="c"
            value={`${m.step7.relays.caught}/${m.step7.relays.total}`}
            label="mutants caught with relay senders"
            label2="Mutants"
            note={`${m.step7.single.caught}/${m.step7.single.total} with one sender; ERC-20 from the Fe Guide`}
          />
          <Tile
            n="d"
            value={`${m.heldOut.relaysTuned.caught}/${m.heldOut.relaysTuned.total}`}
            label="held-out mutants caught with relays"
            label2="Held out"
            note={`${m.heldOut.single.caught}/${m.heldOut.single.total} with one sender; written after the generators were frozen`}
          />
        </ul>
        <p className="fine">
          Typed argument generators cut the revert rate on the correct vault from {stats.revertRate.untyped}% to{" "}
          {stats.revertRate.typed}% of {stats.revertRate.calls} calls. These are small, author-made benchmarks:{" "}
          <a className="link" href={`${REPO}#honesty-what-the-evidence-does-and-does-not-show`} target="_blank" rel="noreferrer">
            what they do and do not show
          </a>
          .
        </p>
      </section>

      <section className="sec wrap" aria-labelledby="how">
        <div className="sec-head">
          <Bracket n="03">How it works</Bracket>
          <RiseHeading text="Three moves" />
        </div>
        <ol className="moves" id="how">
          <li>
            <Bracket n="01">msg</Bracket>
            <h3 className="move-h">A message is a type</h3>
            <p data-shift="">
              Every Fe <code className="code">msg</code> variant implements <code className="code">MsgVariant</code>. Fissure builds a call as
              selector plus argument words from that, with no per-message code and no reflection.
            </p>
          </li>
          <li>
            <Bracket n="02">seq</Bracket>
            <h3 className="move-h">A seed is a sequence</h3>
            <p data-shift="">
              From a seeded PRNG written in Fe, N random calls run inside <code className="code">fe test</code>. Your invariants are checked
              after every call. The same seed gives the same calls.
            </p>
          </li>
          <li>
            <Bracket n="03">shrink</Bracket>
            <h3 className="move-h">A failure becomes small</h3>
            <p data-shift="">
              Candidates are replayed on fresh deployments: calls dropped, values simplified. A candidate stays only if the same invariant
              still breaks.
            </p>
          </li>
        </ol>
      </section>

      <section className="dark on-dark" aria-labelledby="live">
        <div className="wrap dark-in">
          <div className="dark-copy">
            <Bracket n="04">Real output</Bracket>
            <RiseHeading text="One seeded bug, found" className="head head-2 on-dark-head" />
            <p data-shift="">{demo.bug.charAt(0).toUpperCase() + demo.bug.slice(1)}</p>
            <p className="dim">
              The invariant: {demo.invariant.text}. Fissure ran {demo.config.runs} seeds of {demo.config.steps} calls and reported this.
            </p>
            <Link className="btn" to="/replay">
              Replay it <span aria-hidden="true">→</span>
            </Link>
          </div>
          <figure className="term">
            <div className="term-bar">
              <span>fe test -f demo_vault_bug_is_found --show-logs</span>
              <SeedCopy />
            </div>
            <pre className="term-body" tabIndex={0} aria-label="Decoded output of the demo test">
              <span className="hl">demo_vault_bug_is_found_and_shrunk: FISSURE FOUND A FAILURE</span>
              {"\n  seed "}
              {seedShort}
              {`   broken invariant #${demo.invariant.id}`}
              {`\n  ${demo.originalLen} calls shrunk to ${demo.shrunkLen} in ${demo.replays} replays`}
              {demo.shrunk.map((s) => `\n    ${s.index}. ${s.call}  value=${s.value} wei`)}
            </pre>
          </figure>
        </div>
      </section>

      <section className="sec wrap" aria-labelledby="go">
        <div className="sec-head">
          <Bracket n="05">Go deeper</Bracket>
          <RiseHeading text="Check it yourself" />
        </div>
        <ul className="goto" id="go">
          <li>
            <Link to="/replay" className="goto-a">
              <span className="goto-t">Replay</span>
              <span>The failing sequence, shrunk call by call.</span>
            </Link>
          </li>
          <li>
            <Link to="/mutants" className="goto-a">
              <span className="goto-t">Mutants</span>
              <span>Every mutant, caught or missed, with seeds and the reasons for the misses.</span>
            </Link>
          </li>
          <li>
            <a className="goto-a" href={REPO} target="_blank" rel="noreferrer">
              <span className="goto-t">
                Repository <span aria-hidden="true">↗</span>
              </span>
              <span>
                <code className="code">fe test</code> reproduces all of this. README, audits and the mutation study are in{" "}
                <code className="code">docs/</code>.
              </span>
            </a>
          </li>
        </ul>
      </section>
    </>
  );
}
