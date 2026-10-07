# PROJECT_CONTEXT.md — IITPSx Assembler

Persistent project context to reduce repeated explanation in future sessions.

## 1. IITPSx Architecture (assembler-relevant)
- Word-addressable, 32-bit processor with four 32-bit registers: `A`, `B` (an internal accumulator stack), `PC`, `SP`.
- Memory is addressed by word index, so the Location Counter (`LC`) increments by `1` per instruction or per `data` word.
- `PC` is implicitly incremented by `1` before an instruction's action; branch offsets must account for this.

## 2. Instruction Encoding
- 32-bit word = 24-bit signed two's-complement operand in bits 31–8, 8-bit opcode in bits 7–0.
  `word = (operand << 8) | (opcode & 0xFF)`
- `emu.c` fetch order is: fetch `memory[PC]`, then `PC = PC + 1`, then `opcode = word & 0xFF`, `operand = (int32_t)word >> 8` (sign-extended).

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
- Computes branch offsets and emits output.

## 4. Data Structures
**`struct Instruction` / `OPTAB[]`**
- `{ char mnemonic[8]; int opcode; int requires_operand; }`
- `data` has opcode `-1`; `SET` has opcode `-2`. Both require an operand.
- Opcodes 0–20 map to the IITPSx instruction set (`mul`=19, `div`=20); `HALT`=18.
- `find_instruction(name)` does a linear `strcmp` lookup and returns `NULL` if unknown.

**`struct Symbol` / `SYMTAB[]`**
- `{ char name[32]; int address; int used; }`, capacity 1000.
- `used` tracks references (0 = defined but unused → warning; 1 = referenced).
- `add_symbol` rejects duplicates and returns 0 on failure.

**`struct ParsedLine` / `Program[]`**
- `{ int line_number; int location_counter; char label[32]; char mnemonic[10]; char operand[32]; int has_label; int has_instruction; int is_directive; }`, capacity 2000.
- `is_directive` is set for `data` and `SET`.

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
- For `br`, `brz`, `brlz`, `call` (PC-relative operands) the emitted operand is `Target - (LC + 1)`.
- For non-branch instructions, the label's value is used directly.

**Numbers**
- `strtol(s, &endptr, 0)` with base 0 auto-detects decimal, hex (`0x`), and octal (`0`).
- Malformed numeric-looking operands are a Stage 1 fatal error.

## 6. Current Implementation Status
- Parser: implemented (label, mnemonic, operand count, numeric validation, trailing text).
- Pass 1: implemented (LC assignment, label registration, duplicate detection).
- `SYMTAB`: implemented.
- Pass 2: **basic numeric encoding only** — currently re-runs `strtol` on operand text; does not yet resolve symbols, compute branch offsets, flag undefined labels, or write `.o`/`.lst` files.
- `main()` currently runs a hard-coded test harness of source lines; file reading is not yet wired in.
- Known redundancy: Pass 2 has an `inst == NULL` check that parser validation already guarantees is unreachable.

## 7. Important Invariants
- C89 build must stay warning-free under the strict flags.
- Parser owns all syntax errors; Pass 1 owns duplicate labels; Pass 2 owns undefined labels and codegen.
- `error_count > 0` aborts binary/code emission.
- `LC` increments only for instructions and `data` words, never for labels or `SET`.
- Optimize for correctness and clarity first; the marker may ask for deep explanation of the code.

## 8. Remaining Assembler Work
- Complete Pass 2 symbol resolution (current task).
- Apply branch offset rule `Target - (LC + 1)` for PC-relative instructions.
- Implement `SET` handling (assign value, no `LC` growth) and verify.
- Report undefined labels and unused-label warnings.
- Wire up file input (`fgets`) and outputs: binary `.o` (opened `"wb"`) and listing `.lst`.
- Verify against `test1.asm`–`test4.asm` from the spec; add tests and a `claims` file per submission requirements.
- Support the required `mul`/`div` opcodes (already in OPTAB; verify encoding).
