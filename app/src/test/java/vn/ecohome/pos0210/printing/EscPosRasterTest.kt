package vn.ecohome.pos0210.printing

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.OutputStream

class EscPosRasterTest{
    @Test fun profilesExposeIndependentPrintableWidths(){
        assertEquals(384,PrinterProfile.MM58.printableWidthDots)
        assertEquals(576,PrinterProfile.MM80.printableWidthDots)
        assertEquals(PrinterProfile.MM58,PrinterProfile.fromSetting(null))
        assertEquals(PrinterProfile.MM80,PrinterProfile.fromSetting("80"))
    }

    @Test fun stripeHasCompleteGsV0HeaderAndPackedPixels(){
        val command=EscPosRaster.encodeStripe(16,2){x,y->(y==0&&x==0)||(y==1&&x==15)}
        assertArrayEquals(byteArrayOf(0x1D,0x76,0x30,0x00,0x02,0x00,0x02,0x00),command.copyOfRange(0,8))
        assertArrayEquals(byteArrayOf(0x80.toByte(),0x00,0x00,0x01),command.copyOfRange(8,12))
    }

    @Test fun stripePayloadIsBoundedForSmallPrinterBuffers(){
        listOf(PrinterProfile.MM58,PrinterProfile.MM80).forEach{profile->
            val command=EscPosRaster.encodeStripe(profile.printableWidthDots,profile.rasterStripeHeight){_,_->false}
            assertTrue(command.size<8*1024)
            assertEquals(8+(profile.printableWidthDots/8)*profile.rasterStripeHeight,command.size)
        }
    }

    @Test fun xpNb8hTransportPacesEveryStripeAndBurst(){
        val policy=PrinterTransportProfile.XP_NB8H_58.copy(burstBytes=1024)
        val commands=List(5){ByteArray(600){it.toByte()}}
        val writes=mutableListOf<Int>();var flushes=0;val sleeps=mutableListOf<Long>()
        val out=object:OutputStream(){
            override fun write(b:Int){writes+=1}
            override fun write(b:ByteArray){writes+=b.size}
            override fun flush(){flushes++}
        }
        val stats=EscPosTransport.write(out,commands,policy){sleeps+=it}
        assertEquals(listOf(14,600,600,600,600,600,3),writes)
        assertEquals(7,flushes)
        assertEquals(5,sleeps.count{it==60L})
        assertEquals(2,sleeps.count{it==150L})
        assertEquals(1,sleeps.count{it==1200L})
        assertEquals(2,stats.burstCount)
        assertEquals(writes.sum(),stats.totalBytesSent)
    }

    @Test fun xpNb8hAddsRasterWhitespaceBeforeFeed(){
        val blank=EscPosRaster.blank(PrinterProfile.MM58,PrinterTransportProfile.XP_NB8H_58.trailingBlankDots)
        assertEquals(12,blank.size)
        assertTrue(blank.all{it.size==392})
        assertTrue(blank.all{command->command.drop(8).all{it==0.toByte()}})
    }

    @Test fun noCutterGetsCompactManualFeedAndCutterProfileStaysShort(){
        assertArrayEquals(byteArrayOf(0x1B,0x64,0x02),EscPosTransport.trailingCommand(PrinterTransportProfile.XP_NB8H_58))
        val cutter=PrinterTransportProfile.STANDARD_80.copy(trailingFeedLines=1,hasAutoCutter=true)
        assertArrayEquals(byteArrayOf(0x1B,0x64,0x01,0x1D,0x56,0x00),EscPosTransport.trailingCommand(cutter))
    }

    @Test fun transportFailureReportsStripeAndBytesAlreadySent(){
        val out=object:ByteArrayOutputStream(){var calls=0;override fun write(b:ByteArray){if(calls++==2)throw java.io.IOException("buffer closed") else super.write(b)}}
        val error=runCatching{EscPosTransport.write(out,List(4){ByteArray(100)},PrinterTransportProfile.XP_NB8H_58){}}.exceptionOrNull()
        assertTrue(error is PrintTransportException)
        error as PrintTransportException
        assertEquals(1,error.stripeIndex)
        assertEquals(114,error.bytesSent)
    }
}
