package vn.ecohome.pos0210.printing

object PrinterText {
    fun kitchenSample(): String = buildString {
        appendLine("              0210")
        appendLine("      BREAKFAST · COFFEE · DRINKS")
        appendLine("--------------------------------")
        appendLine("PHIEU LAM HANG")
        appendLine("THU TU RA DON #027")
        appendLine("BAN 02  ·  Don #2")
        appendLine("09:18")
        appendLine("--------------------------------")
        appendLine("2 x BUN GA")
        appendLine("    Ghi chu: khong hanh")
        appendLine("1 x BAC XIU")
        appendLine("1 x TRA DAO")
        appendLine("--------------------------------")
        appendLine("Order: TUAN")
        appendLine("        *** HET ***")
    }

    fun billSample(): String = buildString {
        appendLine("              0210")
        appendLine("      BREAKFAST · COFFEE · DRINKS")
        appendLine("--------------------------------")
        appendLine("BAN 02")
        appendLine("08:32 - 09:25")
        appendLine("--------------------------------")
        appendLine("2 x Bun ga             80.000d")
        appendLine("1 x Bac xiu            30.000d")
        appendLine("1 x Den da             25.000d")
        appendLine("--------------------------------")
        appendLine("TAM TINH              135.000d")
        appendLine("UU DAI HANG VIP -10%  -13.500d")
        appendLine("--------------------------------")
        appendLine("THANH TIEN            121.500d")
        appendLine("KHACH: ANH NAM")
        appendLine("HANG: VIP")
        appendLine("DIEM: 188 + 12 = 200")
        appendLine("Thanh toan: CHUYEN KHOAN")
        appendLine("--------------------------------")
        appendLine("Cam on quy khach!")
        appendLine("Good Food · Good Coffee · Brighter Day")
    }

    fun cancelSample(): String = buildString {
        appendLine("              0210")
        appendLine("          PHIEU HUY DON")
        appendLine("--------------------------------")
        appendLine("BAN 02  ·  DON #2")
        appendLine("HUY: 1 x TRA DAO")
        appendLine("Ly do: Khach doi y")
        appendLine("--------------------------------")
        appendLine("Manager: TUAN · 09:22")
    }
}
