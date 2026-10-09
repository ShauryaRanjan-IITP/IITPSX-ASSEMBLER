/* SHAURYA RANJAN SINGH
   Roll / User ID: 2501AI16
   Authorship: I declare that I have prepared and reviewed this submission and take responsibility for its contents. */

#include <stdio.h>

#define MEM_SIZE 10000
#define WORD_MASK 0xFFFFFFFFUL

/* IITPSx words are 32-bit. C89 has no stdint.h, so unsigned long holds the
   raw bit pattern; every CPU word is kept masked to WORD_MASK. */
static unsigned long memory[MEM_SIZE];

static unsigned long A;
static unsigned long B;
static unsigned long PC;
static unsigned long SP;

/* Low 32 bits of a raw word as signed two's complement. */
long signed32(unsigned long raw)
{
    raw &= WORD_MASK;
    if (raw & 0x80000000UL) {
        return (long)(raw - 0x80000000UL) - 0x80000000L;
    }
    return (long)raw;
}

/* Low 24 bits as a signed two's-complement operand. */
long signed24(unsigned long raw)
{
    raw &= 0xFFFFFFUL;
    if (raw & 0x800000UL) {
        return (long)(raw - 0x800000UL) - 0x800000L;
    }
    return (long)raw;
}

/* Wrapping 32-bit arithmetic. */
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

static void init_cpu(void)
{
    A = 0;
    B = 0;
    PC = 0;
    SP = 0;
}

/* Load an object file (little-endian 32-bit words) starting at address 0. */
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

/* Fetch memory[PC] and advance PC, then split opcode and operand.
   Returns -1 if PC is out of bounds. */
int fetch_decode(unsigned long *opcode, long *operand)
{
    unsigned long word;

    if (PC >= (unsigned long)MEM_SIZE) {
        printf("Error: Program counter out of bounds\n");
        return -1;
    }
    word = memory[PC];
    PC = (PC + 1) & WORD_MASK;
    *opcode = word & 0xFFUL;
    *operand = signed24((word >> 8) & 0xFFFFFFUL);
    return 1;
}

/* Execute one instruction: 1 = continue, 0 = HALT, -1 = runtime error. */
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
    case 13:                    /* call offset: B := A; A := PC; PC := PC + offset */
        B = A;
        A = PC;
        PC = add32(PC, (unsigned long)operand & WORD_MASK);
        break;
    case 14:                    /* return: PC := A; A := B */
        PC = A;
        A = B;
        break;
    case 15:                    /* brz offset: if A == 0 then PC := PC + offset */
        if (A == 0) {
            PC = add32(PC, (unsigned long)operand & WORD_MASK);
        }
        break;
    case 16:                    /* brlz offset: if A < 0 then PC := PC + offset */
        if (signed32(A) < 0) {
            PC = add32(PC, (unsigned long)operand & WORD_MASK);
        }
        break;
    case 17:                    /* br offset: PC := PC + offset */
        PC = add32(PC, (unsigned long)operand & WORD_MASK);
        break;
    case 19: {                  /* mul: A := B * A (low 32 bits of product) */
        A = mul32(B, A);
        break;
    }
    case 20: {                  /* div: A := B / A (signed 32-bit) */
        long dividend = signed32(B);
        long divisor = signed32(A);

        if (divisor == 0) {
            printf("Error: Division by zero\n");
            return -1;
        }
        if (divisor == -1) {
            A = sub32(0UL, B);  /* -B, avoids INT_MIN / -1 signed overflow */
        } else {
            A = (unsigned long)(dividend / divisor) & WORD_MASK;
        }
        break;
    }
    case 18:                    /* HALT */
        return 0;
    default:
        printf("Error: Illegal opcode %lu\n", opcode);
        return -1;
    }
    return 1;
}

/* Run until HALT or a runtime error. */
static int run(void)
{
    unsigned long opcode;
    long operand;
    int status;

    for (;;) {
        status = fetch_decode(&opcode, &operand);
        if (status != 1) {
            return status;
        }
        status = execute(opcode, operand);
        if (status != 1) {
            return status;
        }
    }
}

/* Print memory[0..count-1] as "address word" hex rows. */
static void dump_memory(int count)
{
    int i;

    for (i = 0; i < count; i++) {
        printf("%08lX %08lX\n", (unsigned long)i, memory[i] & WORD_MASK);
    }
}

int main(int argc, char *argv[])
{
    int words;
    int status;

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

    status = run();
    if (status == 0) {
        dump_memory(words);
    }
    return (status < 0) ? 1 : 0;
}
