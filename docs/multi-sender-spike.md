# Spike: can multiple senders be simulated with actor contracts?

**Answer: yes. A 20-line relay contract makes the target see a different caller.
Built in step 8 after approval: see `src/relay.fe`, `src/cast.fe` and the end of
`docs/mutation.md`. This page is the original spike report.**

## What was tried

A tiny contract that forwards `selector ++ three words` to a target with the
ether it was sent, and returns whether the target accepted the call:

```fe
pub msg RelayMsg {
    #[selector = sol("relay(address,uint256,uint256,uint256,uint256)")]
    Relay { target: Address, selector: u256, w0: u256, w1: u256, w2: u256 } -> bool,
}

pub contract Relay uses (ctx: Ctx, call: mut Call) {
    recv RelayMsg {
        #[payable]
        Relay { target, selector, w0, w1, w2 } -> bool uses (ctx, mut call) {
            var buf = MemBuffer::alloc(100)
            buf.write_word(offset: 0, value: selector << 224)
            buf.write_word(offset: 4, value: w0)
            buf.write_word(offset: 36, value: w1)
            buf.write_word(offset: 68, value: w2)
            buf.truncate(100)
            call.try_call_raw(addr: target, gas: 200000, value: ctx.value(), args: buf.span()).success()
        }
    }
}
```

In `fe test` (scratch project, not in this repository), with `vault_ok`:

- A `deposit()` sent through the relay with 1 ether was credited to the relay
  address, and the test account's balance stayed 0. The target saw the relay as
  `msg.sender`.
- A `withdraw` through the relay succeeded once and then returned `false` (the
  inner revert is caught by `try_call_raw` and reported, not propagated).

So: yes, several senders, each an ordinary contract address.

## How hard would it be to build in?

Roughly a day of work and a clear set of changes, no new language features:

1. **Relay actors**: `Relay` above is stateless, so a few of them can be
   deployed once per test and reused across runs and shrink replays. Their
   addresses need to be known to generators and invariants. Creating them with
   `create2` and fixed salts gives addresses that can be computed
   (`std::evm::crypto::create2_address`); a second deployment attempt would
   collide, so deployment must check first.
2. **A sender field on `Step`**: which actor makes the call. The runner calls
   the relay instead of the target, passing the target, selector and words.
   Generators get a `Sender`-picking slot; the shrinker gains one more thing to
   simplify (lowest sender index).
3. **Harness changes**: the "known accounts" list becomes the relay addresses
   (plus the test account). The ERC-20 snapshot would track a balance and an
   allowance per (owner, spender) pair, so it grows from 13 words to about 40.
4. **Accepted flag**: already works (the relay returns the inner success flag).

## What it would unlock

Mutants that are missed today for lack of a second sender:

- mutant 9 (transferFrom checks the wrong spender),
- mutant 10 (mint without access control),

and real multi-party bugs in general: access control, per-user accounting,
one user draining another, allowances between users.

## Risks and costs

- Each relayed call costs more gas and allocates more memory. Fe's allocator
  never frees, and `fe test` caps a test at 1e9 gas (memory), so the number of
  calls per test drops further (see `docs/audit.md`, memory limit).
- msg.value must be passed through the relay (done above), and a relay with
  an ether balance of its own would need funding; the spike avoided that by
  forwarding `msg.value`.
- Relay calls make the target's `msg.sender` a contract. A target that rejects
  contract callers (an `extcodesize` check) cannot be tested this way.
- Shrinking cost goes up with the larger snapshot.
