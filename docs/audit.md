# Audit

An attempt to break Fissure before anyone else does. Each item says what was
tried, what happened, and what changed. Fe 26.5.0 (`3dab95f`).
Regression tests for the findings are in `src/audit_tests.fe`.

## Findings (fixed)

### 1. Same seed, different calls when the sender had spent money (real bug)

`Pay` capped the value it attached by the sender's current funds, and `Env`
exposed those funds to every generator. Funds fall as runs deposit, so the same
seed produced different calls depending on what ran before it. A printed seed
would not reproduce the failure in a fresh test. A test confirmed it: with a
20-ether sender, the same seed gave different calls after other runs.

Fix: `Env` no longer carries the sender's funds, so a generator cannot depend on
them. `Pay` now draws from fixed values (0, 1 wei, 1 ether, 10 ether, random up
to 10 ether). The runner checks up front that the sender holds at least
`steps x 10 ether` and otherwise reverts with `Underfunded { have, need }`, so a
too-poor test fails loudly instead of quietly diverging. The starter's default
test balance (10 ether) is too small for a real run, and the error says so.

Tests: `seed_gives_the_same_calls_after_other_runs`, `pay_ignores_the_world`,
`pay_is_bounded_and_hits_its_boundaries`, `an_underfunded_sender_is_refused`,
`an_underfunded_replay_is_refused`.

### 2. A menu entry that never succeeds passed silently

If the callee rejects every call of one entry (a 7-day lock that tests cannot
wait out makes `withdraw` always fail), the invariants never see that code and
the test still passed, which is a vacuous pass for that part of the contract.

Fix: `Hunt.ok` counts accepted calls per entry. `check` reverts with
`Unreached { entry }` if an entry was never accepted, as well as with `Vacuous`
if nothing was. `hunt` returns the counts for anyone who wants a softer policy.

Tests: `an_entry_that_is_never_accepted_is_visible`,
`check_refuses_a_menu_entry_that_never_runs`, `zero_runs_is_not_a_pass`.

### 3. The shrunk result was verified only as it was built

Each accepted candidate was replayed when accepted, but the final sequence was
never replayed on its own. Fix: one last replay after shrinking; if it does not
fail, the original sequence is returned with `reproduced = false`.
(This is why the demo reports 19 replays, up from 18.)

## Checked, nothing wrong found

| Concern | What was done | Result |
| --- | --- | --- |
| Nondeterminism across runs | Ran the demo repeatedly, with `-O 0`, default and `-O 2` | Identical seed, replay count and sequence every time |
| Local vs CI | Compared the CI log of `npm run demo` with the local run | Identical seed, sequence and replay count (Linux x86-64, Fe 26.5.0 both; local via WSL) |
| Native backend | `fe test --backend native` | Not supported: native tests cannot use EVM `balance`/`should_revert` or logs. Fissure targets the default (EVM) backend only |
| Shrinker returns a passing sequence | Replay of the result in tests; dropping its last call must pass; a failure that does not replay is returned unshrunk | Holds (also finding 3) |
| Invariant reads state outside the target | An invariant on an actor's balance (which survives redeploys) makes every replay fail, shrinking to zero calls | Detected: an empty-sequence replay is tried first, and the result is `reproduced = false` (`an_invariant_leaking_outside_state_is_not_misreported`) |
| Empty message set | `Nil` menu | Reverts with `EmptyMenu`, does not pass |
| Zero steps / zero runs | `steps: 0`, `runs: 0` | Zero steps is a clean empty run; zero runs is `Vacuous` |
| Out-of-range entry in a replayed step | Step with `variant: 99` | Returns "rejected", no panic |
| Overflow in generators | `Amount` at balance 0 and at `WORD_MAX`; `between` over the full word range; `Prng::below(0)` | No overflow, no panic; `below(0)` and `between(hi <= lo)` are defined |
| Long runs | 1000 calls in one run | Completes (`a_thousand_calls_complete`) |
| Derived seeds collide | All pairs of 60 run seeds | Distinct |
| Bug found only for one seed | A second seed on `vault_bug` | Found and shrunk to the same 2 calls |
| `vault_ok` false positives | 50 seeds x 80 calls, with the accepted-call count asserted | No failure, not vacuous |

## Known limits (not fixed, documented)

- **Statistical quality of the PRNG is unmeasured.** It is a SplitMix-style
  mixer on 256-bit state, chosen for determinism, not for cryptographic or
  proven-uniform output. `below(n)` uses plain modulo: for `n` up to 2^64 the
  bias is below 2^-190, but for `n` near 2^255 it is large. Generators only use
  small `n`.
- **Static arguments only.** Dynamic types (`bytes`, `string`, arrays) get only a
  zero head word and are not generated meaningfully (untested against a contract
  that takes one). At most three argument words
  are generated; further static words are zero.
- **One sender, one block.** `fe test` offers no way to change the caller or
  advance time, so Fissure fuzzes a single account at a fixed timestamp.
  Time-lock bugs that need time to pass are out of reach; `vault_ok` uses a zero
  lock for that reason.
- **Shrinking is greedy.** Results are locally minimal (no single call can be
  dropped, no single word simplified), not guaranteed globally minimal. At most
  4000 replays are spent per shrink.
- **Invariants must read only the target's own state**, or state they reset.
  Anything left behind in the test account or other contracts persists between
  replays.
- **Failure revert data labels calls by menu entry index**, not name; the event
  report shows names.
- **Logs are not shown for failed tests** by `fe test`, so the sequence in a
  failing test is carried in its revert data and decoded by
  `scripts/fissure-report.mjs`.
- **`fe check` accepts a `msg` namespace used as a type** and the error appears
  only at codegen (see `compiler-notes.md`).
- The audit was done by the author with an AI assistant. It has not been
  reviewed by anyone else.
