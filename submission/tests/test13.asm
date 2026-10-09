; SHAURYA RANJAN SINGH
; Roll / User ID: 2501AI16
; Authorship: I declare that I have prepared and reviewed this submission and take responsibility for its contents.
; test13.asm  (division by zero; expected emulator runtime error)
        ldc 5      ; A = 5
        ldc 0      ; B = 5, A = 0 (the divisor)
        div        ; A := B / A -> division by zero
        HALT
