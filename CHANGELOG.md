# CHANGELOG.md

Record of completed assembler work (oldest first).

## Completed
- Parser implemented (`parse_line`) producing `struct ParsedLine` records in `Program[]`.
- Parser validates label syntax, mnemonic against `OPTAB`, operand count, numeric-looking operands, and trailing text.
- Pass 1 implemented (`pass1`): assigns `location_counter` and registers labels.
- Symbol table implemented (`SYMTAB`, `add_symbol`, duplicate detection, `print_symtab`).
- Location counters implemented (increment per instruction / `data` word).
- Pass 2 basic numeric encoding implemented (opcode bit-packing for numeric operands).
- Pass 2 symbol resolution implemented: operands resolved through `SYMTAB`, undefined labels are fatal errors, resolved symbols marked `used`.
- PC-relative branch offsets implemented for `br`, `brz`, `brlz`, `call` as `Target - (LC + 1)`.
- `SET` directive implemented: `label: SET value` assigns the value to the label and consumes no word.
- Parser validation added: `SET` must have a label on the same line (`SET 25` is a syntax error).
- Semicolon comment handling added to the parser (everything from `;` to end of line ignored).
- Signed 24-bit instruction operand validation added (`-8388608..8388607`), applied after branch adjustment and before encoding; `SET` and `data` are excluded.
- Unused-label warnings implemented (non-fatal; iterate `SYMTAB` where `used == 0`).
- Real `.asm` source-file input via command line (`asm <file>`), read line by line with `fgets` and fed to `parse_line`; `asm --test` runs the built-in suite.
- Built-in regression test suite (tests A–N) covering parser errors, symbol resolution, `SET`, comments, range validation, and warnings.
- `.o` object-file output implemented: `asm <file>` writes `<file>.o` containing the same 32-bit machine words as Pass 2 (one word per instruction/`data`, none for `SET`/labels/comments), opened in binary mode (`"wb"`) as little-endian bytes. The file is removed if assembly fails.

## Next Step
- Implement `.lst` listing output. See `CURRENT_TASK.md`.
