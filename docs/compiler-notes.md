# Compiler notes (Fe 26.5.0, 3dab95f)

Observations only. Nothing has been reported upstream.

## 1. A `msg` namespace used as a type is accepted by `fe check`, then fails in MIR lowering

`VaultMsg` (the `msg` block name) is a namespace, not a type, yet it passes
type-checking as a generic argument. The error only appears when the function is
reachable from a test, and it is an internal message instead of a source
diagnostic.

```fe
use ingot::VaultMsg           // msg VaultMsg { ... } from the starter vault
use std::abi::sol::Sol
use core::message::MsgVariant

fn takes<M: MsgVariant<Sol>>() {}
fn bad() { takes<VaultMsg>() }

#[test]
fn t() { bad() }
```

- `fe check`: no output (passes).
- `fe test`: `Failed to emit test Sonatina: MIR lowering failed: unsupported while
  lowering 'bad': semantic borrow checking failed ... blocked by upstream causes:
  [InvalidExpr(ExprId(0)), InvalidExpr(ExprId(1))]`
- Expected: a normal "not a type" or "trait bound not satisfied" diagnostic at
  the call site.
- If `bad` is not reachable from a test, no error is produced at all.

## 2. Not a bug, but a trap: `fe fmt --check` on CRLF checkouts

On Windows with `core.autocrlf=true`, `fe fmt --check` reports every file as
different. The repo ships `.gitattributes` (`* text=auto eol=lf`).
