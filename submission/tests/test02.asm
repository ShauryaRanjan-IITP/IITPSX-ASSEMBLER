; SHAURYA RANJAN SINGH
; Roll / User ID: 2501AI16
; Authorship: I declare that I have prepared and reviewed this submission and take responsibility for its contents.
; test02.asm  (PDF test2: error handling; expected to fail assembly)
label:
label: ; duplicate label definition
br nonesuch ; no such label
ldc 08ge ; not a number
ldc ; missing operand
add 5 ; unexpected operand
ldc 5, 6; extra on end of line
0def: ; bogus label name
fibble; bogus mnemonic
0def ; bogus mnemonic
