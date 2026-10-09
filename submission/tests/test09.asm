; SHAURYA RANJAN SINGH
; Roll / User ID: 2501AI16
; Authorship: I declare that I have prepared and reviewed this submission and take responsibility for its contents.
; test09.asm - minimum and maximum of {4, 7, 2, 9, 5, 1}
; expected min = 1, max = 9, stored in 'min' and 'max'.

n:      SET 6

        ldc 0x1000
        a2sp
        ldc array
        ldnl 0
        stl 1               ; min = array[0]
        ldc array
        ldnl 0
        stl 2               ; max = array[0]
        ldc 1
        stl 0               ; i = 1
loop:
        ldl 0
        ldc n
        sub                 ; A = i - n
        brlz body           ; i < n -> examine array[i]
        br done
body:
        ldl 0
        ldc array
        add
        ldnl 0              ; A = array[i]
        stl 3               ; v = array[i]
        ldl 3
        ldl 1
        sub                 ; A = v - min
        brlz setmin         ; v < min
        br chkmax
setmin:
        ldl 3
        stl 1               ; min = v
chkmax:
        ldl 3
        ldl 2
        sub                 ; A = v - max
        brlz next           ; v < max -> no change
        brz next            ; v == max -> no change
        ldl 3
        stl 2               ; max = v
next:
        ldl 0
        adc 1
        stl 0               ; i = i + 1
        br loop
done:
        ldl 1
        ldc min
        stnl 0              ; min = found minimum
        ldl 2
        ldc max
        stnl 0              ; max = found maximum
        HALT

array:  data 4
        data 7
        data 2
        data 9
        data 5
        data 1
min:    data 0
max:    data 0
