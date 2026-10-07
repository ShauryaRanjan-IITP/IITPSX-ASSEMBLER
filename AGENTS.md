# AGENTS.md — Working Instructions for Coding Agents

Permanent instructions for any agent working on this CS2102 IITPSx assembler.

## Authority & Constraints
- Follow the teacher specification (`CS2102_IITPSx_Processor_Project2026.pdf`) and `ADR.md`.
- **C89 only.** Code must build with `gcc -std=c89 -pedantic -W -Wall -Wpointer-arith -Wwrite-strings -Wstrict-prototypes`.
- No C99+ features: declare variables at the top of blocks, no `//` comments, no mixed declarations.
- Keep code simple and student-written. Prefer clear, straightforward C over clever abstractions.

## Do Not
- Do not modify `asm.c` unless explicitly asked to implement a named task.
- Do not touch `emu.c` unless explicitly requested.
- Avoid unnecessary refactoring or overengineering.
- Do not silently change the architecture. If a design change seems needed, stop and ask.
- Do not add unrelated features while completing a focused task.
- Do not add comments unless asked (repo convention is minimal comments, though ADR/spec-based comments are acceptable where they clarify intent).

## Architecture Boundaries (respect these)
- **Parser (Stage 1):** lexical/syntactic analysis only — label extraction, mnemonic validation against OPTAB, operand count, numeric syntax, trailing text. Produces `Program[]`.
- **Pass 1 (Stage 2):** location counter assignment, label registration in SYMTAB, duplicate-label detection. Must permit unresolved (forward) references.
- **Pass 2 (Stage 3):** machine code generation, symbol resolution, undefined-label detection, branch offset calc, output.
- These responsibilities are separate. Do not move validation between stages without being asked.

## Working Method
1. Before modifying code, inspect the relevant existing implementation.
2. Make focused, minimal changes only.
3. Compile and test after changes where appropriate (use the pedantic C89 command above).
4. Report exactly what changed and what was verified. Do not claim success without evidence.
5. Never commit unless explicitly asked.
