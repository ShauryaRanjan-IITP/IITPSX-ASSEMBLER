#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdarg.h>

#define MAX_SYMBOLS 1000
#define MAX_LINES 2000
#define MAX_LABEL_LEN 31

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
    int line_index;   /* program[] index of the defining line */
};

static struct Symbol SYMTAB[MAX_SYMBOLS];
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
    char listing_operand[32];   /* operand text chosen for the listing */
    int has_listing_operand;
    unsigned long word;         /* machine word emitted for this line */
    int has_word;
    char diag[96];              /* error/warning text shown in the listing */
};

static struct ParsedLine program[MAX_LINES];
static int total_lines = 0;

/* Pending symbolic SET references, resolved after Pass 1 */
struct SetRef {
    int label_index;      /* SYMTAB index of the SET label */
    int line_number;
    int program_index;    /* program[] index of the SET line */
    char target[32];      /* referenced symbol name */
};

static struct SetRef pending_sets[MAX_LINES];
static int pending_set_count = 0;
static int set_pending[MAX_SYMBOLS];
static int line_limit_reported = 0;

/* Case-insensitive comparison, used for instruction mnemonics only.
   Labels and operands remain case-sensitive. */
static int ci_equal(const char *a, const char *b)
{
    while (*a != '\0' && *b != '\0') {
        if (tolower((unsigned char)*a) != tolower((unsigned char)*b)) {
            return 0;
        }
        a++;
        b++;
    }
    return (*a == '\0' && *b == '\0');
}

/* Print a diagnostic and remember it on the source line for the listing.
   The first diagnostic recorded for a line is the one shown. */
static void report(struct ParsedLine *pl, const char *fmt, ...)
{
    char buf[192];
    va_list ap;

    va_start(ap, fmt);
    vsprintf(buf, fmt, ap);
    va_end(ap);
    printf("%s\n", buf);
    if (pl != NULL && pl->diag[0] == '\0') {
        strncpy(pl->diag, buf, sizeof(pl->diag) - 1);
        pl->diag[sizeof(pl->diag) - 1] = '\0';
    }
}

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

/* Search OPTAB for an instruction entry by mnemonic (case-insensitive) */
static const struct Instruction *find_instruction(const char *name)
{
    int i;
    int count = (int)(sizeof(OPTAB) / sizeof(OPTAB[0]));

    for (i = 0; i < count; i++) {
        if (ci_equal(OPTAB[i].mnemonic, name)) {
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

/* Parse a full 32-bit data/SET value; returns 1 on success.
   A leading '-' denotes a signed 32-bit value in the range
   -2147483648..-1; all other input is an unsigned 32-bit word. */
static int parse_word_value(const char *s, unsigned long *value)
{
    const char *p = s;
    char *endptr;
    int negative = 0;

    while (isspace((unsigned char)*p)) {
        p++;
    }
    if (*p == '-') {
        negative = 1;
        p++;
    }

    errno = 0;
    *value = strtoul(p, &endptr, 0);
    if (endptr == p || *endptr != '\0' || errno == ERANGE) {
        return 0;
    }

    if (negative) {
        if (*value > 2147483648UL) {
            return 0; /* below -2147483648 */
        }
        *value = (unsigned long)((0UL - *value) & 0xFFFFFFFFUL);
        return 1;
    }

#if ULONG_MAX > 0xFFFFFFFFUL
    if (*value > 0xFFFFFFFFUL) {
        return 0;
    }
#endif
    return 1;
}

/* Add a new symbol to SYMTAB. Returns 1 = added, 0 = duplicate, -1 = full */
static int add_symbol(const char *name, int address)
{
    int i;
    for (i = 0; i < symtab_count; i++) {
        if (strcmp(SYMTAB[i].name, name) == 0) {
            return 0;
        }
    }
    if (symtab_count < MAX_SYMBOLS) {
        strncpy(SYMTAB[symtab_count].name, name, MAX_LABEL_LEN);
        SYMTAB[symtab_count].name[MAX_LABEL_LEN] = '\0';
        SYMTAB[symtab_count].address = address;
        SYMTAB[symtab_count].used = 0;
        SYMTAB[symtab_count].line_index = -1;
        symtab_count++;
        return 1;
    }
    return -1;
}

/* Length of the operand token (second whitespace-delimited token) in a statement.
   Used to tell an over-long operand apart from genuine trailing text. */
static int operand_token_length(const char *stmt)
{
    const char *p = stmt;
    int len;

    while (isspace((unsigned char)*p)) p++;
    while (*p != '\0' && !isspace((unsigned char)*p)) p++;
    while (isspace((unsigned char)*p)) p++;
    len = 0;
    while (p[len] != '\0' && !isspace((unsigned char)p[len])) {
        len++;
    }
    return len;
}

/* Stage 1: Parse one source line into a ParsedLine, validating all syntax */
static void parse_line(int line_num, const char *line, struct ParsedLine *pl)
{
    char line_copy[1024];
    char extra[32];
    char *comment;
    char *colon;
    char *stmt_ptr;
    int num_scanned;
    int label_len;
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
        label_len = (int)(colon - line_copy);
        while (label_len > 0 &&
               (line_copy[label_len - 1] == ' ' || line_copy[label_len - 1] == '\t')) {
            label_len--;
        }
        if (label_len > 0) {
            if (label_len > MAX_LABEL_LEN) {
                report(pl, "Line %d: Error: Label too long", line_num);
                error_count++;
                return;
            }
            strncpy(pl->label, line_copy, (size_t)label_len);
            pl->label[label_len] = '\0';
            if (!is_valid_label(pl->label)) {
                report(pl, "Line %d: Error: Invalid label name '%s'", line_num, pl->label);
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

    /* Check for trailing garbage (third token). An operand token longer than
       MAX_LABEL_LEN is a label reference that does not fit; report it as an
       over-long label instead of silently truncating it. */
    if (num_scanned == 3) {
        if (operand_token_length(stmt_ptr) > MAX_LABEL_LEN) {
            report(pl, "Line %d: Error: Label too long", line_num);
        } else {
            report(pl, "Line %d: Error: Extra text after operand '%s'", line_num, pl->operand);
        }
        error_count++;
        return;
    }

    /* --- Validate mnemonic against OPTAB --- */
    inst = find_instruction(pl->mnemonic);
    if (inst == NULL) {
        report(pl, "Line %d: Error: Unknown mnemonic '%s'", line_num, pl->mnemonic);
        error_count++;
        return;
    }

    /* --- Validate operand count --- */
    if (inst->requires_operand && num_scanned < 2) {
        report(pl, "Line %d: Error: Missing operand for '%s'", line_num, pl->mnemonic);
        error_count++;
        return;
    }
    if (!inst->requires_operand && num_scanned >= 2) {
        report(pl, "Line %d: Error: Unexpected operand for '%s'", line_num, pl->mnemonic);
        error_count++;
        return;
    }

    /* --- Validate numeric operand syntax (if it looks numeric) --- */
    if (inst->requires_operand && pl->operand[0] != '\0' && looks_numeric(pl->operand)) {
        if (!is_valid_number(pl->operand)) {
            report(pl, "Line %d: Error: Invalid numeric operand '%s'", line_num, pl->operand);
            error_count++;
            return;
        }
    }

    /* --- SET requires a label on the same line --- */
    if (ci_equal(pl->mnemonic, "SET") && !pl->has_label) {
        report(pl, "Line %d: Error: SET requires a label", line_num);
        error_count++;
        return;
    }

    pl->has_instruction = 1;
    if (ci_equal(pl->mnemonic, "data") || ci_equal(pl->mnemonic, "SET")) {
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
    int rc;
    unsigned long value;

    for (i = 0; i < total_lines; i++) {
        program[i].location_counter = lc;
        is_set = ci_equal(program[i].mnemonic, "SET");

        if (program[i].has_label) {
            if (is_set && program[i].operand[0] != '\0'
                && !looks_numeric(program[i].operand)) {
                /* Symbolic SET: register a placeholder and resolve after Pass 1 */
                rc = add_symbol(program[i].label, 0);
                if (rc == 1) {
                    SYMTAB[symtab_count - 1].line_index = i;
                    pending_sets[pending_set_count].label_index = symtab_count - 1;
                    pending_sets[pending_set_count].line_number = program[i].line_number;
                    pending_sets[pending_set_count].program_index = i;
                    strncpy(pending_sets[pending_set_count].target,
                            program[i].operand, MAX_LABEL_LEN);
                    pending_sets[pending_set_count].target[MAX_LABEL_LEN] = '\0';
                    set_pending[symtab_count - 1] = 1;
                    pending_set_count++;
                } else if (rc == 0) {
                    report(&program[i], "Line %d: Error: Duplicate label '%s'",
                           program[i].line_number, program[i].label);
                    error_count++;
                } else {
                    report(&program[i], "Line %d: Error: Symbol table full, cannot add '%s'",
                           program[i].line_number, program[i].label);
                    error_count++;
                }
            } else {
                if (is_set) {
                    /* SET stores its value directly in place of the label address */
                    if (!parse_word_value(program[i].operand, &value)) {
                        report(&program[i], "Line %d: Error: Invalid SET value '%s'",
                               program[i].line_number, program[i].operand);
                        error_count++;
                        address = 0;
                    } else {
                        address = (int)(value & 0xFFFFFFFFUL);
                    }
                } else {
                    address = lc;
                }
                rc = add_symbol(program[i].label, address);
                if (rc == 0) {
                    report(&program[i], "Line %d: Error: Duplicate label '%s'",
                           program[i].line_number, program[i].label);
                    error_count++;
                } else if (rc < 0) {
                    report(&program[i], "Line %d: Error: Symbol table full, cannot add '%s'",
                           program[i].line_number, program[i].label);
                    error_count++;
                } else {
                    SYMTAB[symtab_count - 1].line_index = i;
                }
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

/* Find the first symbol defined at an address; returns index or -1 */
static int find_label_at_address(int address)
{
    int i;
    for (i = 0; i < symtab_count; i++) {
        if (SYMTAB[i].address == address) {
            return i;
        }
    }
    return -1;
}

/* Resolve symbolic SET references once all labels are known */
static void resolve_symbolic_sets(void)
{
    int k;
    int target;
    int changed;

    changed = 1;
    while (changed) {
        changed = 0;
        for (k = 0; k < pending_set_count; k++) {
            if (pending_sets[k].label_index < 0) {
                continue;
            }
            target = find_symbol(pending_sets[k].target);
            if (target < 0) {
                continue; /* undefined, reported below */
            }
            if (set_pending[target]) {
                continue; /* target not resolved yet */
            }
            SYMTAB[pending_sets[k].label_index].address = SYMTAB[target].address;
            SYMTAB[target].used = 1;
            set_pending[pending_sets[k].label_index] = 0;
            pending_sets[k].label_index = -1;
            changed = 1;
        }
    }

    for (k = 0; k < pending_set_count; k++) {
        if (pending_sets[k].label_index < 0) {
            continue;
        }
        target = find_symbol(pending_sets[k].target);
        if (target < 0) {
            report(&program[pending_sets[k].program_index],
                   "Line %d: Error: Undefined label '%s' in SET",
                   pending_sets[k].line_number, pending_sets[k].target);
        } else {
            report(&program[pending_sets[k].program_index],
                   "Line %d: Error: Circular SET reference for '%s'",
                   pending_sets[k].line_number,
                   SYMTAB[pending_sets[k].label_index].name);
        }
        error_count++;
    }
    pending_set_count = 0;
}

/* PC-relative instructions: call, brz, brlz, br (opcodes 13, 15, 16, 17) */
static int is_pc_relative(const struct Instruction *inst)
{
    return (inst->opcode == 13 || inst->opcode == 15 ||
            inst->opcode == 16 || inst->opcode == 17);
}

/* Resolve an operand to a numeric value, looking up symbols in SYMTAB */
static int resolve_operand(struct ParsedLine *pl, long *value)
{
    int idx;

    if (pl->operand[0] != '\0' && !looks_numeric(pl->operand)) {
        idx = find_symbol(pl->operand);
        if (idx < 0) {
            report(pl, "Line %d: Error: Undefined label '%s'", pl->line_number, pl->operand);
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

/* Resolve a data operand to a full 32-bit value */
static int resolve_data_operand(struct ParsedLine *pl, unsigned long *value)
{
    int idx;

    if (pl->operand[0] != '\0' && !looks_numeric(pl->operand)) {
        idx = find_symbol(pl->operand);
        if (idx < 0) {
            report(pl, "Line %d: Error: Undefined label '%s'", pl->line_number, pl->operand);
            error_count++;
            return 0;
        }
        SYMTAB[idx].used = 1;
        *value = (unsigned long)(unsigned int)SYMTAB[idx].address;
    } else if (!parse_word_value(pl->operand, value)) {
        report(pl, "Line %d: Error: Invalid data value '%s'", pl->line_number, pl->operand);
        error_count++;
        return 0;
    }
    return 1;
}

/* Write one 32-bit machine word to the object file as little-endian bytes */
static int write_object_word(FILE *out, unsigned long word)
{
    unsigned char bytes[4];

    if (out == NULL) {
        return 1;
    }
    bytes[0] = (unsigned char)(word & 0xFF);
    bytes[1] = (unsigned char)((word >> 8) & 0xFF);
    bytes[2] = (unsigned char)((word >> 16) & 0xFF);
    bytes[3] = (unsigned char)((word >> 24) & 0xFF);
    if (fwrite(bytes, 1, 4, out) != 4) {
        printf("Error: Failed writing object file\n");
        error_count++;
        return 0;
    }
    return 1;
}

/* Save the operand text shown for a line in the listing */
static void set_listing_operand(struct ParsedLine *pl, const char *op)
{
    if (op != NULL) {
        strncpy(pl->listing_operand, op, sizeof(pl->listing_operand) - 1);
        pl->listing_operand[sizeof(pl->listing_operand) - 1] = '\0';
        pl->has_listing_operand = 1;
    } else {
        pl->has_listing_operand = 0;
    }
}

/* Write a label-only row to the listing file; diag may be NULL */
static void write_listing_label(FILE *lst, int address, const char *name,
                                const char *diag)
{
    if (lst == NULL) {
        return;
    }
    fprintf(lst, "%08X          %s:", (unsigned int)address, name);
    if (diag != NULL && diag[0] != '\0') {
        fprintf(lst, "  %s", diag);
    }
    fprintf(lst, "\n");
}

/* Write a machine-word row to the listing file; operand/diag may be NULL */
static void write_listing_word(FILE *lst, int address, unsigned long word,
                               const char *mnemonic, const char *operand,
                               const char *diag)
{
    if (lst == NULL) {
        return;
    }
    fprintf(lst, "%08X %08X %s", (unsigned int)address, (unsigned int)word, mnemonic);
    if (operand != NULL) {
        fprintf(lst, " %s", operand);
    }
    if (diag != NULL && diag[0] != '\0') {
        fprintf(lst, "  %s", diag);
    }
    fprintf(lst, "\n");
}

/* Write a diagnostic row for a source line with no address/word row */
static void write_listing_diag(FILE *lst, int address, const char *diag)
{
    if (lst == NULL) {
        return;
    }
    fprintf(lst, "%08X          %s\n", (unsigned int)address, diag);
}

/* Choose the operand text shown for a PC-relative branch in the listing:
   a symbolic source operand is kept as written; a numeric offset is resolved
   to a label at its target address when one exists. */
static const char *branch_listing_operand(const struct ParsedLine *pl, long offset)
{
    int target;
    int idx;

    if (pl->operand[0] != '\0' && !looks_numeric(pl->operand)) {
        return pl->operand;
    }

    target = (int)(offset + (long)(pl->location_counter + 1));
    idx = find_label_at_address(target);
    if (idx >= 0) {
        return SYMTAB[idx].name;
    }
    return pl->operand;
}

/* Pass 2: Generate machine code from ParsedLine records and record the
   information needed to write the listing afterwards. */
static void pass2(FILE *obj)
{
    int i;
    long operand;
    unsigned long word;
    unsigned long uword;
    const char *disp_operand;
    const struct Instruction *inst;

    for (i = 0; i < total_lines; i++) {
        if (!program[i].has_instruction) {
            continue;
        }

        inst = find_instruction(program[i].mnemonic);

        /* SET is a pseudo-directive: it emits no machine code */
        if (ci_equal(program[i].mnemonic, "SET")) {
            continue;
        }

        if (program[i].is_directive && ci_equal(program[i].mnemonic, "data")) {
            if (!resolve_data_operand(&program[i], &uword)) {
                printf("\nPass 2 aborted due to undefined symbol(s).\n");
                return;
            }
            word = uword & 0xFFFFFFFFUL;
            program[i].word = word;
            program[i].has_word = 1;
            set_listing_operand(&program[i], program[i].operand);
            if (!write_object_word(obj, (unsigned long)word)) {
                return;
            }
            continue;
        }

        if (inst->requires_operand) {
            if (!resolve_operand(&program[i], &operand)) {
                printf("\nPass 2 aborted due to undefined symbol(s).\n");
                return;
            }
            /* Symbolic branch operands are addresses; numeric ones are offsets */
            if (is_pc_relative(inst) && program[i].operand[0] != '\0'
                && !looks_numeric(program[i].operand)) {
                operand = operand - (long)(program[i].location_counter + 1);
            }
        } else {
            operand = 0;
        }

        /* Validate the signed 24-bit operand range before encoding */
        if (operand < -8388608L || operand > 8388607L) {
            report(&program[i],
                   "Line %d: Error: Operand %ld out of signed 24-bit range for '%s'",
                   program[i].line_number, operand, program[i].mnemonic);
            error_count++;
            continue;
        }

        word = ((unsigned long)(operand & 0xFFFFFFL) << 8) |
               (unsigned long)(inst->opcode & 0xFF);
        program[i].word = word;
        program[i].has_word = 1;

        disp_operand = NULL;
        if (inst->requires_operand) {
            if (is_pc_relative(inst)) {
                disp_operand = branch_listing_operand(&program[i], operand);
            } else {
                disp_operand = program[i].operand;
            }
        }
        set_listing_operand(&program[i], disp_operand);

        if (!write_object_word(obj, (unsigned long)word)) {
            return;
        }
    }
}

/* Write the listing file, appending any recorded diagnostic to its line */
static void write_listing(FILE *lst)
{
    int i;
    int addr;
    int label_index;
    int printed;

    if (lst == NULL) {
        return;
    }

    for (i = 0; i < total_lines; i++) {
        printed = 0;

        if (program[i].has_label) {
            if (ci_equal(program[i].mnemonic, "SET")) {
                label_index = find_symbol(program[i].label);
                addr = (label_index >= 0) ? SYMTAB[label_index].address : 0;
            } else {
                addr = program[i].location_counter;
            }
            if (!program[i].has_word && program[i].diag[0] != '\0') {
                write_listing_label(lst, addr, program[i].label, program[i].diag);
            } else {
                write_listing_label(lst, addr, program[i].label, "");
            }
            printed = 1;
        }

        if (program[i].has_word) {
            write_listing_word(lst, program[i].location_counter, program[i].word,
                               program[i].mnemonic,
                               program[i].has_listing_operand
                                   ? program[i].listing_operand : NULL,
                               program[i].diag);
            printed = 1;
        }

        if (!printed && program[i].diag[0] != '\0') {
            write_listing_diag(lst, program[i].location_counter, program[i].diag);
        }
    }
}

/* Warn about symbols that were defined but never referenced (non-fatal) */
static void print_unused_warnings(void)
{
    int i;
    for (i = 0; i < symtab_count; i++) {
        if (SYMTAB[i].used == 0) {
            if (SYMTAB[i].line_index >= 0) {
                report(&program[SYMTAB[i].line_index],
                       "Warning: Unused label '%s'", SYMTAB[i].name);
            } else {
                printf("Warning: Unused label '%s'\n", SYMTAB[i].name);
            }
        }
    }
}

/* Reset global state before assembling a source file */
static void reset_program(void)
{
    total_lines = 0;
    symtab_count = 0;
    error_count = 0;
    pending_set_count = 0;
    line_limit_reported = 0;
    memset(set_pending, 0, sizeof(set_pending));
}

/* Parse one source line and append it to the parsed program */
static void add_source_line(int line_num, const char *line)
{
    if (total_lines >= MAX_LINES) {
        if (!line_limit_reported) {
            printf("Line %d: Error: too many source lines (max %d)\n",
                   line_num, MAX_LINES);
            line_limit_reported = 1;
        }
        error_count++;
        return;
    }
    parse_line(line_num, line, &program[total_lines]);
    total_lines++;
}

/* Run Pass 1, then Pass 2 and unused-label warnings */
static void run_passes(FILE *obj, FILE *lst)
{
    printf("\nSyntax errors: %d\n", error_count);

    /* Pass 1 */
    pass1();
    resolve_symbolic_sets();

    /* Pass 2 (only if no errors) */
    if (error_count == 0) {
        pass2(obj);
        if (error_count == 0) {
            print_unused_warnings();
        }
    } else {
        printf("\nPass 2 skipped due to errors.\n");
    }

    /* Write the listing even when assembly fails so diagnostics are visible */
    write_listing(lst);
}

/* Derive an output file name by replacing the source extension with ext */
static void make_output_name(const char *src, const char *ext, char *dst, int size)
{
    const char *p;
    const char *dot = NULL;
    int len;

    for (p = src; *p != '\0'; p++) {
        if (*p == '.' || *p == '/' || *p == '\\') {
            dot = (*p == '.') ? p : NULL;
        }
    }

    len = (dot != NULL) ? (int)(dot - src) : (int)strlen(src);
    if (len > size - 1 - (int)strlen(ext)) {
        len = size - 1 - (int)strlen(ext);
    }
    strncpy(dst, src, len);
    dst[len] = '\0';
    strcat(dst, ext);
}

/* Read one source line, treating LF, CRLF and CR as line endings.
   Returns 1 if a line was read, 0 at end of file. Sets *too_long if the
   physical line did not fit in buf. */
static int read_source_line(FILE *fp, char *buf, int size, int *too_long)
{
    int c;
    int len = 0;

    *too_long = 0;
    c = fgetc(fp);
    if (c == EOF) {
        return 0;
    }
    while (c != EOF && c != '\n' && c != '\r') {
        if (len < size - 1) {
            buf[len++] = (char)c;
        } else {
            *too_long = 1;
        }
        c = fgetc(fp);
    }
    buf[len] = '\0';
    if (c == '\r') {
        c = fgetc(fp);
        if (c != '\n' && c != EOF) {
            ungetc(c, fp);
        }
    }
    return 1;
}

/* Assemble a source file: read line by line and feed the existing parser */
static int assemble_file(const char *filename)
{
    FILE *fp;
    FILE *obj;
    FILE *lst;
    char line[1024];
    char objname[260];
    char lstname[260];
    int line_num = 0;
    int too_long;

    fp = fopen(filename, "r");
    if (fp == NULL) {
        printf("Error: Cannot open source file '%s'\n", filename);
        return 0;
    }

    reset_program();
    printf("\n=== FILE: %s ===\n", filename);

    while (read_source_line(fp, line, (int)sizeof(line), &too_long)) {
        line_num++;
        if (too_long) {
            printf("Line %d: Error: source line too long\n", line_num);
            error_count++;
            continue;
        }
        add_source_line(line_num, line);
    }

    if (ferror(fp)) {
        printf("Error: Failed while reading '%s'\n", filename);
        error_count++;
    }
    fclose(fp);

    make_output_name(filename, ".o", objname, (int)sizeof(objname));
    make_output_name(filename, ".lst", lstname, (int)sizeof(lstname));

    obj = fopen(objname, "wb");
    if (obj == NULL) {
        printf("Error: Cannot open object file '%s'\n", objname);
        return 0;
    }

    lst = fopen(lstname, "w");
    if (lst == NULL) {
        printf("Error: Cannot open listing file '%s'\n", lstname);
        fclose(obj);
        remove(objname);
        return 0;
    }

    run_passes(obj, lst);

    if (fclose(obj) != 0) {
        printf("Error: Failed writing object file '%s'\n", objname);
        error_count++;
    }
    if (fclose(lst) != 0) {
        printf("Error: Failed writing listing file '%s'\n", lstname);
        error_count++;
    }

    if (error_count != 0) {
        remove(objname);
        printf("Object file not produced due to errors; listing written.\n");
        return 0;
    }

    printf("Object file '%s' written.\n", objname);
    printf("Listing file '%s' written.\n", lstname);
    return 1;
}

int main(int argc, char *argv[])
{
    if (argc != 2) {
        printf("Usage: %s <source.asm>\n", argv[0]);
        return 1;
    }

    return assemble_file(argv[1]) ? 0 : 1;
}
