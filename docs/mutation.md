# Fissure on the Fe Guide's ERC-20: mutation testing

Target: the CoolCoin ERC-20 from The Fe Guide (`src/third_party/coolcoin.fe`,
third-party code, unmodified). Harness: `src/third_party/coolcoin/harness.fe`.
Mutants: `src/third_party/coolcoin/mutant.fe` (a copy of the contract with one
seeded bug per id, switched on by a constructor argument; id 0 is the control).
Tests: `mutation_tests.fe`, `fuzz_tests.fe`.

Reproduce:

```sh
fe test -f coolcoin          # unmodified contract: nothing found
fe test -f mutant_           # each mutant's verdict is asserted
fe build && fe test --show-logs -f mutant_ | node scripts/fissure-report.mjs out/CoolCoin.abi.json   # optional: the table below
```

Each hunt: 12 runs x 60 calls, seed 4242 (so a missed mutant had up to 720
calls, about 430 accepted by the contract).

## 7b: the unmodified contract

**Fissure found nothing** in the final run (10 runs x 60 calls, and 4 runs x 150
calls, 8 menu entries all reached). But the first runs reported "failures", and
all of them were bugs in **my harness**, not in CoolCoin:

1. A zero-amount `transferFrom` from an account that never approved anyone
   succeeds in CoolCoin (as in the ERC-20 standard). My invariant demanded the
   sender be `from`. Fixed: a zero amount must leave the state unchanged.
2. My conservation check rejected any balance above 2^128 as an "overflow guard",
   but minting 2^128 or more is legal. Fixed with an exact overflow-safe sum.

Fissure's shrinker made both easy to diagnose (one call each). Honest reading:
the invariants were written by the same author as the tool, and CoolCoin is a
small teaching contract that the guide says is unaudited, so "found nothing" is
weak evidence about CoolCoin. The mutants below test the harness itself.

Invariants (state read through view calls; snapshot of supply, 6 balances and 6
allowances before and after every call):

| Id | Invariant |
| --- | --- |
| 1 | sum of the known balances equals the total supply |
| 2 | the zero address never holds tokens |
| 3 | a call the contract rejects changes nothing |
| 4 | supply changes only through an accepted mint, burn or burnFrom |
| 5 | an accepted transfer / transferFrom moves exactly `amount` between the right accounts (nothing for a self-transfer) |
| 6 | approve sets, increaseAllowance adds and decreaseAllowance subtracts the allowance exactly |
| 7 | an accepted transferFrom / burnFrom reduces the allowance by exactly `amount` |
| 8 | an accepted mint raises supply and the recipient's balance by exactly `amount` |
| 9 | an accepted burn lowers supply and the burner's balance by exactly `amount` |

## 7c: mutants

| Mutant | The seeded bug | Verdict | Invariant | Calls -> shrunk | Replays |
| --- | --- | --- | --- | --- | --- |
| 0 | none (control) | clean, as it must be | - | - | - |
| 1 | `transfer` never debits the sender | **caught** | 5 | 6 -> 2 | 38 |
| 2 | spending exactly the whole allowance leaves it unchanged (boundary) | **caught** | 7 | 23 -> 2 | 32 |
| 3 | missing balance check in `transfer` | missed | - | - | - |
| 4 | `Transfer` event reports `amount + 1` | missed | - | - | - |
| 5 | `approve` adds to the old allowance instead of replacing it | **caught** | 6 | 9 -> 2 | 25 |
| 6 | `burn` does not reduce the total supply | **caught** | 9 | 1 -> 1 | 6 |
| 7 | `mint` to the zero address allowed | **caught** | 2 | 26 -> 1 | 15 |
| 8 | self-transfer credits on top of the old balance | **caught** | 5 | 6 -> 2 | 38 |
| 9 | `transferFrom` checks the allowance of the wrong party | missed | - | - | - |
| 10 | `mint` without the minter-role check | missed | - | - | - |
| 11 | transferring the whole balance credits one token too few | **caught** | 5 | 2 -> 2 | 355 |

**7 of 11 mutants caught (ids 1-11; id 0 is the control); 4 missed (3, 4, 9, 10).**

Failing run seeds (decimal; the first run of the hunt for mutants 1, 5, 6, 7, 8,
the same seed because every hunt starts from seed 4242):
`20893407965952772047992901519810815895700929490075850641830847030678997845439`;
mutant 2 (a later run):
`84366531804016946634958908134155884459387259397610247915749790515942478154389`;
mutant 11:
`1117798184784405972715213085125991812820217033468733304185044088532116826467`.

Shrunk sequences (A = the sender; all from `fe test --show-logs`):

- 1: `increaseAllowance(A, 1)`, `transferFrom(A, A, 1)`
- 2: `approve(A, 1)`, `transferFrom(A, A, 1)`
- 5: `increaseAllowance(A, 1)`, `decreaseAllowance(A, 0)`
- 6: `burn(1)`
- 7: `mint(0x0, 1)`
- 8: `increaseAllowance(A, 1)`, `transferFrom(A, A, 1)` (a self-transfer, asserted)
- 11: `approve(A, 2^160-1)`, `transferFrom(A, A, 1000)` (amount = the whole balance;
  the allowance is not minimal, see limits)

### Missed mutants, and why (single sender; mutants 9 and 10 are caught in step 8, below)

- **3, missing balance check: equivalent mutant.** Fe's checked arithmetic reverts
  on `from_balance - amount` underflow, so removing the `assert!` changes nothing
  observable. 432 calls accepted, same as the control. No black-box test can tell
  the two apart.
- **4, wrong event amount: not observable.** The harness reads contract state
  through view calls. Fissure has no way to inspect emitted logs inside a test.
- **9, wrong spender in `transferFrom`: needs a second sender.** With one sender,
  `from` is either the sender itself (then the wrong and the right spender are
  the same account) or an account that never approved anything (rejected either
  way). Distinguishing them needs a caller other than the owner.
- **10, mint without access control: needs a second sender.** The only sender is
  the owner, who holds the minter role. Multiple senders are the subject of the
  spike in [multi-sender-spike.md](multi-sender-spike.md) (not built).

### What this found about Fissure itself

The first mutation run reported "caught" for mutants 1, 8 and 11, but the shrunk
sequences ended with `transferFrom(..., to = address 1, ...)`: an address no
generator produces and no invariant knows. Those sequences failed because of
that address (conservation over the known accounts breaks), not because of the
seeded bug: the shrinker had drifted to a different failure with the same
invariant id. Fix: shrinking now asks each generator for simpler values
(`Generator::simpler`) that stay inside what the generator can produce. After
the fix mutant 8 shrinks to a genuine self-transfer, asserted in the test.

### Limits of this evidence

- 11 mutants chosen by the author, most of them the kind the invariants were
  written to catch. This shows the harness works, not that Fissure finds
  arbitrary bugs.
- Shrinking halves a word at most 12 times per round, so large values (mutant 11's
  allowance) are reduced, not minimised.
- One run per mutant with a fixed seed; no statistics over many seeds.

## Step 8: several senders (relay actors)

Calls can now come from the test account or from relay contracts
(`src/relay.fe`, `src/cast.fe`; see the README). The target sees a different
`msg.sender` for each. The same 11 mutants, a multi-sender harness
(`src/third_party/coolcoin/harness_multi.fe`, tests in `multi_tests.fe`): the test
account plus 2 relays, 25 runs x 60 calls, seed 4242.

| Mutant | Single sender | Two relays + test account |
| --- | --- | --- |
| 0 control | clean | clean |
| 1 transfer does not debit | caught (6 -> 2, #5) | caught (21 -> 1, #1) |
| 2 whole allowance not spent | caught (23 -> 2, #7) | caught (13 -> 2, #7) |
| 3 missing balance check | missed (equivalent) | missed (equivalent) |
| 4 wrong event amount | missed (no log access) | missed (no log access) |
| 5 approve adds | caught (9 -> 2, #6) | caught (18 -> 2, #6) |
| 6 burn keeps supply | caught (1 -> 1, #9) | caught (37 -> 1, #1) |
| 7 mint to zero address | caught (26 -> 1, #2) | caught (42 -> 1, #2) |
| 8 self-transfer mints | caught (6 -> 2, #5) | caught (21 -> 1, #1) |
| 9 wrong spender in transferFrom | **missed** (one sender) | **caught (55 -> 2, #7)** |
| 10 mint without access control | **missed** (one sender) | **caught (27 -> 1, #10)** |
| 11 full-balance transfer short | caught (2 -> 2, #5) | caught (32 -> 2, #1) |
| **Total** | **7 of 11** | **9 of 11** |

(`calls -> shrunk`, then the broken invariant id. The ids differ between the two
harnesses because they are different harnesses: the multi-sender one reports a
failed conservation check where the single-sender one reported a finer-grained
transfer check.)

The two new catches, shrunk (`root` is the test account, `relay 1` the first relay):

- 9: `root: increaseAllowance(root, 1)`, then `relay 1: transferFrom(from = root, to = relay 1, 1)`.
  The mutant checks the allowance of `from` instead of the caller, so the relay
  spends an allowance that was never granted to it.
- 10: `relay 1: mint(relay-or-actor, 0)`. A relay is not the minter and the call
  is accepted (invariant 10: only the test account may mint).

Still missed, unchanged: 3 (equivalent) and 4 (events are not observable).

### Honest notes on this result

- **I tuned after seeing misses.** With the generic `Holder`/`Amount` generators
  and 12 runs, mutants 2 and 9 were not found with relays: a spend has to match an
  earlier approval's amount, between different senders, which is rare. I then
  wrote harness-specific generators (`Party`: concentrate on the cast; `Tok`:
  mostly small repeated amounts) and raised the runs to 25. Mutants 9 and 10 were
  caught after that. That is a legitimate use of generators, and also the sort of
  adjustment that flatters a benchmark; the mutants were not chosen afterwards,
  but the generators were.
- Multi-sender hunts cost more gas (measured below), so each runs fewer calls
  per test.
- Allowances are only tracked between senders (the zero address and actors never
  send), to keep the snapshot small. An `approve` naming a non-sender spender is
  not checked for its allowance.

### Cost, measured

One run of 60 calls on the unmodified ERC-20, snapshots included:

| Mode | Gas per run | Gas per call |
| --- | --- | --- |
| single sender | 5.4 M | about 90 k |
| test account + 2 relays | 8.9 M | about 149 k (1.65x) |

A test has a fixed budget of 1 billion gas, memory included. The runner checks the
remaining gas before every call and stops with `OutOfBudget` instead of dying.

## Step 9: held-out evidence

### 9a. Freeze

Everything that produces or judges calls is frozen at commit
`1af440e4366f83b4fb60bf07d0eb7ee5cd7d0bc8`, before any new mutant was written:

| File | git blob (first 12) |
| --- | --- |
| `src/gen.fe` (generators) | `501b5a5164f8` |
| `src/menu.fe` | `35d2aceb276f` |
| `src/runner.fe` | `841359c4cfdc` |
| `src/shrink.fe` | `8bc18d86f020` |
| `src/third_party/coolcoin/harness.fe` (single-sender harness, generic generators) | `e7aaf196fdf5` |
| `src/third_party/coolcoin/harness_multi.fe` (multi-sender harness, tuned generators `Party` / `Tok`) | `96049865a197` |

Check with `git hash-object <file>` at any later commit. If a later commit changes
one of these files, this table says so below.

### 9b. New mutants, and my predictions (written before any run)

Six mutants of kinds not covered by 1-11, written after the freeze in
`src/third_party/coolcoin/mutant.fe` (ids 12-17), with the verdicts I expect from
reading the harnesses. They are committed before the first run so the order is on
record in git.

| Mutant | The seeded bug | Kind | Predicted: single, generic | Predicted: relays, generic | Predicted: relays, tuned |
| --- | --- | --- | --- | --- | --- |
| 12 | a transfer of more than 500 tokens credits one token too few | hidden fee on a value threshold | caught (amount > 500 occurs) | caught | caught |
| 13 | `approve` for the actor `0x1002` is silently not stored | one specific address mishandled | caught (single harness tracks every spender) | missed (multi harness tracks allowances between senders only) | missed |
| 14 | `decreaseAllowance` leaves one token too many | off-by-one in allowance arithmetic | caught | caught | caught |
| 15 | `mint` does not raise the total supply | supply bookkeeping | caught | caught | caught |
| 16 | `burnFrom` does not spend any allowance | missing authorisation | missed (needs a second sender) | caught if the generators produce the case | caught if produced |
| 17 | `increaseAllowance` overwrites instead of adding | wrong arithmetic in a helper | caught | caught | caught |

I have not run any of these when writing this table.

### 9b. Results (one run each, nothing retuned)

Same settings as step 8: seed 4242, 60 calls per run; one sender 12 runs, relays
25 runs. Tests: `src/third_party/coolcoin/heldout_tests.fe`. Output is
deterministic (identical across two default runs and `-O 2`).

| Mutant | One sender, generic generators | 2 relays, generic generators | 2 relays, tuned generators |
| --- | --- | --- | --- |
| 12 large transfer skims 1 token | caught (6 -> 2, #5) | caught (48 -> 1, #1) | caught (35 -> 1, #1) |
| 13 `approve` for actor `0x1002` dropped | caught (2 -> 1, #6) | **missed** | **missed** |
| 14 `decreaseAllowance` off by one | caught (9 -> 1, #6) | caught (9 -> 1, #6) | caught (59 -> 1, #6) |
| 15 `mint` forgets total supply | caught at deployment (0 calls, #1) | caught at deployment | caught at deployment |
| 16 `burnFrom` ignores the allowance | caught (5 -> 1, #7) | caught (16 -> 1, #7) | caught (12 -> 1, #7) |
| 17 `increaseAllowance` overwrites | caught (23 -> 2, #6) | caught (53 -> 2, #6) | caught (36 -> 2, #6) |
| **Caught** | **6 of 6** | **5 of 6** | **5 of 6** |

Shrunk sequences (ROOT is the test account): 12: `transfer(ROOT, 557)` (any
amount above 500 does it; shrinking does not reach 501); 14: `decreaseAllowance(ROOT, 0)`;
16: `burnFrom(ROOT, 1)`; 17: `approve(x, 1)` then `increaseAllowance(x, 0)`;
13 (single sender): `approve(0x1002, 1)`.

**Predictions against results.** Of my 18 predictions (6 mutants x 3 modes), 17
held and 1 did not:

- **Wrong: mutant 16, one sender.** I predicted it needed a second sender. It does
  not: the real contract requires an allowance even to burn your own tokens via
  `burnFrom`, so the mutant (which skips the allowance) is visible to a single
  sender as soon as it calls `burnFrom` on itself. My invariant 7 checks exactly
  that.
- Held as predicted: 13 caught with one sender and missed with relays (the
  multi-sender harness tracks allowances between senders only, a limit I had
  already documented); everything else caught.

**What the results do and do not show.**

- **Missed, with the reason: mutant 13 with relays, in both generator sets.** The
  multi-sender harness's snapshot omits allowances granted to non-senders (the
  zero address and the actors) to save view calls. The bug is only visible through
  such an allowance, so it is invisible to that harness whatever the generators
  do. This is a harness choice made in step 8, not a generator problem, and the
  single-sender harness, which tracks every spender, catches it.
- **Mutant 15 is caught before any call.** Its bug is in the constructor's
  initial mint, so the conservation invariant is broken on the freshly deployed
  contract. Fissure reports it (`0 calls`) but cannot shrink: a failure with an
  empty sequence is flagged `reproduced = false` by design, because the same
  symptom is how a leaky invariant looks (see the audit).
- **The tuned generators made no difference on these six.** The generic and the
  tuned sets give the same verdicts, with different sequences and lengths. The
  step-8 tuning mattered for mutants 2 and 9 (rare two-party chains); these
  mutants do not need it.
- **This is weak evidence.** Six mutants, written by the author who knows the
  harness: the mutants are of kinds the invariants were designed around, so a high
  catch rate is expected. The held-out part is only that the generators and
  harnesses were not changed after seeing these results.

### Re-check after the relay fix (code commit `468389e`)

The relay bug fixed in `468389e` (docs/audit.md, round 5) touched `src/relay.fe` and added
`src/calldata_tests.fe`; nothing else in `src/` changed since the previous code commit
`c5a7650`.

- **The six frozen files are unchanged.** `git hash-object` of each, at `468389e`, equals
  the table in 9a and equals the blob at the freeze commit `1af440e`
  (`501b5a5164f8`, `35d2aceb276f`, `841359c4cfdc`, `8bc18d86f020`, `e7aaf196fdf5`,
  `96049865a197`). `git diff 1af440e 468389e` over those six files is empty.
- **No result in this study changed.** The relay carries every multi-sender call, so
  the whole study was re-run at `468389e`: the decoded output of `fe test --show-logs -f mutant_`
  (241 lines: every seed, shrunk sequence, replay count and table) contains exactly the same
  lines as before the fix. Only their order differs, because tests run in parallel. The data
  generated for the project site from it is identical except for its provenance and the test
  count (114 to 119). The demo output (seed, 4 calls shrunk to 2, 19 replays) is identical.
- Why it could not matter: every message in the study has at most three static words,
  and the fix only changes calls to messages of more than three.

