#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

struct Instruction {
    char mnemonic[8];
    int opcode;
    int requires_operand;
};

static const struct Instruction OPTAB[] = {
    {"data",   -1, 1},
    {"ldc",     0, 1}, {"adc",     1, 1}, {"ldl",     2, 1}, {"stl",     3, 1},
    {"ldnl",    4, 1}, {"stnl",    5, 1}, {"add",     6, 0}, {"sub",     7, 0},
    {"shl",     8, 0}, {"shr",     9, 0}, {"adj",    10, 1}, {"a2sp",   11, 0},
    {"sp2a",   12, 0}, {"call",   13, 1}, {"return", 14, 0}, {"brz",    15, 1},
    {"brlz",   16, 1}, {"br",     17, 1}, {"HALT",   18, 0}, {"mul",    19, 0},
    {"div",    20, 0}, {"SET",    -2, 1}
};

static int error_count = 0;

struct Symbol {
    char name[32];
    int address;
    int used;
};

static struct Symbol SYMTAB[1000];
static int symtab_count = 0;

struct ParsedLine {
    int line_number;
    int location_counter;
    char label[32];
    char mnemonic[10];
    char operand[32];
    int has_label;
    int has_instruction;
    int is_directive;
};

static struct ParsedLine program[2000];
static int total_lines = 0;

/* Remove leading and trailing whitespace */
static void trim(char *s)
{
    char *p = s;
    int l;
    while (*p == ' ' || *p == '\t') p++;
    if (p != s) {
        memmove(s, p, strlen(p) + 1);
    }
    l = (int)strlen(s);
    while (l > 0 && (s[l - 1] == ' ' || s[l - 1] == '\t' || s[l - 1] == '\r' || s[l - 1] == '\n')) {
        s[--l] = '\0';
    }
}

/* Validate label syntax: must start with a letter, rest alphanumeric */
static int is_valid_label(const char *name)
{
    int i;
    if (name[0] == '\0' || !isalpha((unsigned char)name[0])) {
        return 0;
    }
    for (i = 1; name[i] != '\0'; i++) {
        if (!isalnum((unsigned char)name[i])) {
            return 0;
        }
    }
    return 1;
}

/* Search OPTAB for an instruction entry by mnemonic */
static const struct Instruction *find_instruction(const char *name)
{
    int i;
    int count = (int)(sizeof(OPTAB) / sizeof(OPTAB[0]));

    for (i = 0; i < count; i++) {
        if (strcmp(OPTAB[i].mnemonic, name) == 0) {
            return &OPTAB[i];
        }
    }
    return NULL;
}

/* Check if an operand looks like it was meant to be numeric (starts with digit, 0x, or sign) */
static int looks_numeric(const char *s)
{
    if (s[0] == '-' || s[0] == '+') {
        return (s[1] != '\0');
    }
    return isdigit((unsigned char)s[0]);
}

/* Validate a numeric operand string using strtol endptr */
static int is_valid_number(const char *s)
{
    char *endptr;
    strtol(s, &endptr, 0);
    return (*endptr == '\0' && s[0] != '\0');
}

/* Add a new symbol to SYMTAB; returns 0 on duplicate */
static int add_symbol(const char *name, int address)
{
    int i;
    for (i = 0; i < symtab_count; i++) {
        if (strcmp(SYMTAB[i].name, name) == 0) {
            return 0;
        }
    }
    if (symtab_count < 1000) {
        strncpy(SYMTAB[symtab_count].name, name, 31);
        SYMTAB[symtab_count].name[31] = '\0';
        SYMTAB[symtab_count].address = address;
        SYMTAB[symtab_count].used = 0;
        symtab_count++;
        return 1;
    }
    return 0;
}

/* Print the completed symbol table */
static void print_symtab(void)
{
    int i;
    printf("\n--- SYMBOL TABLE ---\n");
    for (i = 0; i < symtab_count; i++) {
        printf("%-10s -> address %d\n", SYMTAB[i].name, SYMTAB[i].address);
    }
}

/* Stage 1: Parse one source line into a ParsedLine, validating all syntax */
static void parse_line(int line_num, const char *line, struct ParsedLine *pl)
{
    char line_copy[256];
    char extra[32];
    char *comment;
    char *colon;
    char *stmt_ptr;
    int num_scanned;
    const struct Instruction *inst;

    memset(pl, 0, sizeof(*pl));
    pl->line_number = line_num;

    strncpy(line_copy, line, sizeof(line_copy) - 1);
    line_copy[sizeof(line_copy) - 1] = '\0';

    /* Strip comments: everything from the first ';' to end of line is ignored */
    comment = strchr(line_copy, ';');
    if (comment != NULL) {
        *comment = '\0';
    }

    trim(line_copy);

    if (line_copy[0] == '\0') {
        return;
    }

    /* --- Label extraction --- */
    colon = strchr(line_copy, ':');
    if (colon != NULL) {
        *colon = '\0';
        strncpy(pl->label, line_copy, sizeof(pl->label) - 1);
        pl->label[sizeof(pl->label) - 1] = '\0';
        trim(pl->label);

        if (pl->label[0] != '\0') {
            if (!is_valid_label(pl->label)) {
                printf("Line %d: Error: Invalid label name '%s'\n", line_num, pl->label);
                error_count++;
                return;
            }
            pl->has_label = 1;
        }
        stmt_ptr = colon + 1;
    } else {
        stmt_ptr = line_copy;
    }

    trim(stmt_ptr);
    if (stmt_ptr[0] == '\0') {
        return; /* label-only line or blank after colon */
    }

    /* --- Extract mnemonic and optional operand --- */
    extra[0] = '\0';
    num_scanned = sscanf(stmt_ptr, "%9s %31s %31s", pl->mnemonic, pl->operand, extra);

    /* Check for trailing garbage (third token) */
    if (num_scanned == 3) {
        printf("Line %d: Error: Extra text after operand '%s'\n", line_num, pl->operand);
        error_count++;
        return;
    }

    /* --- Validate mnemonic against OPTAB --- */
    inst = find_instruction(pl->mnemonic);
    if (inst == NULL) {
        printf("Line %d: Error: Unknown mnemonic '%s'\n", line_num, pl->mnemonic);
        error_count++;
        return;
    }

    /* --- Validate operand count --- */
    if (inst->requires_operand && num_scanned < 2) {
        printf("Line %d: Error: Missing operand for '%s'\n", line_num, pl->mnemonic);
        error_count++;
        return;
    }
    if (!inst->requires_operand && num_scanned >= 2) {
        printf("Line %d: Error: Unexpected operand for '%s'\n", line_num, pl->mnemonic);
        error_count++;
        return;
    }

    /* --- Validate numeric operand syntax (if it looks numeric) --- */
    if (inst->requires_operand && pl->operand[0] != '\0' && looks_numeric(pl->operand)) {
        if (!is_valid_number(pl->operand)) {
            printf("Line %d: Error: Invalid numeric operand '%s'\n", line_num, pl->operand);
            error_count++;
            return;
        }
    }

    /* --- SET requires a label on the same line --- */
    if (strcmp(pl->mnemonic, "SET") == 0 && !pl->has_label) {
        printf("Line %d: Error: SET requires a label\n", line_num);
        error_count++;
        return;
    }

    pl->has_instruction = 1;
    if (strcmp(pl->mnemonic, "data") == 0 || strcmp(pl->mnemonic, "SET") == 0) {
        pl->is_directive = 1;
    }
}

/* Pass 1: Assign location counter addresses and register valid labels in SYMTAB */
static void pass1(void)
{
    int lc = 0;
    int i;
    int is_set;
    int address;

    for (i = 0; i < total_lines; i++) {
        program[i].location_counter = lc;
        is_set = (strcmp(program[i].mnemonic, "SET") == 0);

        if (program[i].has_label) {
            if (is_set) {
                /* SET stores its value directly in place of the label address */
                address = (int)strtol(program[i].operand, NULL, 0);
            } else {
                address = lc;
            }
            if (!add_symbol(program[i].label, address)) {
                printf("Line %d: Error: Duplicate label '%s'\n", program[i].line_number, program[i].label);
                error_count++;
            }
        }

        /* SET is a pseudo-directive: it produces no machine word */
        if (program[i].has_instruction && !is_set) {
            lc++;
        }
    }
}

/* Look up a symbol name in SYMTAB; returns index or -1 if not found */
static int find_symbol(const char *name)
{
    int i;
    for (i = 0; i < symtab_count; i++) {
        if (strcmp(SYMTAB[i].name, name) == 0) {
            return i;
        }
    }
    return -1;
}

/* PC-relative instructions: call, brz, brlz, br (opcodes 13, 15, 16, 17) */
static int is_pc_relative(const struct Instruction *inst)
{
    return (inst->opcode == 13 || inst->opcode == 15 ||
            inst->opcode == 16 || inst->opcode == 17);
}

/* Resolve an operand to a numeric value, looking up symbols in SYMTAB */
static int resolve_operand(const struct ParsedLine *pl, long *value)
{
    int idx;

    if (pl->operand[0] != '\0' && !looks_numeric(pl->operand)) {
        idx = find_symbol(pl->operand);
        if (idx < 0) {
            printf("Line %d: Error: Undefined label '%s'\n", pl->line_number, pl->operand);
            error_count++;
            return 0;
        }
        SYMTAB[idx].used = 1;
        *value = (long)SYMTAB[idx].address;
    } else {
        *value = strtol(pl->operand, NULL, 0);
    }
    return 1;
}

/* Pass 2: Generate machine code from ParsedLine records */
static void pass2(void)
{
    int i;
    long operand;
    long word;
    const struct Instruction *inst;

    printf("\n--- PASS 2 OUTPUT ---\n");
    for (i = 0; i < total_lines; i++) {
        if (!program[i].has_instruction) {
            continue;
        }

        inst = find_instruction(program[i].mnemonic);

        /* SET is a pseudo-directive: it emits no machine code */
        if (strcmp(program[i].mnemonic, "SET") == 0) {
            continue;
        }

        if (program[i].is_directive && strcmp(program[i].mnemonic, "data") == 0) {
            if (!resolve_operand(&program[i], &operand)) {
                printf("\nPass 2 aborted due to undefined symbol(s).\n");
                return;
            }
            word = (long)(operand & 0xFFFFFFFFL);
            printf("LC %-2d | %08lX | Line %d: %s %s\n",
                   program[i].location_counter,
                   (unsigned long)word,
                   program[i].line_number,
                   program[i].mnemonic,
                   program[i].operand);
            continue;
        }

        if (inst->requires_operand) {
            if (!resolve_operand(&program[i], &operand)) {
                printf("\nPass 2 aborted due to undefined symbol(s).\n");
                return;
            }
            if (is_pc_relative(inst)) {
                operand = operand - (long)(program[i].location_counter + 1);
            }
        } else {
            operand = 0;
        }

        /* Validate the signed 24-bit operand range before encoding */
        if (operand < -8388608L || operand > 8388607L) {
            printf("Line %d: Error: Operand %ld out of signed 24-bit range for '%s'\n",
                   program[i].line_number, operand, program[i].mnemonic);
            error_count++;
            continue;
        }

        word = ((operand & 0xFFFFFFL) << 8) | (inst->opcode & 0xFF);
        printf("LC %-2d | %08lX | Line %d: %s %s\n",
               program[i].location_counter,
               (unsigned long)word,
               program[i].line_number,
               program[i].mnemonic,
               program[i].operand);
    }
}

/* Print all ParsedLine records stored in RAM */
static void print_parsed_lines(void)
{
    int i;
    printf("\n--- PARSED LINES (RAM) ---\n");
    for (i = 0; i < total_lines; i++) {
        printf("Line %d | LC %d | label: '%-6s' (has_label:%d) | mnemonic: '%-5s' | operand: '%-4s' (has_inst:%d, is_dir:%d)\n",
               program[i].line_number,
               program[i].location_counter,
               program[i].label,
               program[i].has_label,
               program[i].mnemonic,
               program[i].operand,
               program[i].has_instruction,
               program[i].is_directive);
    }
}

/* Reset global state so multiple test programs can run in sequence */
static void reset_program(void)
{
    total_lines = 0;
    symtab_count = 0;
    error_count = 0;
}

/* Minimal temporary harness: parse, Pass 1, and Pass 2 for one test program */
static void run_test(const char *title, const char **source, int count)
{
    int i;

    reset_program();
    printf("\n=== %s ===\n", title);

    for (i = 0; i < count; i++) {
        parse_line(i + 1, source[i], &program[total_lines]);
        total_lines++;
    }

    printf("\nSyntax errors: %d\n", error_count);

    /* Pass 1 */
    pass1();
    print_parsed_lines();
    print_symtab();

    /* Pass 2 (only if no errors) */
    if (error_count == 0) {
        pass2();
    } else {
        printf("\nPass 2 skipped due to errors.\n");
    }
}

int main(void)
{
    const char *error_source[6];
    const char *resolve_source[11];
    const char *undefined_source[2];
    const char *set_source[3];
    const char *set_multi_source[6];
    const char *set_nolabel_source[2];
    const char *comment_source[5];
    const char *range_ok_source[3];
    const char *range_bad_source[3];
    const char *range_sym_source[3];

    /* Test 2 error cases */
    error_source[0] = "fibble";
    error_source[1] = "0def: ldc 1";
    error_source[2] = "ldc";
    error_source[3] = "add 5";
    error_source[4] = "ldc 5, 6";
    error_source[5] = "ldc 08ge";

    /* Symbol resolution cases: numeric, backward/forward refs, branches */
    resolve_source[0]  = "ldc 5";
    resolve_source[1]  = "ldc -5";
    resolve_source[2]  = "ldc 0x10";
    resolve_source[3]  = "back: ldc 3";
    resolve_source[4]  = "ldc back";
    resolve_source[5]  = "ldc fwd";
    resolve_source[6]  = "br fwdbr";
    resolve_source[7]  = "loop: br loop";
    resolve_source[8]  = "add";
    resolve_source[9]  = "fwd: data 42";
    resolve_source[10] = "fwdbr: HALT";

    /* Undefined label case */
    undefined_source[0] = "ldc missing";
    undefined_source[1] = "HALT";

    /* Basic SET: value must not consume a word of memory */
    set_source[0] = "value: SET 25";
    set_source[1] = "ldc value";
    set_source[2] = "HALT";

    /* Multiple SET symbols together with a normal label */
    set_multi_source[0] = "a: SET 10";
    set_multi_source[1] = "b: SET 20";
    set_multi_source[2] = "start: ldc a";
    set_multi_source[3] = "ldc b";
    set_multi_source[4] = "add";
    set_multi_source[5] = "HALT";

    /* SET without a label is a parser error; valid form still parses */
    set_nolabel_source[0] = "SET 25";
    set_nolabel_source[1] = "value: SET 25";

    /* Comments: full-line, indented, after operand, after labelled instruction */
    comment_source[0] = "; full line comment";
    comment_source[1] = "   ; indented comment";
    comment_source[2] = "ldc 10 ; comment after instruction";
    comment_source[3] = "loop: br loop ; branch back";
    comment_source[4] = "HALT ; done";

    /* Signed 24-bit operand range: boundary values accepted */
    range_ok_source[0] = "ldc 8388607";
    range_ok_source[1] = "ldc -8388608";
    range_ok_source[2] = "HALT";

    /* Signed 24-bit operand range: overflow rejected, valid line still encodes */
    range_bad_source[0] = "ldc 8388608";
    range_bad_source[1] = "ldc -8388609";
    range_bad_source[2] = "ldc 5";

    /* Symbolic operand resolving out of range is rejected */
    range_sym_source[0] = "big: SET 8388608";
    range_sym_source[1] = "ldc big";
    range_sym_source[2] = "HALT";

    run_test("TEST A: PARSER ERRORS", error_source, 6);
    run_test("TEST B: SYMBOL RESOLUTION", resolve_source, 11);
    run_test("TEST C: UNDEFINED LABEL", undefined_source, 2);
    run_test("TEST D: BASIC SET", set_source, 3);
    run_test("TEST E: MULTIPLE SET + NORMAL LABEL", set_multi_source, 6);
    run_test("TEST F: SET WITHOUT LABEL", set_nolabel_source, 2);
    run_test("TEST G: COMMENTS", comment_source, 5);
    run_test("TEST H: RANGE VALID BOUNDS", range_ok_source, 3);
    run_test("TEST I: RANGE OVERFLOW", range_bad_source, 3);
    run_test("TEST J: SYMBOLIC RANGE OVERFLOW", range_sym_source, 3);

    return 0;
}
