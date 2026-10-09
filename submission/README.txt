SHAURYA RANJAN SINGH
Roll / User ID: 2501AI16
Authorship: I declare that I have prepared and reviewed this submission and take responsibility for its contents.

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
    test05.asm     Bubble sort; sorts its data to 1 2 3 4 5 7 8 9.
    test06.asm     Sum of {4,7,2,9,5}; result 27.
    test07.asm     Polynomial 3x^2+2x+5 at x=4 (uses mul); result 61.
    test08.asm     Integer mean of {4,7,2,9,5} (uses div); result 5.
    test09.asm     Minimum and maximum of {4,7,2,9,5,1}; min 1, max 9.
    test10.asm     5! by a loop (uses mul); result 120.
    test11.asm     (a*b)/c with a=9, b=8, c=4 (uses mul and div); result 18.
    test12.asm     Undefined label in a branch; expected to FAIL assembly
                   (Pass 2 reports the undefined label).
    test13.asm     Division by zero; expected emulator runtime error.
    test0N.lst     Listing produced for each test by the assembler.
    test0N.o       Object file for each test that assembles successfully.
    test0N.log     Real captured assembler + emulator output and a
                   verification summary (expected vs observed).
    (test02 intentionally produces no .o: assembly fails on the deliberate
     errors in that file.)

claims             Claims file listing the marking-scheme items claimed.

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
- The author's name, user id, and authorship declaration appear at the top of
  the source, test, and documentation files, as required by the specification.
