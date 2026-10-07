# CURRENT_TASK.md

## Task
**Implement `.lst` listing output.**

## Scope (only what is relevant now)
- Produce a human-readable listing file (`<base>.lst`) in text mode (`"w"`) per ADR §1.
- Format (PDF "Listing File Format"): each line is an address followed by zero or one 32-bit value as 8 hex characters; optionally append the mnemonic/operand, and show labels as an address with no data.
- Lines that emit a word (instructions, `data`) show one value; `SET`, comments, blank lines, and label-only lines show no data value.
- For PC-relative branch instructions, resolve the target and, if a label exists at `LC + 1 + offset`, display that label name; otherwise display the raw offset (ADR §4C reverse lookup).
- Reuse the existing Pass 2 word generation; do not create a second encoding implementation.
- Do not produce a listing when assembly fails.
- Preserve `.o` output and all existing behavior.

## Out of scope (do not implement yet)
- Further `.o` changes (already implemented).
- Any other unrelated feature.

## Done When
- A valid source file produces a `<base>.lst` that reflects the emitted words and labels according to the spec format.
- Assembly that reports errors produces no listing file.
- `.o` output, parser, Pass 1, Pass 2, symbol resolution, `SET`, comments, 24-bit validation, and unused-label warnings are unchanged.
- Code compiles cleanly under the strict C89 flags.
