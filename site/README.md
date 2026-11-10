# Fissure site

The project site for [Fissure](../README.md). A separate Vite + React + TypeScript
app; it changes nothing in the Fe library.

Everything on it is real: numbers, sequences, seeds and mutant results come from the
repository's own test output and `docs/mutation.md`. Nothing is typed in by hand.

```sh
npm install
npm run data      # site/data/raw -> site/data/*.json (never edit the JSON)
npm run dev       # local preview
npm run build     # type-check and build to dist/
npm test          # parsers, PRNG port, numbers vs README/docs, reduced motion
npm run contrast  # WCAG contrast of every text/background pair
```

## Where the data comes from

`npm run capture` (needs Fe 26.5.0 on PATH, or `FE=<wrapper>`) runs the repository's
own commands and stores their decoded text in `data/raw/`: the full `fe test`
summary, the demo and the mutation suites piped through `scripts/fissure-report.mjs`,
and one throwaway test run in a **copy** of the repository (never in the repository)
that emits what the library does not: the demo's failing sequence before shrinking,
and the first outputs of the demo seed's PRNG. The raw files are committed.

`npm run data` parses them into `data/*.json`. It fails, writing nothing, if anything
does not parse or agree: for example if the block for a mutant disagrees with the
table, if a miss has no reason in `docs/mutation.md`, or if the TypeScript PRNG port
(`src/lib/prng.ts`, which drives the hero animation) does not reproduce Fe's own
outputs. Every JSON file records its provenance: the commit whose code produced the
numbers, the Fe version, the capture date and its sources.

Fonts (Archivo, JetBrains Mono; SIL OFL 1.1) are bundled from the `@fontsource`
packages and served from the site itself.

Deployed on GitHub Pages (https://ace-coderr.github.io/fissure/) by `.github/workflows/pages.yml` on every push to `main`: `npm ci`, `npm run build` with `VITE_BASE=/fissure/`, publish `site/dist`. The build also writes `404.html` (a copy of `index.html`) so direct visits and refreshes of `/replay` and `/mutants` load the app; Pages serves it with HTTP status 404, which the browser ignores. The root build (`netlify.toml`) is kept for any static host that serves from `/`.
