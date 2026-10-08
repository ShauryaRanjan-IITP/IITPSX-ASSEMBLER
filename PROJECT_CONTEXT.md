# PROJECT_CONTEXT.md — IITPSx Assembler

Persistent project context to reduce repeated explanation in future sessions.

## 1. IITPSx Architecture (assembler-relevant)
- Word-addressable, 32-bit processor with four 32-bit registers: `A`, `B` (an internal accumulator stack), `PC`, `SP`.
- Memory is addressed by word index, so the Location Counter (`LC`) increments by `1` per instruction or per `data` word.
- `PC` is implicitly incremented by `1` before an instruction's action; branch offsets must account for this.

## 2. Instruction Encoding
- 32-bit word = 24-bit signed two's-complement operand in bits 31–8, 8-bit opcode in bits 7–0.
  `word = (operand << 8) | (opcode & 0xFF)`
- `emu.c` fetch order is: fetch `memory[PC]`, then `PC = PC + 1`, then `opcode = word & 0xFF`, `operand = signed24(word >> 8)` (sign-extended).

## 3. Pipeline: Parser → Pass 1 → Pass 2
**Stage 1 — Parser (`parse_line`)**
- Strips comments (`;`) and whitespace, extracts optional `label:` and statement.
- Validates label syntax, mnemonic (via `find_instruction`/OPTAB), operand count, numeric-looking operands, and trailing text.
- Fills one `struct ParsedLine` per source line; does not resolve symbols.

**Stage 2 — Pass 1 (`pass1`)**
- Walks `Program[]`, assigns `location_counter` to each line.
- Registers labels in `SYMTAB` via `add_symbol`; flags duplicate labels.
- Increments `LC` for each line that has an instruction.
- Forward references are allowed (not resolved here).

**Stage 3 — Pass 2 (`pass2`)**
- Walks `Program[]` again and generates machine words.
- Resolves symbolic operands through `SYMTAB`, flags undefined labels.
- Computes branch offsets and checks the signed 24-bit operand range.
- Prints a human-readable dump to stdout, and writes each word to the `.o` object file and the `.lst` listing file during the same loop (no second encoding).

## 4. Data Structures
**`struct Instruction` / `OPTAB[]`**
- `{ char mnemonic[8]; int opcode; int requires_operand; }`
- `data` has opcode `-1`; `SET` has opcode `-2`. Both require an operand.
- Opcodes 0–20 map to the IITPSx instruction set (`mul`=19, `div`=20); `HALT`=18.
- `find_instruction(name)` does a case-insensitive linear lookup (mnemonics only) and returns `NULL` if unknown.

**`struct Symbol` / `SYMTAB[]`**
- `{ char name[32]; int address; int used; int line_index; }`, capacity 1000.
- `used` tracks references (0 = defined but unused → warning; 1 = referenced).
- `add_symbol` rejects duplicates and returns 0 on failure.

**`struct ParsedLine` / `Program[]`**
- `{ int line_number; int location_counter; char label[32]; char mnemonic[10]; char operand[32]; int has_label; int has_instruction; int is_directive; char listing_operand[32]; int has_listing_operand; unsigned long word; int has_word; char diag[96]; }`, capacity 2000.
- `is_directive` is set for `data` and `SET`. The trailing fields hold information for the deferred listing (chosen operand text, emitted word) and the per-line diagnostic.

## 5. Rules
**Labels**
- Valid name: alphanumeric string beginning with a letter (`is_valid_label`).
- A label definition occupies 0 words; `LC` does not advance for it.
- Multiple labels in a row may share the same `LC` value (valid).
- A label use in an operand that looks numeric is treated as a number; otherwise it is a symbol.

**`SET` directive**
- Form: `label: SET value`.
- Assigns `value` directly to `label` in `SYMTAB` (not the current `LC`).
- Occupies 0 words; `LC` does not increment.

**Branch offset**
- For `br`, `brz`, `brlz`, `call` (PC-relative): a *symbolic* operand resolves to its label address and emits `label_address - (LC + 1)`; a *numeric* operand is a literal PC-relative offset emitted as-is (e.g. `br 7` encodes offset 7).
- For non-branch instructions, the label's value is used directly.

**Numbers**
- `strtol(s, &endptr, 0)` with base 0 auto-detects decimal, hex (`0x`), and octal (`0`).
- Malformed numeric-looking operands are a Stage 1 fatal error.

**Operand range**
- Instruction operands are signed 24-bit: `-8388608..8388607`.
- The resolved operand (after branch adjustment) is range-checked before encoding; out-of-range is a fatal error and emits no word.
- `SET` values and `data` words are not subject to this 24-bit check.

**Comments**
- A `;` starts a comment; everything from it to end of line is ignored.
- A comment-only line behaves like a blank line and never advances `LC`.

**`SET` label requirement**
- `SET` must have a label on the same line; `SET 25` is a Stage 1 parser error.

**Command-line input**
- `asm <file>` reads a source file and writes `<file>.o` (binary, little-endian 32-bit words) and `<file>.lst` (text listing).
- Mnemonics and directives are case-insensitive; labels and operands remain case-sensitive.
- File-open and read errors are reported and cause a non-zero exit code.
- If assembly fails, the `.o` is removed but the `.lst` is kept so diagnostics are visible.

## 6. Current Implementation Status
- Parser: implemented — label syntax, mnemonic/`OPTAB`, operand count, numeric syntax, trailing text, comments (`;`), and `SET`-requires-a-label.
- Pass 1: implemented — LC assignment, label registration, duplicate detection, and `SET` value assignment with zero LC growth.
- Pass 2: implemented — numeric encoding, `SYMTAB` resolution, undefined-label errors, signed 24-bit operand range check, and PC-relative branch offsets. Emits a human-readable dump to stdout.
- Unused-label warnings: implemented (non-fatal, printed after a successful Pass 2).
- Input: real `.asm` files via command line (`asm <file>`), read line by line with `fgets`; `asm --test` runs the built-in regression suite.
- The redundant Pass 2 `inst == NULL` check has been removed; Pass 2 relies on the parser invariant that `has_instruction` implies a valid mnemonic.
- `.o` output: implemented — `asm <file>` writes `<file>.o` (binary `"wb"`, one 32-bit little-endian word per instruction/`data`; none for `SET`, labels, comments, blanks). File is removed on failure.
- `.lst` output: implemented — written during Pass 2 (word rows `%08X %08X %s [operand]`, label rows `%08X          %s:`). Label + instruction lines emit a label row then a word row; `SET` emits a label row using its assigned value; non-branch operands show source text. For PC-relative branches, `branch_listing_operand` lists a symbolic operand as written and a numeric offset as a label when one sits at its target `(LC + 1) + offset`, else as the original numeric operand. Opened `"w"`; removed on failure. Reuses the computed word (no second encoding).
- Emulator Phase 1 (`emu.c`): implemented — CPU state (`A`, `B`, `PC`, `SP`) and `memory[10000]` as raw 32-bit `unsigned long` words masked by `WORD_MASK` (0xFFFFFFFF); `signed32`/`signed24` interpret raw bits as signed two's-complement and `add32`/`sub32`/`mul32` give wrapping 32-bit results; binary little-endian `.o` loader from address 0; reset `A=B=PC=SP=0`.
- Emulator Phase 2 (`emu.c`): implemented — `fetch_decode()` fetches `memory[PC]`, increments `PC = (PC + 1) & WORD_MASK`, and decodes `opcode = word & 0xFF` and `operand = signed24((word >> 8) & 0xFFFFFF)`. No opcode semantics yet.
- Emulator Phase 3A (`emu.c`): implemented — execution loop `run()` plus `execute()` for `ldc` (`B:=A; A:=value`), `adc` (`A:=A+value`), `ldl` (`B:=A; A:=memory[SP+offset]`), `stl` (`memory[SP+offset]:=A; A:=B`), and `HALT`; `ldl`/`stl` addresses are computed with `add32` and bounds-checked against `MEM_SIZE`. Other opcodes are skipped for now.
- Emulator Phase 3B (`emu.c`): implemented — `ldnl` (`A:=memory[A+offset]`), `stnl` (`memory[A+offset]:=B`), `add` (`A:=B+A`), `sub` (`A:=B-A`), `shl`/`shr` (`A:=B<<A`, `A:=B>>A`), `adj` (`SP:=SP+value`), `a2sp`, `sp2a`; `ldnl`/`stnl` reuse the `add32` address and `MEM_SIZE` bounds check. `shr` is arithmetic, computed from raw bits (no implementation-defined signed shift).
- Assumption: the spec defines `shl`/`shr` as `B<<A` / `B>>A` but not for shift counts `>= 32`; counts are taken modulo 32 (matching x86 shift semantics), and this is flagged rather than silently fixed.
- Emulator Phase 3C (`emu.c`): implemented — branches `brz` (`PC += offset` if `A == 0`), `brlz` (`PC += offset` if `signed32(A) < 0`), and `br` (`PC += offset`); the offset is applied to the PC already incremented by `fetch_decode`, using `add32` so PC wraps at 32 bits. Taken branches do not alter A/B.
- Emulator Phase 3D (`emu.c`): implemented — `call` (`B:=A; A:=PC; PC:=PC+offset`) and `return` (`PC:=A; A:=B`); `call` stores the post-fetch PC in `A` and applies the signed offset with `add32`, preserving 32-bit wrap; assignment order preserved.
- Emulator Phase 3E (`emu.c`): implemented — `mul` (`A:=B*A`, low 32 bits of the product via `mul32`, so no signed-overflow UB) and `div` (`A:=B/A`, signed via `signed32`; the `INT_MIN / -1` case is computed as `sub32(0, B)` to avoid signed overflow). Division by zero is intentionally not handled yet (`A` left unchanged) and is deferred.
- Emulator Phase 3F (`emu.c`): implemented — `div` with `A == 0` reports `Error: Division by zero` and halts before any C division; any unimplemented opcode (> 20) reaches the `default` case, reports `Error: Illegal opcode <n>`, and halts. Both return `-1` from `execute()`; `run()` propagates it and `main()` returns a non-zero exit code. `HALT` (18) still returns the normal `0` status.
- Emulator Phase 4 (`emu.c`): implemented — after normal termination (`HALT`), `dump_memory()` prints the program's memory (addresses `0..N-1`, where `N` = words loaded) as `%08X %08X` (8-hex address, 8-hex word), matching the spec's memory-dump format. Runtime errors (`div` by zero, illegal opcode) print the error and exit non-zero without a dump; registers are not printed.
- Assembler finalization (`asm.c`): mnemonics/directives are case-insensitive via `ci_equal` (labels/operands stay case-sensitive); `.lst` diagnostics are embedded via `report()` (errors and unused-label warnings on their source line); the `.lst` is retained on failure while the `.o` is withheld; infinite-loop detection is intentionally not implemented.
- Backend validation/freeze: all 21 IITPSx instructions audited against the teacher PDF; strict C89 warning-free; official PDF `test1`–`test4`, supplied `Tests/test1`–`test7`, and `bubble_sort.asm` validated; runtime errors (division by zero, illegal opcode, PC out-of-bounds) verified. Verdict: PASS WITH NOTED COMPATIBILITY DIFFERENCES. The backend is now frozen.
- Not yet implemented: project frontend (future phase); deferred submission extras (`test01.asm` naming, `claims` file).

## 7. Important Invariants
- C89 build must stay warning-free under the strict flags.
- Parser owns all syntax errors; Pass 1 owns duplicate labels; Pass 2 owns undefined labels and codegen.
- `error_count > 0` aborts binary/code emission.
- Unused labels are warnings only and never increment `error_count`.
- `LC` increments only for instructions and `data` words, never for labels, `SET`, or comments.
- Optimize for correctness and clarity first; the marker may ask for deep explanation of the code.

## 8. Remaining Project Work
- Backend validation complete (official PDF `test1`–`test4`, supplied `Tests/`, `bubble_sort.asm`, `mul`/`div`); the backend is frozen.
- Deferred submission extras: PDF-named `test01.asm` files and the `claims` file.
- Frontend work is the next project phase.
- Branch rule (corrected): a numeric branch operand is a literal PC-relative offset; a symbolic branch operand is a label address converted to `label_address - (LC + 1)`.
