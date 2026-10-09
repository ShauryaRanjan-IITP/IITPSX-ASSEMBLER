; SHAURYA RANJAN SINGH
; Roll / User ID: 2501AI16
; Authorship: I declare that I have prepared and reviewed this submission and take responsibility for its contents.
; test10.asm - 5! by a loop (uses mul)
; expected 1*2*3*4*5 = 120, stored in 'result'.

n:      SET 5

        ldc 0x1000
        a2sp
        ldc 1
        stl 0               ; fact = 1
        ldc n
        stl 1               ; i = n
loop:
        ldl 1
        brz done            ; while i != 0
        ldl 0
        ldl 1
        mul                 ; A = fact * i
        stl 0               ; fact = A
        ldl 1
        adc -1
        stl 1               ; i = i - 1
        br loop
done:
        ldl 0
        ldc result
        stnl 0              ; result = n!
        HALT

result: data 0
