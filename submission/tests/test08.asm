; SHAURYA RANJAN SINGH
; Roll / User ID: 2501AI16
; Authorship: I declare that I have prepared and reviewed this submission and take responsibility for its contents.
; test08.asm - integer mean of {4, 7, 2, 9, 5} (uses div)
; sum = 27, n = 5; expected mean = 27 / 5 = 5, stored in 'result'.

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
        br divide
addit:
        ldl 0
        ldc vals
        add
        ldnl 0              ; A = vals[i]
        ldl 1
        add                 ; A = vals[i] + sum
        stl 1
        ldl 0
        adc 1
        stl 0               ; i = i + 1
        br loop
divide:
        ldl 1               ; A = sum
        ldc n               ; B = sum, A = n
        div                 ; A = sum / n
        ldc result
        stnl 0              ; result = mean
        HALT

vals:   data 4
        data 7
        data 2
        data 9
        data 5
result: data 0
