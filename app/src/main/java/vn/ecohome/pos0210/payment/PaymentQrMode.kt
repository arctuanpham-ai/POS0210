package vn.ecohome.pos0210.payment

/**
 * The Soundbox merchant QR is the verified payment route for this installation.
 * Keep it as the default until Techcombank provides an approved dynamic merchant API.
 */
object PaymentQrMode {
    const val TECHCOMBANK_SOUNDBOX_STATIC = "TECHCOMBANK_SOUNDBOX_STATIC"
    const val VIETQR_ACCOUNT_DYNAMIC = "VIETQR_ACCOUNT_DYNAMIC"

    fun usesStaticSoundboxQr(value: String): Boolean =
        value.isBlank() || value == TECHCOMBANK_SOUNDBOX_STATIC

    fun allowsPhoneBankAnnouncements(value: String): Boolean =
        !usesStaticSoundboxQr(value)
}
