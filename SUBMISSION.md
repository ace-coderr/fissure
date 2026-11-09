# Fissure: submission declarations

Fe Builders Challenge, submission deadline November 24, 2026, 23:59 UTC.

**Pitch:** Fissure is a stateful invariant-testing toolkit written in Fe: it turns a contract's `msg` types into random call sequences inside `fe test`, checks your invariants after every call, and shrinks any failure to a minimal sequence you can replay.

- Repository: https://github.com/ace-coderr/fissure
- License: Apache-2.0 (`LICENSE`)
- Manifest: `fe.toml` (ingot `fissure` 0.1.0)
- Fe version: **26.5.0** (`fe 26.5.0 (3dab95f)`), pinned as `FE_VERSION: v26.5.0` in `.github/workflows/ci.yml`

## Commit to review

The full SHA is entered in the submission form and is the head of `main` at
submission time. All library, test, contract and script code was last changed in
commit `CODE_SHA`; later commits change only
documentation. (Verify with `git diff CODE_SHORT HEAD --stat`.)

## Reproduction

```sh
# 1. Install Fe 26.5.0 (Linux/macOS; on Windows use WSL)
curl -fsSL https://raw.githubusercontent.com/argotorg/fe/master/feup/feup.sh | bash -s -- --version v26.5.0
fe --version            # fe 26.5.0 (3dab95f)

# 2. Clone, check, test, build
git clone https://github.com/ace-coderr/fissure && cd fissure
fe fmt --check
fe test                 # 51 tests pass
fe build

# 3. The demo (needs Node 18+): Fissure finds and shrinks the seeded bug
npm run demo
```

No deployment, accounts or network access are needed beyond downloading Fe.
Expected demo output is in `docs/demo.md`; the seed and the shrunk two-call
sequence are the same on every run.

## Declaration

### Pre-existing work

The [Fe Builders Challenge starter](https://github.com/fe-lang/builders-challenge-starter)
(upstream commit `f9d9aa9`), imported as commit **`0b15af8`** ("starter
baseline") with only two changes: the ingot renamed from `starter` to `fissure`,
and `.gitattributes` forcing LF line endings. It contains the time-locked vault,
three tests, the CI workflow, `LICENSE` and the submission template. Judges can
see exactly what existed before by checking out `0b15af8`.

Everything after that commit was written during the contest. The two demo
contracts adapt the starter vault: `src/vault_ok.fe` (renamed, otherwise the
starter's logic) and `src/vault_bug.fe` (the same plus one seeded bug).

### Third-party code

None copied. Algorithms implemented from their public descriptions: SplitMix
mixing constants in `src/prng.fe`, Keccak-256 in `scripts/fissure-report.mjs`.
The Fe standard library is used as a dependency, as any Fe project does.

### AI assistance

Claude (Anthropic) was used for code generation under the author's direction:
it wrote most of the Fe library, tests, contracts, Node script and documentation
from the author's task specification. The author reviewed and tested the results,
and can explain the code. The audit (`docs/audit.md`) was also performed with
Claude's help and has not been independently reviewed.

## Team

ace-coderr (single author).
