# Fissure

**Pitch:** Fissure is a stateful invariant-testing toolkit written in Fe: it turns a contract's `msg` types into random call sequences inside `fe test`, checks your invariants after every call, and shrinks any failure to a minimal sequence you can replay.

**Site:** https://fissure-fe.netlify.app (the real failing run shrunk on screen, and every mutant, caught or missed; generated from this repository's own test output, see `docs/site-audit.md`).

## The problem

Unit tests check the paths their author thought of. Contract bugs usually live in
the paths nobody thought of: a particular amount, a particular order of calls, an
edge value like exactly 1 wei. Stateful invariant testing (random call sequences
plus properties that must always hold) finds those, but it normally means
leaving the language: a separate tool, a separate test language, separate
configuration. Fe has no such tool yet.

## Approach

Fissure runs inside `fe test`, in Fe, with no external tooling.

1. You list the contract's messages once, as a type, and name a generator for
   the value and for each argument.
2. Fissure deploys a fresh contract, makes N random calls from a seed, and calls
   your `check` function after every call. `check` is a plain Fe function that
   returns 0 if every invariant holds, or the id of the one that broke.
3. On a failure it replays candidates on freshly deployed contracts to shrink the
   sequence: it drops calls, then simplifies values and arguments, and keeps a
   candidate only if the same invariant still breaks.
4. It reports the seed, the shrunk calls and the broken invariant.

Built during the contest: everything under `src/` except the vault's original
logic, plus `scripts/`, `docs/` and the project site in `site/` (see Declaration).

## Fe highlight

**A `msg` variant is a type, so a random call can be built generically, with no
reflection and no per-message code.**

In Fe every `msg` variant is its own struct implementing
`core::message::MsgVariant<Sol>` (selector as an associated const) plus
`AbiSize` (static argument size). A function generic over `M: MsgVariant<Sol>`
can therefore build `selector ++ argument words` for any message:

```fe
impl<M, V, A0, A1, A2> Entry for Call<M, V, A0, A1, A2>
where M: MsgVariant<Sol>, V: Generator, A0: Generator, A1: Generator, A2: Generator
{
    // excerpt: the direct-call path (`via` names a relay for multi-sender runs)
    fn fire(_ target: Address, _ gas: u256, _ step: Step, _ via: u256) -> bool
    uses (evm: mut Evm) {
        let size = <M as AbiSize>::HEAD_SIZE as usize
        var buf = MemBuffer::alloc(36 + size)
        let sel = <M as MsgVariant<Sol>>::SELECTOR
        buf.write_word(offset: 0, value: (sel as u256) << 224)
        if size >= 32 { buf.write_word(offset: 4, value: step.w0) }
        // ...
        buf.truncate(4 + size)
        evm.try_call_raw(addr: target, gas: gas, value: wei(step.value), args: buf.span()).success()
    }
}
```

A `msg` block cannot be enumerated, so the menu is a type-level list that the
compiler recurses over (`Cons<H, T>` / `Nil`, with `const LEN = 1 + T::LEN`).
The callee's own decoder accepts or rejects the words, and `try_call_raw`
returns the outcome instead of bubbling a revert, so a bad call is data, not a
crashed test. `docs/spike.md` records how this was found and what else was tried.

## Technical quality

- **Deterministic.** All randomness comes from a seeded PRNG written in Fe
  (`src/prng.fe`). The same seed gives the same calls. Checked: the vault demo is
  identical across repeated runs and `-O 0` / default / `-O 2`; the ERC-20 results
  (single- and multi-sender, mutants and held-out) are identical across repeated
  runs and default / `-O 2` (at `-O 0` one hunt runs out of gas budget); and the
  demo and ERC-20 output of CI equals a local run line for line (`docs/audit.md`).
- **Explicit effects.** Anything touching the chain declares
  `uses (evm: mut Evm)`; randomness is a value threaded by `mut`, never ambient.
- **Generic with bounds.** `Generator`, `Entry`, `Menu` and `Harness` are traits;
  the runner is `fuzz<H: Harness>(...)`.
- **Shrunk results are verified.** Every kept candidate, and the final result, is
  replayed on a fresh deployment and must still break the same invariant.
- **Guards against false confidence.** `check` refuses to pass if no call was
  accepted (`Vacuous`), if a menu entry was never accepted (`Unreached`), if the
  menu is empty (`EmptyMenu`), if the sender cannot afford the run
  (`Underfunded`), or if the test is running out of gas (`OutOfBudget`).
- **Audited in three rounds.** `docs/audit.md` lists what was tried to break it,
  the genuine bugs found and fixed (seeds that did not reproduce; a shrinker that
  drifted to a different failure; budget exhaustion without a message), and what
  remains unfixed.
- **Tried on a third-party ERC-20 with seeded bugs.** The Fe Guide's ERC-20 has
  11 mutants: 7 caught and shrunk to 1-2 calls with one sender, 9 of 11 with
  several senders, 2 missed for stated reasons; plus 6 held-out mutants
  (`docs/mutation.md`, and the honesty section below).
- **119 Fe tests**, `fe fmt --check` clean, CI green.

## Originality

Invariant testing and shrinking are established ideas (Echidna, Foundry's
invariant tests, property-based testing generally); Fissure does not claim them.
What is new here is doing it natively in Fe and inside `fe test`: calls derived
from Fe's `msg` types through `MsgVariant`, a deterministic PRNG and generators
written in Fe, and shrinking on plain-data steps. Names and API are our own; no
other tool's code or API was copied.

## Usefulness

Anyone writing a Fe contract can add stateful testing next to their unit tests:
write the harness (deploy, menu, `check`), run `fe test`. The included demo shows
the shape of bug it targets: a vault that is correct on every path except a
1-wei deposit made while the account already has a balance. Fissure finds it
and reduces the failing run to the two calls that matter. A measured example of
why typed generators matter: on the correct vault, plain small-integer arguments
revert 67.2% of calls; typed generators revert 13.0%, and the rest are the
contract's own guards (`docs/revert-rate.md`). On an ERC-20 (the Fe Guide's
CoolCoin, third-party and a small teaching contract) Fissure found nothing in the unmodified contract (after
I fixed two mistakes in my own invariants), and with 11 seeded bugs it caught 7
with one sender and 9 with several senders (relay contracts); the 2 it misses are
one equivalent mutant and one wrong event. On 6 further mutants written after the
generators were frozen it caught 6 with one sender and 5 with relays
(`docs/mutation.md`). Small evidence; see the honesty section below.

## Documentation and demo

The primary way to reproduce everything is `fe test`. No deployment, no network,
no Node:

```sh
fe test                 # every test, including the demo, must pass
fe test -f demo_ --show-logs   # the demo, with the raw events it emits
```

The demo test `demo_vault_bug_is_found_and_shrunk` (`src/demo_tests.fe`) runs
Fissure against `vault_bug` and **asserts** what it finds: the invariant breaks,
the failing run is shrunk to exactly two `deposit()` calls, each sending exactly
1 wei, and the shrunk sequence still fails when replayed. It passes only if
Fissure finds the seeded bug. `demo_vault_ok_finds_nothing` is its counterpart
on the correct vault. `--show-logs` prints the report as raw event data (hex).

Optional: a Node script decodes that data into text (`npm run demo`, Node 18+):

```
demo_vault_bug_is_found_and_shrunk: FISSURE FOUND A FAILURE
  seed 63943086030706054941702419180308291968568539214185280263325138216467852686274   broken invariant #1
  4 calls shrunk to 2 in 19 replays
    1. deposit()  value=1 wei   words=[0, 0, 0]
    2. deposit()  value=1 wei   words=[0, 0, 0]
```

Also in `docs/`: [demo.md](docs/demo.md), [spike.md](docs/spike.md) (the design
question and the answer), [revert-rate.md](docs/revert-rate.md),
[mutation.md](docs/mutation.md) (Fissure against the Fe Guide's ERC-20: 11 mutants, then 6 held-out ones),
[audit.md](docs/audit.md), [multi-sender-spike.md](docs/multi-sender-spike.md),
[compiler-notes.md](docs/compiler-notes.md).

### Using it

```fe
use ingot::gen::{Actor, Pay, Zero}
use ingot::hunt::check
use ingot::menu::{Call0, Call1, Cons, Nil}
use ingot::runner::{Config, Harness}

type Calls = Cons<
    Call0<VaultMsg::Deposit, Pay>,                 // payable, no arguments
    Cons<Call1<VaultMsg::Withdraw, Zero, Actor>, Nil>, // one address argument
>

struct MyVault {}

impl Harness for MyVault {
    type Calls = Calls

    fn deploy(_ salt: u256) -> Address uses (evm: mut Evm) {
        evm.create<MyContract>(value: Wei::zero(), args: (Duration::zero(),))
    }

    // 0 = all invariants hold; otherwise the id of the one that broke.
    fn check(_ target: Address) -> u256 uses (evm: mut Evm) {
        // `owed` is your own helper, e.g. a view call to the contract.
        if evm.balance(target) != owed(target) { return 1 }
        0
    }
}

#[test(balance = 1_000_000_000_000_000_000_000_000_000_000)]
fn vault_keeps_its_promise() uses (evm: mut Evm) {
    let _ = check<MyVault>(Config { seed: 1, steps: 80, gas: 300000 }, 50)
}
```

Several senders: deploy a cast of relay contracts and use the `_cast` entry
points; each call is then made by the test account or a relay, chosen from the
seed, and the target sees a different `msg.sender`:

```fe
let cast = Cast::deploy(2)   // two relays; at most 3
let _ = check_cast<MyVault>(Config { seed: 1, steps: 60, gas: 400000 }, 25, cast)
```

A multi-sender harness overrides `snapshot_with`, `check_step_with` and
`aim_with` to see the cast's addresses (`Cast::account(i, root)`), and the
generators `Sender` / `Holder` name the acting sender and the cast's accounts.
Failing steps carry `who` (0 the test account, `1..` the relays).

A failing `check` reverts with `Failure` (seed, invariant, shrunk calls); decode
it with `fe test --show-logs | node scripts/fissure-report.mjs`. Rules for a
harness: if the menu attaches ether (`Pay`), give the test a large `balance` (Fissure
checks); read only the
target's own state in `check`; prefer `evm.create` over `create2` (a repeated
salt collides). Generators: `Zero`, `SmallWord`, `Flag`, `Actor`, `Sender`,
`Holder`, `UpTo<MAX>`, `Amount` (aims at the target's current balance: 0, 1,
balance, balance +/- 1, max) and `Pay` (value to attach); you can write your own
(`Generator`).

## Architecture

| File | Role |
| --- | --- |
| `src/prng.fe` | `Draw` trait and `Prng`: seeded, deterministic, `below`/`between` total |
| `src/gen.fe` | `Generator` trait and the generators; `Env` is what a generator may see |
| `src/menu.fe` | `Step` (one call as plain data), `Call<..>` entries, the `Cons`/`Nil` menu |
| `src/runner.fe` | `Harness` trait, `fuzz` (random run), `replay` (concrete steps), guards |
| `src/shrink.fe` | the shrinker: cut after failure, drop chunks, simplify words |
| `src/hunt.fe` | many seeds, shrink the first failure, events and `Failure` error, `check` |
| `src/vault_ok.fe`, `src/vault_bug.fe` | the demo contracts |
| `src/relay.fe`, `src/cast.fe` | several senders: a stateless relay contract and the `Cast` of up to 3 of them |
| `src/third_party/coolcoin.fe` | the Fe Guide's ERC-20, **third-party, unmodified logic** |
| `src/third_party/coolcoin/` | our harnesses (single- and multi-sender), invariants, 11 mutants and tests for them |
| `src/*_tests.fe` | unit tests, demo tests, audit regressions |
| `scripts/fissure-report.mjs` | Node: decodes events and errors from `fe test` output (docs tooling only) |
| `site/` | the project site (Vite, React, TypeScript): no Fe code; every number on it is generated from this repository's own test output and docs (`docs/site-audit.md`) |

## Build and test

```sh
fe --version   # fe 26.5.0 (3dab95f)
fe fmt --check
fe test
fe build
npm run demo   # optional: decodes the demo's events; needs Node 18+
```

Exact Fe version: **26.5.0** (`3dab95f`), pinned in `.github/workflows/ci.yml`.
Install: `curl -fsSL https://raw.githubusercontent.com/argotorg/fe/master/feup/feup.sh | bash -s -- --version v26.5.0`.
A Windows binary exists among the v26.5.0 release assets, but I did not use or
test it: development was on Windows through WSL (Ubuntu), and CI runs on
`ubuntu-latest`. Whether this repository works with the Windows binary is untested. Only Fe and (for the demo script) Node are
needed; the library has no dependencies.

## Honesty: what the evidence does and does not show

- **The mutation results are small and author-made.** The target is a 368-line
  file (the contract plus its own three tests): a teaching ERC-20 from the Fe Guide (third-party, unaudited by its own words).
  The 11 mutants of step 7 and the 6 of step 9 were written by the same person who
  wrote the invariants, so they are of kinds the invariants were built around.
- **The generators were tuned after I saw misses.** With relay senders and the
  generic generators, two mutants (2 and 9) were not found, because they need a
  spend to match an earlier approval's amount between different senders. I then
  wrote harness-specific generators (`Party`, `Tok`) and raised the runs from 12
  to 25, and both were caught. The mutants were not chosen afterwards, but the
  generators were, so the 9-of-11 figure is partly fitted.
- **Held-out check.** I then froze the generators and harnesses (commit
  `1af440e`, file hashes in `docs/mutation.md`), wrote six new mutants of other
  kinds, committed my predictions before the first run, and ran them with the
  generic generators and with the tuned ones, without retuning. Results: with one
  sender 6 of 6 caught; with two relays, 5 of 6 under either generator set. The
  one miss (mutant 13) comes from a harness choice (allowances to non-senders are
  not tracked), not from the generators. One of my 18 predictions was wrong. The
  tuned generators made no difference on these six. One of the six (mutant 15) is
  caught at deployment, before any call, and cannot be shrunk.
- **What this supports, and no more:** the harness, the shrinker and the relay
  machinery work as designed on a contract of this size. It does not show that
  Fissure finds bugs in contracts it has not been shaped around.
- **Nobody else has reviewed any of it.** The audits (`docs/audit.md`) were done
  by the author with AI assistance.

## Limitations

- Static argument types only; at most three generated argument words per call.
  Dynamic types (`bytes`, `string`, arrays) get only a zero head word, so they
  are not generated meaningfully (not yet tried on a contract that takes one).
- No time travel: `fe test` has no time cheat code, so bugs that need time to
  pass are out of reach. Several senders are possible with relay contracts
  (`Cast::deploy`, `hunt_cast`; at most 3 relays), but a relay is a contract, so
  a target that rejects contract callers cannot be tested that way, and a relayed
  call costs about 1.63x the gas of a direct one (about 147.7k vs 90.7k per call on
  the ERC-20, measured at `468389e`; `docs/mutation.md`, "Cost, measured"). The demo
  vault uses a zero lock period for this reason.
- You list the messages yourself; `msg` blocks cannot be enumerated.
- Shrinking is greedy: results are locally minimal, not proven globally minimal.
- Invariants must depend only on the target contract's state; Fissure detects
  the common leak (an invariant failing on a fresh target) but cannot detect all.
- `fe test` shows logs only for passing tests, so a failing test carries its
  report in revert data (hex), decoded by the Node script; there it labels calls
  by menu index, not function name.
- Invariants cannot see emitted events, so a wrong event is invisible to them.
- A test has a fixed gas budget and Fe never frees memory: 20000 vault calls
  and 3000 ERC-20 calls each fit in one run (I did not test higher), fewer in a
  long hunt, and fewer at `-O 0`. Fissure stops with `OutOfBudget` before running dry.
- Seeds are reproducible in the same environment; for harnesses that name the
  sender (`Sender`, `Holder`) the generated words include the test account's
  address.
- Shrinking compares invariant ids only, so dropping calls can still land on a
  different cause behind the same id; word values are reduced, not minimised.
- The PRNG is chosen for determinism, not tested for statistical quality.
- Only the default EVM test backend is supported (native tests cannot use
  balances or logs).
- Tested on the two demo vaults, one third-party ERC-20 with 17 mutants, and unit
  tests; not on a large real-world contract. The audits were done by the author
  with AI assistance and have had no independent review.

## Declaration

- **Pre-existing work:** the Fe Builders Challenge starter
  ([builders-challenge-starter](https://github.com/fe-lang/builders-challenge-starter),
  upstream commit `f9d9aa9`), imported unchanged as commit `0b15af8`
  ("starter baseline"), with only the ingot renamed to `fissure` and LF line
  endings enforced. It contains the time-locked vault, its three tests, the CI
  workflow, the license and the submission template. Everything else was written
  during the contest.
- **Third-party code:** the Fe Guide's CoolCoin ERC-20
  (`src/third_party/coolcoin.fe`, https://fe-lang.org/examples/erc20/, Fe
  project; the page states no license, the Fe repository is Apache-2.0), copied
  with only a header and `fe fmt`; `src/third_party/coolcoin/mutant.fe` is a
  derivative of it. `vault_ok.fe` adapts the starter vault and `vault_bug.fe`
  adapts that. The PRNG uses the published SplitMix mixing constants; the
  Keccak-256 in the Node script is our implementation of the public algorithm.
- **AI assistance:** see [SUBMISSION.md](SUBMISSION.md).

## Team

Built by [ace-coderr](https://github.com/ace-coderr).

## License

Apache-2.0 (see `LICENSE`).
