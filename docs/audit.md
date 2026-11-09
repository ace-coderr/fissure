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


---

# Round 4 (step 9: held-out evidence and a claim-by-claim read)

No library code changed in this round. Results of the held-out mutants are in
`docs/mutation.md`; the files that produce and judge calls are unchanged since the
freeze (`git hash-object` of each file equals the table there).

## Claims in the README and SUBMISSION.md that were not backed, and fixed

- **"There is no Windows build of Fe 26.5.0."** False. The release has a
  `fe_windows_amd64.exe` asset. I had assumed it and never checked. Now the README
  says a Windows binary exists, that I used WSL instead, and that the Windows binary
  is untested with this repository.
- **"Deterministic across `-O 0`/default/`-O 2`."** Only true for the vault demo.
  The ERC-20 hunts were checked at default and `-O 2`; at `-O 0` one runs out of
  gas budget. The README now says exactly that.
- **A code excerpt with an outdated `fire` signature** (it gained a `via` argument
  in step 8). Updated and labelled as an excerpt.
- **Test count (96)**, "audited twice", the generator list (missing `Sender` and
  `Holder`), "give the test a large balance" (only needed when the menu attaches
  ether), "roughly 20000 / 3000 calls fit" (they fit; higher was not tested), and
  "a 300-line ERC-20" (it is a 368-line file including its own tests).
- **"A real ERC-20"** overstated what the target is: a small teaching contract
  from the Fe Guide. Reworded in the README and in these docs.
- **"The seed ... [is] the same on every run"** reworded to "in every run I made,
  locally and in CI".

## Findings from the held-out run

- Mutant 15 (the mint that forgets total supply) is in the constructor's initial
  mint, so it breaks the invariant before any call. It is caught, but a failure
  with an empty sequence is reported as `reproduced = false` by design (it looks
  the same as a leaky invariant), so it cannot be shrunk. The held-out test
  asserts "found, and either replays or broke at deployment".
- One of my 18 predictions was wrong (mutant 16 with one sender is caught, not
  missed).

## Checks

| Concern | Result |
| --- | --- |
| Generators and harnesses unchanged since the freeze | The six frozen files hash to the values recorded before the held-out mutants were written |
| Held-out results deterministic | Identical across two default runs and `-O 2` |
| CI equals local, final head | The decoded output of both mutation suites and the held-out table (206 lines) is identical in the CI log and locally; the demo seed and replay count match |
| Fresh clone from GitHub, in WSL, at head `17416e5` (114 tests then; 119 since round 5) | `fe fmt --check` clean; `fe test`: 114 passed, 0 failed; `fe build`: 15 artifacts written; the 4 demo tests pass; no file modified by build or test |
| Rules | All 22+ commits use the noreply identity; no co-author or "generated with" lines; no `.claude/` or other tooling files tracked; no personal paths or addresses in tracked files |

---

# Round 5 (calldata bytes and the relay)

A question about `fire()`: are any bytes of the calldata buffer ever left unwritten,
and does `MemBuffer::alloc` zero its memory?

## Answers

- **`MemBuffer::alloc` zeroes its memory** in Fe 26.5.0: it is `alloc_uninit` followed by
  an explicit `zero_bytes` (`core/src/ptr.fe`). `alloc_returns_zeroed_bytes_for_awkward_lengths`
  checks lengths 0, 1, 4, 31, 32, 33, 36, 63, 100, 131 and 1000;
  `zero_bytes_clears_exactly_its_range` checks that zeroing 33 bytes clears byte 32 and
  leaves byte 33. Fe's allocator never frees, so a test cannot hand `alloc` a dirty
  region: the zeroing guarantee rests on the source plus those boundary checks.
- **No calldata byte of a direct `fire()` is left unwritten.** The buffer is zeroed at
  `36 + size` bytes, the selector and the three words are written, and it is truncated to
  `4 + size`. A static `HEAD_SIZE` is always 0, 32, or a sum or product of those (checked in
  the std and core source), so a size that is not a multiple of 32 cannot occur; if it did,
  the leftover bytes would be zero. Words beyond the third are zero, as the README says
  (`a_direct_call_delivers_the_words_and_zeros_after_them`, with 4 and 5 word messages).

## Finding 9 (real bug, fixed): relayed calls to messages of more than three words always failed

`src/relay.fe` capped the calldata size at 96 bytes (`if len > 96 { len = 96 }`) before
truncating to `4 + len`. A message of four or more static words reached its target
with too little calldata, and the target's decoder rejected it. Direct calls were fine
(they send the full `4 + size` bytes, zero-filled past the third word). The relay
reported `false`, so nothing crashed: such calls were silently counted as rejected.

- **Impact on published results: none.** Every vault and ERC-20 message has at most
  three words (`transferFrom` is the widest), so no mutation, held-out or demo result
  changes. A multi-sender run against a message of more than three words would have
  silently lost all its relayed calls to it, and `check` would not have flagged it
  (the direct sender still gets the entry accepted).
- **Fix:** the buffer is `132 + size` bytes (at least 100, so the three word writes
  always fit) and is truncated to `4 + size`; `size` is no longer capped.
- **Tests** (`src/calldata_tests.fe`, with a probe contract that stores every word it
  decodes): `a_relayed_call_is_accepted_for_every_message_size` and
  `a_relayed_call_delivers_the_same_words_as_a_direct_one`, for messages of 0 to 5 words.
  Both fail on the previous `relay.fe` and pass now. The 114 earlier tests are unchanged
  and still pass (119 in total).

