; SHAURYA RANJAN SINGH
; Roll / User ID: 2501AI16
; Authorship: I declare that I have prepared and reviewed this submission and take responsibility for its contents.
; test11.asm - (a * b) / c using both mul and div
; a = 9, b = 8, c = 4; expected (9*8)/4 = 72/4 = 18, stored in 'result'.

a:      SET 9
b:      SET 8
c:      SET 4

        ldc 0x1000
        a2sp
        ldc a
        stl 0               ; local0 = a
        ldc b
        stl 1               ; local1 = b
        ldc c
        stl 2               ; local2 = c
        ldl 0
        ldl 1
        mul                 ; A = a * b
        stl 0               ; local0 = a * b
        ldl 0
        ldl 2
        div                 ; A = (a * b) / c
        ldc result
        stnl 0              ; result = value
        HALT

result: data 0
