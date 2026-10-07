package vn.ecohome.pos0210.printing

enum class PaperSize(val settingValue:String){ MM58("58"),MM80("80") }

data class PrinterProfile(
    val paperSize:PaperSize,
    val paperWidthMm:Int,
    val printableWidthDots:Int,
    val charsPerLine:Int,
    val supportsRaster:Boolean=true,
    val supportsQrNative:Boolean=false,
    val transport:PrinterTransportProfile
){
    val label:String get()="${paperWidthMm}mm"
    val rasterStripeHeight:Int get()=transport.stripeHeight
    companion object{
        val MM58=PrinterProfile(PaperSize.MM58,58,384,32,transport=PrinterTransportProfile.XP_NB8H_58)
        val MM80=PrinterProfile(PaperSize.MM80,80,576,48,transport=PrinterTransportProfile.STANDARD_80)
        fun fromSetting(value:String?)=if(value==PaperSize.MM80.settingValue) MM80 else MM58
    }
}

data class PrinterTransportProfile(
    val stripeHeight:Int,
    val delayPerStripeMs:Long,
    val burstBytes:Int,
    val delayPerBurstMs:Long,
    val trailingFeedLines:Int,
    val hasAutoCutter:Boolean,
    val trailingBlankDots:Int=0,
    val postJobDrainMs:Long=0
){
    init{
        require(stripeHeight in 1..256)
        require(delayPerStripeMs>=0&&delayPerBurstMs>=0)
        require(burstBytes>=1024)
        require(trailingFeedLines in 0..12)
        require(trailingBlankDots in 0..400)
        require(postJobDrainMs>=0)
    }
    companion object{
        // Conservative pacing for the small Bluetooth receive buffer used by XP-NB8H.
        // About 20 mm of combined raster whitespace + line feed: enough to tear
        // cleanly without wasting the roughly 45-50 mm produced by candidate9.
        val XP_NB8H_58=PrinterTransportProfile(8,60,2048,150,2,false,96,1200)
        // Preserve candidate7 throughput/feed behavior for generic 80mm printers.
        val STANDARD_80=PrinterTransportProfile(96,0,32768,0,3,false,0,0)
    }
}

enum class PrintJobType{ KITCHEN,PAYMENT,TEST,CANCEL }
