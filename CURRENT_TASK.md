# CURRENT_TASK.md

## Task
**Implement `.o` object-file output.**

## Scope (only what is relevant now)
- After Pass 2, write the assembled machine words to a binary object file.
- Open the object file in binary mode (`"wb"`) per ADR §1, so newline/EOF translation cannot corrupt bytes.
- Code starts at address zero: the first emitted word corresponds to `LC 0`.
- Write each generated 32-bit machine word for every emitted instruction and `data` directive.
- Do not emit a word for `SET` (it produces no machine word).
- Do not write an object file when `error_count > 0` (assembly failed).
- Reuse the existing Pass 2 word generation and error handling; do not redesign the parser or Pass 1.

## Out of scope (do not implement yet)
- `.lst` listing output (still not implemented).
- Unused-label warning changes (already implemented).
- Any other unrelated feature.

## Done When
- A valid source file produces a `.o` binary file containing the Pass 2 machine words.
- Assembly that reports errors produces no object file.
- Parser, Pass 1, Pass 2, symbol resolution, `SET`, comments, 24-bit validation, and unused-label warnings are unchanged.
- Code compiles cleanly under the strict C89 flags.
