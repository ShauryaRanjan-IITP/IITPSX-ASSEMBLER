; SHAURYA RANJAN SINGH
; Roll / User ID: 2501AI16
; Authorship: I declare that I have prepared and reviewed this submission and take responsibility for its contents.
; test06.asm - sum a sequence of integers
; vals = {4, 7, 2, 9, 5}; expected sum = 27, stored in 'result'.

n:      SET 5

        ldc 0x1000
        a2sp
        ldc 0
        stl 0               ; i = 0
        ldc 0
        stl 1               ; sum = 0
loop:
        ldl 0
        ldc n
        sub                 ; A = i - n
        brlz addit          ; i < n -> add vals[i]
        br done
addit:
        ldl 0
        ldc vals
        add                 ; A = &vals[i]
        ldnl 0              ; A = vals[i]
        ldl 1               ; push sum
        add                 ; A = vals[i] + sum
        stl 1               ; sum = A
        ldl 0
        adc 1
        stl 0               ; i = i + 1
        br loop
done:
        ldl 1               ; A = sum
        ldc result          ; B = sum, A = &result
        stnl 0              ; result = sum
        HALT

vals:   data 4
        data 7
        data 2
        data 9
        data 5
result: data 0
