// Starter buffer shown when no file is open.
// This is example source only; it is not assembled or executed in this phase.
export const STARTER_PROGRAM = `; Origo - IITPSx assembly workspace
; Instruction mnemonics and directives are case-insensitive; labels are not.
; A comment begins with ';'.

        ldc 6
        ldc 7
        mul        ; A := B * A
        ldc 2
        div        ; A := B / A
        HALT
`;
