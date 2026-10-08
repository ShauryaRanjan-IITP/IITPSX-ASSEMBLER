CS2102 IITPSx Processor Project - Backend Submission
====================================================

This folder contains the validated assembler and emulator backend for the
IITPSx processor. The project frontend is a separate, later phase and is not
part of this snapshot.

Contents
--------
asm.c              Two-pass assembler (source).
emu.c              Emulator (source).
bubble_sort.asm    Required bubble-sort program (sorts its data into
                   ascending order and HALTs).
bubble_sort.o      Object file produced from bubble_sort.asm.
bubble_sort.lst    Listing file for bubble_sort.asm.

tests/
    test01.asm     PDF test1 - valid but nonsense program (has an infinite loop).
    test02.asm     PDF test2 - error handling; expected to FAIL assembly.
    test03.asm     PDF test3 - SET directive.
    test04.asm     PDF test4 - mul/div; leaves 21 in register A.
    test0N.lst     Listing produced by the assembler for each test.
    test01.o, test03.o, test04.o
                   Object files for the tests that assemble successfully.
    (test02 intentionally produces no .o: assembly fails on the deliberate
     errors in that file.)

Build
-----
    gcc -std=c89 -pedantic -W -Wall -Wpointer-arith -Wwrite-strings \
        -Wstrict-prototypes asm.c -o asm
    gcc -std=c89 -pedantic -W -Wall -Wpointer-arith -Wwrite-strings \
        -Wstrict-prototypes emu.c -o emu

Use
---
    ./asm <source.asm>     Writes <source>.o (little-endian 32-bit words) and
                           <source>.lst (listing with diagnostics).
    ./emu <object.o>       Loads the object file, executes from address 0,
                           and on HALT prints a memory dump
                           (address + 32-bit word, 8 hex digits each).

Notes
-----
- Instruction mnemonics and directives are case-insensitive; labels and
  operands remain case-sensitive.
- If assembly fails, the .o is not produced, but the .lst is kept so the
  errors/warnings are visible next to the relevant source lines.
- Unused-label warnings are non-fatal. Infinite-loop detection is not
  implemented (out of scope).
- Emulator runtime errors (division by zero, illegal opcode, program counter
  out of bounds) are reported and stop execution.
- Validation verdict: PASS WITH NOTED COMPATIBILITY DIFFERENCES (only
  reference-implementation formatting/partial-object/infinite-loop-warning
  differences remain; no specification defects).
