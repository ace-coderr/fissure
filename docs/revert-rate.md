# Revert rate on vault_ok: untyped vs typed generation

Question: if most generated calls revert, sequences never reach deep states. How
bad is it with plain small-integer arguments, and what does typed generation fix?

Setup: `vault_ok` (lock period 0), seed 1, 400 calls, both runs make the same
variant choices (99 / 86 / 94 / 121 calls), only the arguments and attached value
differ. Reproduce:

```sh
fe test --show-logs -f rate_
```

(`rate_untyped` and `rate_typed` in `src/vault_ok_fuzz_tests.fe`; each emits one
`Rate { variant, calls, accepted }` event per message.)

| Message | Untyped reverts | Typed reverts |
| --- | --- | --- |
| `deposit()` | 22.2% (22/99) | 11.1% (11/99) |
| `withdraw(address)` | 79.1% (68/86) | 47.7% (41/86) |
| `balanceOf(address)` | 81.9% (77/94) | 0.0% (0/94) |
| `unlockTime(address)` | 84.3% (102/121) | 0.0% (0/121) |
| **All calls** | **67.2% (269/400)** | **13.0% (52/400)** |

Accepted `withdraw` calls (the deepest state transition) went from 18 to 45.

## Why the untyped baseline reverts

- The baseline attaches a random 0..3 wei to every call. `balanceOf` and
  `unlockTime` are not payable, so a non-zero value should revert them (inferred, not isolated by a separate run): that is likely
  most of their 80%+.
- `withdraw(to)` with `to` in `0..3` hits address 0 or the precompiles `1..3`.
  The vault sends with zero gas, which a precompile cannot serve (inferred).
- A random word is almost never a funded or meaningful value.

## What typed generation changes

Each menu entry names a generator for the value and for each argument word
(`Call1<Withdraw, Zero, Actor>`): `Zero` value for non-payable calls, `Actor`
addresses above the precompile range, `Pay` (up to 10 ether) with
boundary values (0, 1 wei, 1 ether, 10 ether). `Amount` aims at the contract's
current balance (0, 1, balance, balance-1, balance+1, max) for amount arguments;
the vault has no amount argument, so it is unit-tested but unused here.

## What still reverts, and why that is correct

The remaining 13% are guards doing their job: `deposit` with value 0 ("Nothing to
deposit", 11 calls) and `withdraw` with an empty balance ("Nothing to withdraw").
A fuzzer cannot, and should not, remove those. Raising the rate of accepted
`withdraw` further needs sequence-aware weighting (deposit first), which is not
implemented.
