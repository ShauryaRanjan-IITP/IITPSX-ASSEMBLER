# CURRENT_TASK.md

## Task
**`.lst` listing output — implemented.**

## Delivered
- `<base>.lst` generated during Pass 2 alongside `<base>.o` (no extra pass).
- Preferred PDF format: word rows `%08X %08X %s [operand]`; label rows `%08X          %s:`.
- Uppercase, zero-padded 8-digit hex for address and word.
- Label + instruction line emits a label row then a word row at the same LC.
- Label-only line emits one label row.
- `SET` emits a label row using its assigned value; no word row.
- Non-branch operands show the original source text.
- For PC-relative branches, a symbolic operand is listed as written (`br start` → `br start`); a numeric offset is listed as a label if one sits at its target `(LC + 1) + offset`, otherwise as the original numeric operand.
- The already-computed machine word is reused; no second encoding.
- `.lst` opened `"w"`; `.o` stays `"wb"`; both removed if assembly fails.

## Verified
- Strict C89 build warning-free under the project flags.
- `asm --test` output unchanged, plus listing tests O/P/Q (all PASS).
- Sample with label-only, label+instruction, `SET`, `data`, and branch cases yields correct `.lst`.
- `.o` little-endian bytes unchanged; failed assembly leaves neither file.

## Emulator Phase 1 — complete
- C89 32-bit representation in place: `WORD_MASK` (0xFFFFFFFF), `signed32`/`signed24`, and wrapping `add32`/`sub32`/`mul32`.
- CPU state `A`, `B`, `PC`, `SP` and `memory[10000]` are masked raw 32-bit `unsigned long`; reset state `A=B=PC=SP=0`.
- Binary little-endian `.o` loader from address 0 verified against `test.o` (58 words); strict C89 build warning-free.

## Emulator Phase 2 — complete
- `fetch_decode()` fetches `memory[PC]`, increments `PC = (PC + 1) & WORD_MASK`, and decodes `opcode = word & 0xFF` and `operand = signed24((word >> 8) & 0xFFFFFF)`.
- Verified against known `test.o` words: correct word/opcode/operand for positive and negative operands, PC increments exactly once, loader output unchanged.

## Emulator Phase 3A — complete
- Execution loop `run()` fetches/decodes/executes; `execute()` implements `ldc`, `adc`, `ldl`, `stl`, `HALT` per spec.
- Stack movement (`B:=A` / `A:=B`), positive/negative `SP+offset` addressing, PC pre-increment, HALT stop, and `MEM_SIZE` bounds errors all verified.

## Emulator Phase 3B — complete
- `execute()` adds `ldnl`, `stnl`, `add`, `sub`, `shl`, `shr`, `adj`, `a2sp`, `sp2a`; `ldnl`/`stnl` reuse the `add32` address + `MEM_SIZE` bounds check; `shr` is arithmetic from raw bits.
- Verified: positive/negative `ldnl`/`stnl` offsets, `add`/`sub`/`shl`/`adj` 32-bit wraparound, arithmetic `shr`, register-exchange order, bounds errors, and Phase 3A regression all pass.

## Next
- Emulator Phase 3C: branches (`br`, `brz`, `brlz`), `call`/`return`, `mul`/`div` (incl. division-by-zero), and illegal-opcode handling.
- Produce submission test programs (`test01.asm` ...) plus `.log`, `.lst`, and the `claims` file.
- Verify `mul`/`div` encoding and add coverage.

## Branch rule (corrected)
- Numeric branch operand = literal PC-relative offset, emitted as-is (no `(LC + 1)` subtraction). e.g. `br 7` encodes offset 7.
- Symbolic branch operand = label address converted to a PC-relative offset: `label_address - (LC + 1)`.
- Listing target address = `(LC + 1) + offset`; show a label there if one exists, else the numeric offset.
- If several labels share the target, prefer the source label when it resolves to the target.
