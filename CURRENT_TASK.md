# CURRENT_TASK.md

## Task
**Complete Pass 2 symbol resolution.**

## Scope (only what is relevant now)
- Numeric operands must continue to work exactly as they do today.
- Symbolic operands must be resolved through `SYMTAB` (look up the label's `address`).
- Undefined labels must produce an error (fatal: abort code output).
- Branch instructions require `Target - (LC + 1)` as the emitted operand.
- Preserve the current Parser / Pass 1 architecture; do not move validation between stages.
- Remove the redundant Pass 2 `inst == NULL` check, because parser validation already guarantees a valid mnemonic.
- Mark resolved symbols as used (`SYMTAB[i].used = 1`) when referenced.

## Out of scope (do not implement yet)
- File input/output (`.o`, `.lst`).
- `SET` handling.
- Unused-label warnings.
- Any other unrelated feature.

## Done When
- Numeric operands encode as before.
- Symbolic operands resolve correctly (including forward references set up by Pass 1).
- Undefined labels raise an error and prevent output.
- Branch instructions emit `Target - (LC + 1)`.
- Code still compiles cleanly under the strict C89 flags.
