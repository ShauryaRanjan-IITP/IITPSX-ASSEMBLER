#include <stdio.h>

#define MEM_SIZE 10000
#define WORD_MASK 0xFFFFFFFFUL

/* IITPSx is a 32-bit processor. ISO C89 has no stdint.h, so 32-bit words and
   registers use unsigned long, which is guaranteed to hold at least 32 bits
   (it already represents machine words in asm.c). Every CPU word is kept
   masked to WORD_MASK; signedness is only an interpretation. */
static unsigned long memory[MEM_SIZE];

static unsigned long A;
static unsigned long B;
static unsigned long PC;
static unsigned long SP;

/* Interpret the low 32 bits of a raw CPU word as signed two's complement. */
long signed32(unsigned long raw)
{
    raw &= WORD_MASK;
    if (raw & 0x80000000UL) {
        return (long)(raw - 0x80000000UL) - 0x80000000L;
    }
    return (long)raw;
}

/* Interpret the low 24 bits as a signed two's-complement operand. */
long signed24(unsigned long raw)
{
    raw &= 0xFFFFFFUL;
    if (raw & 0x800000UL) {
        return (long)(raw - 0x800000UL) - 0x800000L;
    }
    return (long)raw;
}

/* Wrapping 32-bit arithmetic used by instruction execution (Phase 2). */
unsigned long add32(unsigned long a, unsigned long b)
{
    return (a + b) & WORD_MASK;
}

unsigned long sub32(unsigned long a, unsigned long b)
{
    return (a - b) & WORD_MASK;
}

unsigned long mul32(unsigned long a, unsigned long b)
{
    return (a * b) & WORD_MASK;
}

/* Reset state from the spec: A=B=PC=SP=0 (execute from address 0). */
static void init_cpu(void)
{
    A = 0;
    B = 0;
    PC = 0;
    SP = 0;
}

/* Load a little-endian object file: each 32-bit word is 4 bytes, low byte
   first, matching asm.c's write_object_word(). Words start at address 0. */
static int load_object(const char *filename)
{
    FILE *fp;
    unsigned char bytes[4];
    unsigned long word;
    int count = 0;
    size_t got;

    fp = fopen(filename, "rb");
    if (fp == NULL) {
        printf("Error: Cannot open object file '%s'\n", filename);
        return -1;
    }

    for (;;) {
        got = fread(bytes, 1, 4, fp);
        if (got == 0) {
            break;
        }
        if (got != 4) {
            printf("Error: Truncated object file '%s'\n", filename);
            fclose(fp);
            return -1;
        }
        if (count >= MEM_SIZE) {
            printf("Error: Object file '%s' does not fit in memory\n", filename);
            fclose(fp);
            return -1;
        }
        word = (unsigned long)bytes[0] |
               ((unsigned long)bytes[1] << 8) |
               ((unsigned long)bytes[2] << 16) |
               ((unsigned long)bytes[3] << 24);
        memory[count] = word & WORD_MASK;
        count++;
    }

    if (ferror(fp)) {
        printf("Error: Failed while reading '%s'\n", filename);
        fclose(fp);
        return -1;
    }
    fclose(fp);
    return count;
}

/* Phase 2: fetch the word at PC, increment PC, then decode opcode/operand.
   No opcode semantics are applied here. */
unsigned long fetch_decode(unsigned long *opcode, long *operand)
{
    unsigned long word;

    word = memory[PC];
    PC = (PC + 1) & WORD_MASK;
    *opcode = word & 0xFFUL;
    *operand = signed24((word >> 8) & 0xFFFFFFUL);
    return word;
}

/* Execute one decoded instruction (Phases 3A-3B).
   Returns 1 to continue, 0 on HALT, -1 on a runtime error. */
static int execute(unsigned long opcode, long operand)
{
    unsigned long addr;
    unsigned long count;

    switch (opcode) {
    case 0:                     /* ldc value: B := A; A := value */
        B = A;
        A = (unsigned long)operand & WORD_MASK;
        break;
    case 1:                     /* adc value: A := A + value */
        A = add32(A, (unsigned long)operand & WORD_MASK);
        break;
    case 2:                     /* ldl offset: B := A; A := memory[SP + offset] */
        addr = add32(SP, (unsigned long)operand & WORD_MASK);
        if (addr >= (unsigned long)MEM_SIZE) {
            printf("Error: memory read out of bounds (address %lu)\n", addr);
            return -1;
        }
        B = A;
        A = memory[addr];
        break;
    case 3:                     /* stl offset: memory[SP + offset] := A; A := B */
        addr = add32(SP, (unsigned long)operand & WORD_MASK);
        if (addr >= (unsigned long)MEM_SIZE) {
            printf("Error: memory write out of bounds (address %lu)\n", addr);
            return -1;
        }
        memory[addr] = A;
        A = B;
        break;
    case 4:                     /* ldnl offset: A := memory[A + offset] */
        addr = add32(A, (unsigned long)operand & WORD_MASK);
        if (addr >= (unsigned long)MEM_SIZE) {
            printf("Error: memory read out of bounds (address %lu)\n", addr);
            return -1;
        }
        A = memory[addr];
        break;
    case 5:                     /* stnl offset: memory[A + offset] := B */
        addr = add32(A, (unsigned long)operand & WORD_MASK);
        if (addr >= (unsigned long)MEM_SIZE) {
            printf("Error: memory write out of bounds (address %lu)\n", addr);
            return -1;
        }
        memory[addr] = B;
        break;
    case 6:                     /* add: A := B + A */
        A = add32(B, A);
        break;
    case 7:                     /* sub: A := B - A */
        A = sub32(B, A);
        break;
    case 8:                     /* shl: A := B << A (count taken mod 32) */
        count = A & 31UL;
        A = (B << count) & WORD_MASK;
        break;
    case 9:                     /* shr: A := B >> A, arithmetic (count mod 32) */
        count = A & 31UL;
        if (count == 0) {
            A = B;
        } else {
            A = B >> count;
            if (B & 0x80000000UL) {
                A |= (WORD_MASK << (32UL - count)) & WORD_MASK;
            }
        }
        break;
    case 10:                    /* adj value: SP := SP + value */
        SP = add32(SP, (unsigned long)operand & WORD_MASK);
        break;
    case 11:                    /* a2sp: SP := A; A := B */
        SP = A;
        A = B;
        break;
    case 12:                    /* sp2a: B := A; A := SP */
        B = A;
        A = SP;
        break;
    case 18:                    /* HALT */
        return 0;
    default:
        break;                  /* other opcodes are not implemented yet */
    }
    return 1;
}

/* Fetch/decode/execute until HALT or a runtime error.
   Returns 0 on HALT, -1 on a runtime error. */
static int run(void)
{
    unsigned long opcode;
    long operand;
    int status;

    for (;;) {
        fetch_decode(&opcode, &operand);
        status = execute(opcode, operand);
        if (status != 1) {
            return status;
        }
    }
}

int main(int argc, char *argv[])
{
    int words;

    if (argc != 2) {
        printf("Usage: %s <object.o>\n", argv[0]);
        return 1;
    }

    init_cpu();

    words = load_object(argv[1]);
    if (words < 0) {
        return 1;
    }

    printf("Loaded %d words from '%s'.\n", words, argv[1]);

    return (run() < 0) ? 1 : 0;
}
