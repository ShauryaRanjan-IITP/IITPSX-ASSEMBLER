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
- PC-relative branch offsets implemented for `br`, `brz`, `brlz`, `call`: a symbolic operand emits `label_address - (LC + 1)`.
- `SET` directive implemented: `label: SET value` assigns the value to the label and consumes no word.
- Parser validation added: `SET` must have a label on the same line (`SET 25` is a syntax error).
- Semicolon comment handling added to the parser (everything from `;` to end of line ignored).
- Signed 24-bit instruction operand validation added (`-8388608..8388607`), applied after branch adjustment and before encoding; `SET` and `data` are excluded.
- Unused-label warnings implemented (non-fatal; iterate `SYMTAB` where `used == 0`).
- Real `.asm` source-file input via command line (`asm <file>`), read line by line with `fgets` and fed to `parse_line`; `asm --test` runs the built-in suite.
- Built-in regression test suite (tests A–N) covering parser errors, symbol resolution, `SET`, comments, range validation, and warnings.
- `.o` object-file output implemented: `asm <file>` writes `<file>.o` containing the same 32-bit machine words as Pass 2 (one word per instruction/`data`, none for `SET`/labels/comments), opened in binary mode (`"wb"`) as little-endian bytes. The file is removed if assembly fails.
- `.lst` listing output implemented: `asm <file>` writes `<file>.lst` in text mode (`"w"`) during Pass 2 using the preferred PDF format (word rows `%08X %08X %s [operand]`, label rows `%08X          %s:`). Label + instruction lines emit a label row then a word row at the same LC; `SET` emits a label row using its assigned value; non-branch operands show the source text; PC-relative branches reverse-resolve the target to a label (`find_label_at_address`), else print the numeric offset. The already-computed machine word is reused. Both `.o` and `.lst` are removed if assembly fails.
- `.lst` branch-display fix: `branch_listing_operand` now prefers the original source label when it points at the computed branch target (fixes `label:` + `start:` + `br start` listing as `br label`); the address-based lookup remains the fallback. Added regression tests O/P/Q (source-label preference, numeric target with a label, numeric target with no label).
- Branch semantics corrected to match the PDF: PC-relative operands are offsets. A symbolic operand resolves to its label address and emits `label_address - (LC + 1)`; a numeric operand is emitted as-is, so `br 7` encodes offset 7 (previously `(LC+1)` was wrongly subtracted from numeric operands). Listing target remains `(LC + 1) + offset`. Tests O/P/Q updated to assert the encoded offsets (`FFFFFE11 br start`, `00000211 br dest`, `00000711 br 7`).
- `.lst` listing simplified: `branch_listing_operand` now returns a symbolic source operand as written, or for a numeric offset looks up a label at `(LC + 1) + offset` and otherwise returns the original numeric operand. Removed the redundant target recomputation and re-resolution of the source label. Tests O/P/Q unchanged and still pass.
- Emulator Phase 1 (`emu.c`): C89 32-bit representation finalized — `WORD_MASK` (0xFFFFFFFF), `signed32`/`signed24` signed two's-complement interpreters, and wrapping `add32`/`sub32`/`mul32`. CPU state (`A`, `B`, `PC`, `SP`) and `memory[10000]` kept as masked raw `unsigned long`; binary little-endian `.o` loader from address 0 with open/truncation/bounds errors; reset `A=B=PC=SP=0`. Verified: strict C89 warning-free; `emu test.o` loads 58 words matching `test.o`; helper checks pass. Fetch/decode not yet implemented.
- Emulator Phase 2 (`emu.c`): `fetch_decode()` fetches `memory[PC]`, increments `PC = (PC + 1) & WORD_MASK`, and decodes `opcode = word & 0xFF` and `operand = signed24((word >> 8) & 0xFFFFFF)`. Verified: strict C89 warning-free; known `test.o` words decode with correct word/opcode/operand (positive and negative operands), PC increments exactly once, loader output unchanged. No opcode semantics yet.
- Emulator Phase 3A (`emu.c`): execution loop `run()` plus `execute()` for `ldc` (`B:=A; A:=value`), `adc` (`A:=A+value`), `ldl` (`B:=A; A:=memory[SP+offset]`), `stl` (`memory[SP+offset]:=A; A:=B`), and `HALT`; `ldl`/`stl` addresses computed with `add32` and bounds-checked against `MEM_SIZE`. Verified: strict C89 warning-free; focused tests cover stack movement, positive/negative `SP+offset`, PC pre-increment, HALT stop, and out-of-bounds errors; loader output unchanged (`emu test.o` still reports 58 words and halts).
- Emulator Phase 3B (`emu.c`): `execute()` adds `ldnl` (`A:=memory[A+offset]`), `stnl` (`memory[A+offset]:=B`), `add` (`A:=B+A`), `sub` (`A:=B-A`), `shl`/`shr` (`A:=B<<A`, `A:=B>>A`), `adj` (`SP:=SP+value`), `a2sp`, `sp2a`; `ldnl`/`stnl` reuse the `add32` address + `MEM_SIZE` bounds check and do not touch memory before the check; `shr` is arithmetic implemented from raw bits (no implementation-defined signed shift). Verified: strict C89 warning-free; focused tests cover positive/negative `ldnl`/`stnl` offsets, `add`/`sub`/`shl`/`adj` 32-bit wraparound, arithmetic `shr`, `a2sp`/`sp2a` ordering, bounds errors, and Phase 3A regression. Assumption: shift counts are taken modulo 32 (spec silent for counts >= 32; flagged, not silently invented).

## Next Step
- Produce submission test programs (`test01.asm` ...) with `.log`, `.lst`, and the `claims` file; verify `mul`/`div`. See `CURRENT_TASK.md`.
