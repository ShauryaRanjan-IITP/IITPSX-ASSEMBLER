; SHAURYA RANJAN SINGH
; Roll / User ID: 2501AI16
; Authorship: I declare that I have prepared and reviewed this submission and take responsibility for its contents.
; test07.asm - polynomial 3x^2 + 2x + 5 evaluated at x = 4 (uses mul)
; expected = 3*16 + 2*4 + 5 = 61, stored in 'result'.

a:      SET 3
b:      SET 2
c:      SET 5

        ldc 0x1000
        a2sp
        ldc x
        ldnl 0
        stl 0               ; local0 = x
        ldl 0
        ldl 0
        mul                 ; A = x * x
        stl 1               ; local1 = x^2
        ldl 1
        ldc a
        mul                 ; A = a * x^2
        stl 1               ; local1 = a*x^2
        ldl 0
        ldc b
        mul                 ; A = b * x
        ldl 1               ; push a*x^2
        add                 ; A = b*x + a*x^2
        adc c               ; A = A + c
        ldc result
        stnl 0              ; result = polynomial value
        HALT

x:      data 4
result: data 0
