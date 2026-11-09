// Navbar and footer, shared by every page.

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { REPO, shortSha, stats } from "../lib/data";

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 16 24" aria-hidden="true">
      <path d="M8 1 L6 7 L10 11 L5 16 L9 20 L7 23" />
    </svg>
  );
}

const LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/replay", label: "Replay", end: false },
  { to: "/mutants", label: "Mutants", end: false },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setOpen(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <header className="nav">
      <div className="wrap nav-in">
        <Link to="/" className="nav-brand" aria-label="Fissure, home">
          <Mark />
          <span>Fissure</span>
        </Link>
        <button className="nav-toggle" aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((o) => !o)}>
          <span className="sr-only">Menu</span>
          <span aria-hidden="true">{open ? "close" : "menu"}</span>
        </button>
        <nav id="nav-links" className={`nav-links ${open ? "open" : ""}`} aria-label="Main">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? "active" : "")}>
              {l.label}
            </NavLink>
          ))}
          <a href={REPO} target="_blank" rel="noreferrer">
            Code <span aria-hidden="true">↗</span>
            <span className="sr-only"> (GitHub, opens in a new tab)</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  const p = stats.provenance;
  return (
    <footer className="foot on-dark">
      <div className="wrap foot-in">
        <div className="foot-main">
          <p className="foot-word">Fissure</p>
          <p className="foot-note">
            Stateful invariant testing for Fe, written in Fe. Apache-2.0. Every number on this site is generated from the
            repository&apos;s own test output: {p.fe}, code commit{" "}
            <a className="link" href={`${REPO}/commit/${p.codeCommit}`} target="_blank" rel="noreferrer">
              {shortSha(p.codeCommit)}
            </a>
            , captured {p.captured}.
          </p>
        </div>
        <ul className="foot-links">
          <li>
            <a href={REPO} target="_blank" rel="noreferrer">
              Repository
            </a>
          </li>
          <li>
            <a href={`${REPO}#readme`} target="_blank" rel="noreferrer">
              README
            </a>
          </li>
          <li>
            <a href={`${REPO}/blob/main/docs/mutation.md`} target="_blank" rel="noreferrer">
              Mutation study
            </a>
          </li>
          <li>
            <a href={`${REPO}/blob/main/docs/audit.md`} target="_blank" rel="noreferrer">
              Audit
            </a>
          </li>
        </ul>
        <p className="foot-by">
          Built by{" "}
          <a className="pill" href="https://x.com/_ace_won" target="_blank" rel="noreferrer">
            ace
          </a>
        </p>
      </div>
    </footer>
  );
}
