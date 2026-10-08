; bubble_sort.asm
; Sorts the data array into ascending order using bubble sort.
; Uses only the IITPSx instruction set. SP is set to 0x1000 so that the
; ldl/stl offsets address a zeroed scratch area for the loop variables:
;   SP+0 = i, SP+1 = j, SP+2 = limit, SP+3 = tmpa, SP+4 = tmpb, SP+5 = addr

n:      SET 8

        ldc 0x1000
        a2sp
        ldc 0
        stl 0               ; i = 0
outer:
        ldc n
        ldl 0
        sub                 ; A = n - i
        adc -1              ; A = n - i - 1
        stl 2               ; limit = n - i - 1
        ldl 2
        brlz done           ; limit < 0 -> done
        brz done            ; limit == 0 -> done
        ldc 0
        stl 1               ; j = 0
inner:
        ldl 1               ; A = j
        ldl 2               ; B = j, A = limit
        sub                 ; A = j - limit
        brlz cmp            ; j < limit -> compare a[j], a[j+1]
        br nextouter
cmp:
        ldl 1
        ldc array
        add                 ; A = array + j
        ldnl 0              ; A = a[j]
        stl 3               ; tmpa = a[j]
        ldl 1
        adc 1
        ldc array
        add                 ; A = array + j + 1
        ldnl 0              ; A = a[j+1]
        stl 4               ; tmpb = a[j+1]
        ldl 3
        ldl 4
        sub                 ; A = tmpa - tmpb
        brlz noswap         ; tmpa < tmpb -> already ordered
        brz noswap          ; equal -> no swap
        ldl 1
        ldc array
        add
        stl 5               ; addr = array + j
        ldl 4               ; A = tmpb
        ldl 5               ; B = tmpb, A = addr
        stnl 0              ; a[j] = tmpb
        ldl 1
        adc 1
        ldc array
        add
        stl 5               ; addr = array + j + 1
        ldl 3               ; A = tmpa
        ldl 5               ; B = tmpa, A = addr
        stnl 0              ; a[j+1] = tmpa
noswap:
        ldl 1
        adc 1
        stl 1               ; j = j + 1
        br inner
nextouter:
        ldl 0
        adc 1
        stl 0               ; i = i + 1
        br outer
done:
        HALT

array:  data 5
        data 3
        data 8
        data 1
        data 9
        data 2
        data 7
        data 4
