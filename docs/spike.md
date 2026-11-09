# Spike: can call sequences be derived from `msg` types?

**Answer: yes, without reflection and without a hand-written trait per message.**
Path (a) works, in this form: Fe has no msg-level enum to iterate, but every `msg`
variant is its own struct implementing `core::message::MsgVariant<Sol>`, and that
is enough. Verified on Fe 26.5.0 (`3dab95f`) in `fe test`.

## What a `msg` block really is

```fe
msg VaultMsg {
    #[selector = sol("deposit()")]
    Deposit -> Timestamp,
    #[selector = sol("withdraw(address)")]
    Withdraw { to: Address } -> Wei,
}
```

`VaultMsg` is a namespace, not a type. Each variant desugars to a struct
(`VaultMsg::Deposit`, `VaultMsg::Withdraw`) implementing `MsgVariant<Sol>`
(`core/src/message.fe`), which carries `const SELECTOR` and `type Return`. The
variant also implements `Encode`/`Decode`, so `AbiSize::HEAD_SIZE` is available.
There is no way to ask "which variants does `VaultMsg` have".

## (a) Generic trait over msg variants: WORKS

Everything Fissure needs is reachable from a type parameter
`M: MsgVariant<Sol>`:

| Need | Source |
| --- | --- |
| selector | `<M as MsgVariant<Sol>>::SELECTOR` |
| number of static argument words | `<M as AbiSize>::HEAD_SIZE / 32` |
| the call itself | `evm.try_call_raw(addr:, gas:, value:, args:)` |

So a random call is `selector ++ N random words`, built with no `Encode` and no
per-message code. The callee's own decoder accepts or rejects the words, and
`try_call_raw` returns a `CallOutcome` instead of bubbling the revert, which is
what a fuzzer wants.

```fe
fn fire<M>(_ addr: Address, _ w0: u256, _ w1: u256, _ value: Wei) -> bool uses (evm: mut Evm)
    where M: MsgVariant<Sol>
{
    let size = <M as AbiSize>::HEAD_SIZE as usize
    var buf = MemBuffer::alloc(36 + size)   // slack: write_word needs 32 bytes
    let sel = <M as MsgVariant<Sol>>::SELECTOR
    buf.write_word(offset: 0, value: (sel as u256) << 224)
    if size >= 32 { buf.write_word(offset: 4, value: w0) }
    if size >= 64 { buf.write_word(offset: 36, value: w1) }
    buf.truncate(4 + size)
    evm.try_call_raw(addr: addr, gas: 200000, value: value, args: buf.span()).success()
}
```

### Enumerating the variants: a type-level list

Since a `msg` block cannot be enumerated, the user lists the variants once, as
a type. A cons list over types works, and recursion over it is resolved at
compile time:

```fe
struct Nil {}
struct Cons<H, T> {}

trait Menu {
    const LEN: u256
    fn fire_at(_ i: u256, _ addr: Address, _ w0: u256, _ w1: u256, _ value: Wei)
        -> bool uses (evm: mut Evm)
}
impl Menu for Nil {
    const LEN: u256 = 0
    fn fire_at(_ i: u256, _ addr: Address, _ w0: u256, _ w1: u256, _ value: Wei)
        -> bool uses (evm: mut Evm) { false }
}
impl<H, T> Menu for Cons<H, T> where H: MsgVariant<Sol>, T: Menu {
    const LEN: u256 = 1 + T::LEN
    fn fire_at(_ i: u256, _ addr: Address, _ w0: u256, _ w1: u256, _ value: Wei)
        -> bool uses (evm: mut Evm) {
        if i == 0 { fire<H>(addr, w0, w1, value) } else { T::fire_at(i - 1, addr, w0, w1, value) }
    }
}

type VaultCalls = Cons<VaultMsg::Deposit, Cons<VaultMsg::Withdraw, Cons<VaultMsg::BalanceOf, Nil>>>
```

A step is then plain data: `(variant index, value, words)`. That makes shrinking
type-agnostic (drop steps, move words toward zero) and replay trivial.

Selectors are also usable in `const` context
(`const S: u32 = <VaultMsg::Deposit as MsgVariant<Sol>>::SELECTOR`), so (c) works
too, but is not needed.

## (b) Hand-written trait per message: works, kept as an optional override

```fe
trait Arb<R: Draw> { fn arb(_ r: mut R) -> Self }
impl<R: Draw> Arb<R> for VaultMsg::BalanceOf {
    fn arb(_ r: mut R) -> Self { VaultMsg::BalanceOf { owner: Address::new(r.draw() % 4) } }
}
fn fire<M, R>(...) where M: MsgVariant<Sol> + Arb<R>, R: Draw { ... }
```

Generic functions with two trait bounds compile and run. It is the escape hatch
for a message whose arguments need a hand-shaped distribution.

## What does not work, and what to watch for

- **No msg-level enumeration.** `VaultMsg` is not a type; the user writes the
  `Cons` list. Using the namespace as a type parameter is accepted by
  `fe check` and only fails later, see `compiler-notes.md`.
- **Dynamic argument types.** For `bytes`, `string` and arrays only the head is
  generated, so the offset word is junk and the callee rejects the call. Fissure
  v1 targets static-size arguments and reports the accepted/rejected ratio so
  this is visible.
- **Decoding in the fuzzer aborts the test.** Decoding a random word into
  `VaultMsg::BalanceOf` with high bits set reverts the whole test, and that
  cannot be caught. Raw calldata avoids this: the callee decides.
- **Word pools matter.** Random 256-bit words are almost never valid addresses
  or bools. Words are drawn from a small pool (small integers, a few actor
  addresses, boundary values), so most calls decode.
- **Precompile addresses are a trap.** `Address::new(1)` is `ecrecover`; the
  vault's `send_value(gas: 0)` to it fails and looks like a bug. Actor pools
  must start above `0x9`.
- **No time or caller cheat codes** found in the std: timestamp and caller are
  fixed in `fe test`. Fissure fuzzes the one test account, and the seeded bug in
  the demo must be reachable without time travel.

## How failures can be reported

- A failing test shows its revert data as hex. `assert!(cond, "msg")` yields
  `Error(string)`; a custom `#[error]` struct yields a selector plus ABI words.
  Both are decodable by a small Node script.
- `--show-logs` prints events, but **only for passing tests** ("log (unavailable
  for failed tests)"). Reporting plan: a failing invariant reverts with an
  `#[error]` carrying seed, step and invariant id; and the demo test that
  *expects* the bug passes and emits the shrunk sequence as events, readable
  with `fe test --show-logs`.
- Output is hex. A script under `scripts/` (TypeScript/Node, not core) will
  pretty-print it.

## Decision

Build on (a). Keep (b) as an optional per-message override. Shape: steps are
`(index, value, words)`; the menu is a type-level list; calls go through
`try_call_raw`.
