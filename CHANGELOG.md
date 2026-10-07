# CHANGELOG.md

Record of completed assembler work.

## Completed
- Parser implemented (`parse_line`), producing `struct ParsedLine` records in `Program[]`.
- Parser validates mnemonic against `OPTAB`.
- Parser validates operand count (`requires_operand`).
- Parser validates numeric-looking operands via `strtol` endptr (`is_valid_number`).
- Parser detects extra text after the operand.
- Parser validates label syntax and detects invalid label names.
- Pass 1 implemented (`pass1`): assigns `location_counter` and registers labels.
- Symbol table implemented (`SYMTAB`, `add_symbol`, duplicate detection, `print_symtab`).
- Location counters implemented (increment per instruction / `data` word).
- Pass 2 basic numeric encoding implemented (opcode bit-packing for numeric operands).

## Next Step
- Symbolic resolution in Pass 2 (resolve operands through `SYMTAB`, error on undefined labels, branch offset `Target - (LC + 1)`). See `CURRENT_TASK.md`.
