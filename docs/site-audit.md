# Site audit

An attempt to break the project site (`site/`) before anyone else does. It changes
nothing in the Fe library. What was checked, what was found, what was fixed, and
what was **not** verified. Site tests: `cd site && npm test` (24 tests).

## Findings, all fixed

| # | Finding | How it was found | Fix |
| --- | --- | --- | --- |
| 1 | **The replay's calls counter went 4 → 2 → 0.** The decrement ran inside a React state updater, and StrictMode runs updaters twice | Sampling the DOM every 100 ms while the animation ran | Compute the value outside the updater |
| 2 | The hero's crack was drawn dashed and in the wrong place | Screenshot | SVG `non-scaling-stroke` ignores `pathLength`, and the box was wider than the text. The crack now measures its box and draws in real pixels; the headline shrink-wraps |
| 3 | Scrambling glyphs (`W`, `M`, `0`) overlapped their neighbours | Screenshot | Each letter cell clips; the narrow `I` scrambles through narrow glyphs only |
| 4 | Dot-matrix numbers overflowed their boxes (`7/11` clipped at about 980-1100 px) | Screenshot | The dot size is a `clamp()` of the viewport; checked down to 320 px |
| 5 | **Three text colours failed WCAG AA (4.5:1)**: rust on the darker paper tones, 4.09, 3.87 and 4.22 | `npm run contrast` (computed from the real tokens) | `--rust` darkened to `#9a2f07`; all 24 pairs now pass (lowest 4.76) |
| 6 | **Layout shift from the web font swap**, 0.039 CLS on a cold load | `layout-shift` observer on the production build | Preload the two fonts the first screen needs (a small Vite plugin). CLS is 0 on all three pages (2 loads each) |
| 7 | The ticker moves for more than five seconds with no way to stop it (WCAG 2.2.2) | Review | A pause button (hover and focus also pause); the whole ticker is static under reduced motion |
| 8 | Screen readers would read "total supplyheld out" (a tag glued to the name) | Accessibility-tree dump | A real space before the tag |
| 9 | External links did not say they open a new tab | Accessibility-tree dump | Visually hidden text on every external link |
| 10 | No page title change and no focus move on navigation | Review | Per-page `<title>`; focus moves to `main` on route change |
| 11 | The pointer effect read and wrote layout per element, every frame | Review of `PointerField` | All reads, then all writes; off on touch, on reduced motion, and on machines reporting 2 or fewer cores or 2 GB or less |
| 12 | The page had **2,012 DOM nodes** (one `<circle>` per dot) | DOM count | One `<path>` per glyph: 630 nodes, same picture |
| 13 | The copy-seed button did nothing visible when the clipboard is blocked | Review | It says "copy blocked" |
| 14 | Wording that claimed more than the repository shows | Claim-by-claim read | "Measured, not claimed" became "What was measured"; "Fissure ran N seeds" became "may run up to N seeds, and stops at the first failing run"; the footer says "test output **and docs**"; the shrinker is described as locally minimal, as the README says |

## Numbers and claims against the README and docs

Automated, so it cannot quietly drift (`site/src/test/consistency.test.ts`):

- the test count, the demo (4 calls shrunk to 2 in 19 replays), the 7 / 9 of 11
  mutants, the 6 / 5 of 6 held-out mutants, and the revert rates on the site equal
  the ones written in `README.md` and `docs/mutation.md`;
- the data's code commit equals the "code last changed" SHA in `SUBMISSION.md`. If
  the Fe code changes after the data was captured, this test fails until
  `npm run capture` and `npm run data` are run again;
- the pitch on the site is the README's pitch, character for character;
- no digits are typed into the JSX prose (every number comes from the data);
- the site states that the mutants are author-made, that the drop order is derived,
  and that shrinking is locally minimal.

The data pipeline itself fails (writing nothing) if a mutant's decoded block
disagrees with its table row, if a missed mutant has no reason in
`docs/mutation.md`, or if the TypeScript PRNG port disagrees with the 16 + 8 values
Fe's own code produced.

## Accessibility

- **Contrast**: 24 text/background pairs computed from the tokens, all pass (body 14.2:1,
  secondary 7.4:1, rust on paper 5.9:1, on dark 6.2:1; focus rings 5.9:1 and 6.2:1).
- **Structure** (dumped from the DOM on each page): one `h1`, headings in order,
  landmarks (`header`, `nav`, `main`, `footer`), no unnamed buttons or links, a skip link
  first in the tab order, then the nav, then the content. The scrollable terminal
  output is focusable. The mutants table has a caption, column headers with `scope`,
  and expandable rows with `aria-expanded` / `aria-controls`.
- **Not colour alone**: every verdict is a word (CAUGHT / MISSED / CLEAN / NOT RUN).
- **Animation**: the hero and the replay are driven by real DOM text; the replay has a
  visible "Skip to the end"; a screen reader gets a static result paragraph instead of the
  typing. Heading animations and odometers are short.
- **Reduced motion**: `prefers-reduced-motion` gives the final state with no animation,
  both in CSS (animation and transition durations collapse) and in the components
  (tests render each with the media query on: the hero is split and reads FISSURE,
  numbers sit at their value with no transition, the replay shows the minimal sequence,
  the real counts and a closed crack, the ticker is static and has no pause button).

## Mobile

320 px and 375 px wide: no horizontal overflow on any page, no clipped number boxes.
The mutants table becomes cards under 760 px; the navigation becomes a menu button
under 680 px.

## Performance (production build)

| Measure | Result |
| --- | --- |
| Layout shift (CLS) | 0 on `/`, `/replay` and `/mutants`, two cold loads each |
| Transfer | JS 96 KB, CSS 6 KB, five font files 93 KB (all served from the site itself, no third-party requests) |
| DOM nodes, overview | 630 |
| Pointer effect | about 0.1 ms per frame on 21 elements (median), 0.8 ms worst, run at most every 32 ms |

## Not verified (read this)

- **No real screen reader** (NVDA, JAWS, VoiceOver) was run. Accessibility was checked from
  the DOM, the accessibility tree and computed contrast.
- **No real frame-time or slow-device measurement.** The browser pane used here was
  hidden, so animation frames do not fire; I measured the CPU cost of the per-frame work
  instead, and added guards (the pointer effect turns off on weak machines). Nothing was
  tested under CPU throttling or on an actual phone.
- **Reduced motion was tested by mocking the media query** in a DOM test and by reading
  the CSS, not by switching the operating-system setting in a real browser.
- **Only a Chromium-based browser was used.** Firefox and Safari were not tried.
- The mid-animation states of the replay were verified by sampling the DOM and by
  screenshots, not frame by frame.
- The ticker scrolls at constant speed (a linear loop); it is the one motion that does not
  use the site's easing curve, because a marquee that eases would stop and start.
- Which calls the shrinker dropped first is **derived**, not logged (the library emits
  no per-attempt trace). The derivation and the check that backs it (replaying that
  exact candidate) are shown on the Replay page and recorded in `site/data/demo.json`.
- A first performance run accidentally hit a different local app that was already
  serving on port 4173; those numbers were discarded and everything above was measured
  on this site's own build.

## Live check (Netlify)

Site `fissure-fe` in the `ace-won` team, https://fissure-fe.netlify.app. Base directory
`site`, build `npm run build`, publish `dist`, GitHub `ace-coderr/fissure` branch `main`.

- **Automatic deploys confirmed.** Pushing commit `223de8b` (a one-line change to
  `site/README.md`) started a new production deploy by itself; it reached `ready`.
- **Access.** The first deploy returned HTTP 401: a team-level SSO setting protected every
  deploy. After the owner changed it, production is public (HTTP 200 on `/`, `/replay`
  and `/mutants`, including direct loads). Deploy previews stay protected
  (`sso_login` applies to non-production deploys only).
- **Real data live.** Checked in a browser on the live URL (data from code commit `c5a7650`, so 114 tests; after the relay fix the data was refreshed from `468389e` and the site shows 119): the Overview shows 114 tests,
  19 replays, 9/11 and 5/6; the Replay result reads "4 calls shrunk to 2 in 19 replays" with
  the real seed; the Mutants page has 18 rows (17 mutants plus the control), the four
  summary counts 7/11, 9/11, 6/6, 5/6, and the five mutants that any harness missed
  (3, 4, 9, 10, 13), each with its reason. Footer: Fe 26.5.0 (3dab95f), code commit
  `c5a7650`.
- **No third-party requests**: all fonts, scripts and styles come from the site itself.
- **Not checked live:** the animation timing on the live host, other browsers, and any
  device other than this desktop; see "Not verified" above.

