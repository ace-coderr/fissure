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


---

# Round 2 (step 7: a third-party contract and mutants)

Done after running Fissure on the CoolCoin ERC-20 and 11 seeded mutants
(`docs/mutation.md`). Regression tests: `src/gen_tests.fe` (domains),
`src/third_party/coolcoin/mutation_tests.fe` and `fuzz_tests.fe`.

## Findings (fixed)

### 4. The shrinker left the generators' domain and drifted to a different failure (real bug)

Shrinking tried the values 0, 1 and half for every word. For an address word
that produced `address(1)`, which no generator ever makes. On the ERC-20 the
shrunk calls for three mutants ended in `transferFrom(.., to = 1, ..)` and
failed because the harness did not know that account, not because of the
seeded bug; the invariant id was the same, so the shrinker accepted it. The
reported "minimal" sequence did not show the bug.

Fix: each generator proposes its own simpler values (`Generator::simpler`), kept
inside what it can produce (an actor shrinks to a lower actor, the sender, or
the zero address; the sender stays the sender). After the fix, mutant 8 shrinks
to a real self-transfer, which its test asserts.

Remaining weakness, not fixable by id comparison: dropping calls can also move to
a different cause behind the same invariant id.

### 5. A test running out of gas failed with an empty revert

`fe test` gives each test a fixed gas budget and Fe never frees memory. At
`-O 0` (more gas per operation) one mutant hunt ran dry, and the visible symptom
was `Test reverted: 0x` from a failed `create`, with no hint why. Fix: the runner
checks the remaining gas before every deployment and reverts with
`OutOfBudget { gas_left }` while it can still say so (decoded by the report
script). Measured: one run of 20000 vault calls or 3000 ERC-20 calls fits;
4000 ERC-20 calls spread over a hunt did not. The mutation results hold at the
default optimisation level (CI); at `-O 0` mutant 11 reports `OutOfBudget`.

## Harness mistakes found by running on a third-party contract (my invariants, not Fissure or CoolCoin)

A zero-amount `transferFrom` from a stranger is legal, and balances above 2^128
are legal. Both were wrongly flagged by my first invariants; details in
`docs/mutation.md`.

## Checked, nothing wrong found

| Concern | Result |
| --- | --- |
| Determinism with the new hooks | Mutation results identical across repeated runs and `-O 1`/`-O 2` (`-O 0` runs out of budget for mutant 11 only, see finding 5) |
| Control mutant | Mutant 0 (the mutation machinery, no bug) is clean, and accepts as many calls as the unmodified contract |
| Replay uses the same hooks as the run | `replay` calls `snapshot` and `check_step` exactly as `fuzz` does; shrunk ERC-20 sequences replay to the same invariant |
| Equivalent mutant | Mutant 3 behaves exactly like the original (same accepted-call count); correctly not reported |

## Known limits added in round 2

- **One sender** is why mutants 9 and 10 are missed; relay actors would fix it
  (`docs/multi-sender-spike.md`, not built).
- **Logs are invisible to invariants**, hence mutant 4.
- **Seeds depend on the test account's address** for harnesses that use `Sender`
  or `Holder` (the address is part of the generated words). It was the same in
  all my local runs; it was not separately checked in CI.
- **Shrinking halves a word at most 12 times per round**, so big values are
  reduced, not minimised (mutant 11's allowance).
- **Mutation evidence is small**: 11 mutants chosen by the author.
- **Third-party contract**: the CoolCoin source was copied from a web page whose
  license is not stated on the page (see SUBMISSION.md).

---

# Round 3 (step 8: several senders)

## What was added

`Step.who` (which sender), `Cast` (up to 3 relay contracts, deployed once per
hunt), `fuzz_cast` / `replay_cast` / `shrink_cast` / `hunt_cast` / `check_cast`
(the old names are unchanged and mean "no relays"), multi-sender hook variants on
`Harness`, a per-step gas check, and a multi-sender ERC-20 harness.

## Checked

| Concern | Result |
| --- | --- |
| Single-sender seeds changed by the new code? | No. A sender is drawn from the seed only when a cast exists. The demo's seed, replay count and sequence are identical to before (and identical in CI) |
| Determinism with relays | Decoded multi-sender results are identical across two default runs and `-O 2` (compared as sorted lines) |
| CI equals local | The CI log of both mutation suites (117 lines) equals the local output line for line, including seeds and the address words of the test account and the relays. So the test account's address is the same in CI and locally |
| Sender simplification | A failure any sender can cause shrinks to the test account (`the_shrinker_moves_the_call_to_the_test_account_when_it_can`) |
| Replay through the same relays | Replaying a run's steps with the same cast reproduces the failure (`a_sequence_replays_through_the_same_relays`) |
| Revert data with the sender field | A failing multi-sender `check_cast` decodes with `[sender: relay N]` in the report script |
| Relay semantics | The target sees the relay as the sender; an inner revert is reported as `false` and not propagated (two tests) |
| Too many relays | `Cast::deploy(4)` reverts with `TooManyRelays` |

## Findings

### 6. Budget exhaustion in the middle of a run (fixed)

The `OutOfBudget` check ran only when a run started. Multi-sender runs are
heavier, and 40 runs made the test halt with `OutOfGas` inside a run, with no
explanation. The check now runs before every call, in `fuzz` and in `replay`.

### 7. Three snapshots per call (fixed)

The multi-sender ERC-20 harness took a state snapshot before the call, one
after, and a third for the state invariants. The invariants now run on the
after-snapshot, saving a third of the view calls.

### 8. Generic generators were too sparse for two-party scenarios (documented)

See the honest notes in `docs/mutation.md`: the generic generators missed
mutants 2 and 9 with relays until harness-specific generators were written.

## Limits (8e)

- **Targets that reject contract callers.** A relay is a contract, so a target
  that requires `msg.sender` to be an EOA (an `extcodesize` or `tx.origin`
  check) will reject every relayed call. Fissure cannot test such a target with
  several senders. Not tried against such a contract.
- **Ether sent through a relay and rejected stays in the relay.** The relay
  itself succeeds (it only reports `false`), so the value the test account sent
  with that call is not refunded. It is bounded by the per-call maximum value
  that the runner already requires the test account to hold.
- **At most 3 relays**, so at most 4 senders.
- **Gas and memory.** A relayed call goes through two contracts: measured about
  1.65x the gas per call of a direct call on the ERC-20 (149k vs 90k, snapshots
  included). Fe never frees memory and a test has a fixed gas budget of 1e9
  (memory included), so multi-sender hunts get fewer calls per test. `OutOfBudget` is raised
  before the budget is gone.
- **Relays start empty**: no ether of their own and, for a token, no tokens;
  they receive tokens through transfers from the test account.
- **Seeds depend on the test account's and the relays' addresses** (they appear
  in generated address words). Equal in CI and locally here; not guaranteed
  across Fe versions or different test setups.
- **Not an independent review.** Written and checked by the author with AI
  assistance.

