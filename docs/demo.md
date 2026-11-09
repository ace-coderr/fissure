# Demo

Primary path, with only Fe installed and nothing leaving your machine:

```sh
fe test -f demo_ --show-logs
```

`demo_vault_bug_is_found_and_shrunk` (`src/demo_tests.fe`) asserts that Fissure
finds the seeded bug, that the failing run shrinks to exactly two 1-wei
`deposit()` calls, and that the shrunk calls still fail on replay. The test
passes only if all of that holds. `--show-logs` additionally prints the report as
raw event data.

Optional, with Node 18+: `npm run demo` builds, runs the same test and decodes
the events with `scripts/fissure-report.mjs` (non-zero exit if nothing was
found). Output:

```
demo_vault_bug_is_found_and_shrunk: FISSURE FOUND A FAILURE
  seed 63943086030706054941702419180308291968568539214185280263325138216467852686274   broken invariant #1
  4 calls shrunk to 2 in 19 replays
    1. deposit()  value=1 wei   words=[0, 0, 0]
    2. deposit()  value=1 wei   words=[0, 0, 0]
```

## What it shows

- `vault_ok` (`src/vault_ok.fe`) is the starter's time-locked vault. Fissure runs
  50 seeds x 80 calls against it, with over 1000 accepted calls, and finds
  nothing (`demo_vault_ok_finds_nothing`).
- `vault_bug` (`src/vault_bug.fe`) is the same vault with one seeded bug: a
  deposit of exactly 1 wei, made while the account already has a balance,
  overwrites the balance instead of adding to it. The vault then holds more
  ether than it owes.
- The invariant is a plain Fe function next to the tests: the vault's ether
  balance equals what its only depositor is owed.
- Fissure finds the failing run, then shrinks 4 calls to the 2 that matter,
  with every value reduced to its smallest failing form (1 wei).

## Seeing a real failing test

`demo_vault_bug_fails_a_plain_check` calls `check<BugVault>(...)` the way a user
would. It is marked `should_revert` so CI stays green; without that attribute
the test fails with a `Failure` error in its revert data (seed, invariant,
shrunk sequence), which the same script decodes:

```sh
fe test --show-logs -f your_test | node scripts/fissure-report.mjs out/VaultBug.abi.json
```

Limitation: in a failure's revert data the calls are labelled by menu entry
index, not by function name; the event report (used by the demo) shows names.
