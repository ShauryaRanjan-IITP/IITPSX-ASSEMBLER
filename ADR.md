# Architectural Decision Record (ADR): IITPSx Two-Pass Assembler & Emulator

---

## 1. Project Standards & Compilation Environment

* **Language Standard:** ISO C89 strictly compiled using `gcc -std=c89 -pedantic -W -Wall -Wpointer-arith -Wwrite-strings -Wstrict-prototypes`.

* **Architecture:** Word-addressable 32-bit IITPSx processor. The Location Counter ($LC$) increments by `1` per instruction or `data` word.

* **Registers:** Four 32-bit registers ($A$, $B$, $PC$, $SP$). Registers $A$ and $B$ function as an internal accumulator stack.

* **Instruction Word Format (32-bit):** 24-bit signed 2's complement operand (bits 31–8) and 8-bit opcode (bits 7–0):

$$\text{Instruction Word} = (\text{operand} \ll 8) \mid (\text{opcode} \ \& \ \text{0xFF})$$

* **File Operations:** Text files (`.asm`, `.lst`) opened in text mode (`"r"`, `"w"`). Binary object code (`.o`) opened strictly in binary mode (`"wb"`, `"rb"`) to prevent newline and EOF byte translation corruption.

---

## 2. Pipeline Architecture: "One Read" 3-Stage Design

Instead of re-reading text from disk during Pass 2, the assembler uses a **One Read** architecture. The source file is parsed once into an Intermediate Representation (IR) array in RAM (`struct ParsedLine program[]`), cleanly separating lexical/syntax parsing from symbol registration and machine code generation.

```text
               .asm Source File (Disk)
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 1: FRONTEND / PARSER (Syntactic Analysis)          │
│ • Reads file line-by-line using fgets()                  │
│ • Strips comments (';') and leading/trailing whitespace  │
│ • Validates mnemonics against OPTAB                      │
│ • Converts numbers via strtol() (Base 0 auto-detection)  │
│ • Validates operand counts and label syntax              │
│ • Collects ALL syntax errors before terminating execution│
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
            struct ParsedLine program[] (RAM)
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 2: PASS 1 (Symbol Table & Address Allocation)      │
│ • Iterates over program[] in RAM                         │
│ • Assigns Location Counter ($LC$) memory addresses       │
│ • Registers label definitions in SYMTAB                  │
│ • Flags Duplicate Label definition errors                │
│ • Processes SET pseudo-directives (0 $LC$ memory growth) │
│ • Permits unresolved label operands (forward refs)       │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
                Completed SYMTAB
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ STAGE 3: PASS 2 (Code Generation & Symbol Resolution)   │
│ • Iterates over program[] in RAM                         │
│ • Resolves label operands against SYMTAB                 │
│ • Flags Undefined Label errors                           │
│ • Calculates PC-relative branch offsets: Target - (LC+1) │
│ • Bit-packs 32-bit words and emits binary (.o)           │
│ • Emits listing file (.lst) with reverse label lookup    │
│ • Outputs Warnings for unused labels                     │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Data Structures (ISO C89)

### A. Static Instruction Table (`OPTAB`)

Defines valid mnemonics, opcodes, and operand expectations:

```c
struct Instruction {
    char mnemonic[8];
    int opcode;
    int requires_operand; /* 1 = expects operand, 0 = no operand */
};

static const struct Instruction OPTAB[] = {
    {"data",   -1, 1}, /* Data allocation directive */
    {"ldc",     0, 1}, {"adc",     1, 1}, {"ldl",     2, 1}, {"stl",     3, 1},
    {"ldnl",    4, 1}, {"stnl",    5, 1}, {"add",     6, 0}, {"sub",     7, 0},
    {"shl",     8, 0}, {"shr",     9, 0}, {"adj",    10, 1}, {"a2sp",   11, 0},
    {"sp2a",   12, 0}, {"call",   13, 1}, {"return", 14, 0}, {"brz",    15, 1},
    {"brlz",   16, 1}, {"br",     17, 1}, {"HALT",   18, 0}, {"mul",    19, 0},
    {"div",    20, 0}, {"SET",    -2, 1}  /* Assembler directive */
};
```

### B. Symbol Table (`SYMTAB`)

Tracks label identifiers, absolute memory addresses, and usage state:

```c
struct Symbol {
    char name[32];
    int address;
    int used; /* 0 = defined but unused (warning), 1 = referenced */
};

struct Symbol SYMTAB[1000];
int symtab_count = 0;
```

### C. Intermediate Representation (`struct ParsedLine`)

Stores parsed source lines in RAM:

```c
struct ParsedLine {
    int line_number;
    int location_counter;
    char label[32];
    char mnemonic[10];
    char operand[32];
    int has_label;
    int has_instruction;
    int is_directive; /* SET, data, etc. */
};

struct ParsedLine program[2000];
int total_lines = 0;
```

---

## 4. Key Architectural Rules & Operational Mechanics

### A. Location Counter ($LC$) Rules

* **Instructions & `data` Directives:** Occupy 1 word in memory; increment $LC$ by `1`.
* **Label Definitions:** Occupy 0 words; $LC$ does not increment. Multiple labels defined sequentially assign the exact same $LC$ address to all those labels (valid assembly syntax).
* **`SET` Directive (`label: SET value`):** Assigns `value` directly to `label` in `SYMTAB`. Occupies 0 words in memory; $LC$ does not increment.

### B. PC-Relative Branch Offset Calculation

IITPSx instructions implicitly increment $PC$ by `1` **before** performing the instruction action. Branch displacement calculations during Pass 2 account for this:

$$\text{Branch Offset} = \text{Target Address} - (LC + 1)$$

### C. Operand Parsing & Resolution

1. **Numeric Operands:** Converted using `strtol(operand, &endptr, 0)`. Passing base `0` automatically handles decimal, hexadecimal (`0x`), and octal (`0`) prefixes.
2. **`ldc label` Instruction:** Loads the numeric memory address/value of `label` into register $A$, not the memory contents stored at that address.
3. **Listing File (`.lst`) Reverse Lookup:** When generating `.lst`, branch target addresses are cross-referenced with `SYMTAB`. If a label exists at $\text{Target Address} = LC + 1 + \text{offset}$, the listing displays the symbolic label name (e.g., `br start`); otherwise, it outputs the raw numeric value (e.g., `br 7`).

---

## 5. Master Error & Warning Handling Matrix

To satisfy test program requirements (`test2.asm`), Stage 1 does **not** halt on the first syntax error. It scans the entire source file, logs all syntax errors with line numbers, increments `error_count`, and aborts binary output if `error_count > 0`.

| Error / Warning Category | Example Code | Pipeline Stage | Assembler Action |
| --- | --- | --- | --- |
| **Unknown Mnemonic** | `fibble` | Stage 1 (Parser) | Fatal Error. Aborts `.o` generation. |
| **Invalid Label Name** | `0def:` | Stage 1 (Parser) | Fatal Error. Label must start with letter. |
| **Missing Operand** | `ldc` | Stage 1 (Parser) | Fatal Error. Instruction requires operand. |
| **Unexpected Operand** | `add 5` | Stage 1 (Parser) | Fatal Error. Instruction takes 0 operands. |
| **Extra Trailing Text** | `ldc 5, 6` | Stage 1 (Parser) | Fatal Error. Trailing garbage detected. |
| **Malformed Number** | `ldc 08ge` | Stage 1 (Parser) | Fatal Error. `strtol` validation fails. |
| **Duplicate Label** | `label:` (2nd time) | Stage 2 (Pass 1) | Fatal Error. Symbol already in `SYMTAB`. |
| **Undefined Label** | `br nonesuch` | Stage 3 (Pass 2) | Fatal Error. Symbol lookup fails in `SYMTAB`. |
| **Unused Label** | `label:` (never read) | Stage 3 (Pass 2) | Non-fatal **Warning**. Generates `.o` & `.lst`. |

---

## 6. Emulator Architecture (`emu.c`)

* **State Representation:** 32-bit unsigned/signed integers for registers (`A`, `B`, `PC`, `SP`) and a 32-bit array for memory (`uint32_t memory[10000]`).

* **Execution Loop Mechanics:**
  1. Fetch word at `memory[PC]`.
  2. Increment $PC$ by `1` ($PC = PC + 1$).
  3. Decode `opcode = word & 0xFF` and `operand = (int32_t)word >> 8` (sign-extended).
  4. Execute state changes via a `switch(opcode)` block.

* **Runtime Error Handling:**
  * **Division by Zero:** Executing `div` (opcode 20) when $A == 0$ reports a runtime error and halts execution.
  * **Errant Program:** Fetching an opcode outside 0–20 reports an "Errant Program" runtime error and halts.
  * **Halting:** Opcode 18 (`HALT`) gracefully terminates the emulation loop.
