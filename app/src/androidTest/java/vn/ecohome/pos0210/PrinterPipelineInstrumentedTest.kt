package vn.ecohome.pos0210

import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import vn.ecohome.pos0210.printing.EscPosRaster
import vn.ecohome.pos0210.printing.EscPosTransport
import vn.ecohome.pos0210.printing.PrinterProfile
import vn.ecohome.pos0210.printing.ReceiptRenderer

@RunWith(AndroidJUnit4::class)
class PrinterPipelineInstrumentedTest{
    private fun verify(commands:List<ByteArray>,profile:PrinterProfile){
        assertTrue(commands.size>1)
        commands.forEach{command->
            assertEquals(0x1D,command[0].toInt() and 0xFF)
            assertEquals(0x76,command[1].toInt() and 0xFF)
            assertEquals(profile.printableWidthDots/8,(command[4].toInt() and 0xFF) or ((command[5].toInt() and 0xFF) shl 8))
            assertTrue(command.size<8*1024)
        }
    }

    @Test fun longVietnameseKitchenFits58And80Profiles(){
        val items=listOf(
            Triple("Bún gà đùi chặt riêng kèm một bát bún không có nhân",12,"Không hành, ít bánh, nước dùng để riêng và thêm rau"),
            Triple("Bạc xỉu cà phê sữa nhiều đá",2,"Mang đi")
        )
        listOf(PrinterProfile.MM58,PrinterProfile.MM80).forEach{profile->
            val bitmap=ReceiptRenderer.kitchen("Bàn ngoài trời 123",999999,7,"Nhân viên Nguyễn Thị Hương",items,profile)
            assertEquals(profile.printableWidthDots,bitmap.width)
            verify(EscPosRaster.encode(bitmap,profile),profile)
        }
    }

    @Test fun paymentQrIsRasterWrappedAndTwentyJobsStayBounded(){
        val qr=Bitmap.createBitmap(320,320,Bitmap.Config.ARGB_8888).apply{
            eraseColor(Color.WHITE)
            for(y in 0 until height step 8)for(x in 0 until width step 8)if((x/8+y/8)%2==0)setPixel(x,y,Color.BLACK)
        }
        repeat(20){index->
            val items=List(12){Triple("Bạc xỉu cà phê sữa món số ${it+1}",if(it==0)12 else 1,30000L)}
            val bitmap=ReceiptRenderer.bill("Bàn 02","08:32–09:25",items,690000,0,0,690000,method="CHUYỂN KHOẢN",qr=qr,profile=PrinterProfile.MM58)
            val commands=EscPosRaster.encode(bitmap,PrinterProfile.MM58)
            verify(commands,PrinterProfile.MM58)
            assertTrue("job $index vượt guard",commands.sumOf{it.size}+5<768*1024)
        }
    }

    @Test fun twentyKitchenJobsStayBounded(){
        repeat(20){index->
            val items=List(10){Triple("Món tiếng Việt dài số ${it+1}",12,"Ghi chú dài không hành, ít bánh, để riêng")}
            val bitmap=ReceiptRenderer.kitchen("Bàn 24",index+1,index+1,"Nhân viên",items,PrinterProfile.MM58)
            val commands=EscPosRaster.encode(bitmap,PrinterProfile.MM58)
            verify(commands,PrinterProfile.MM58)
            assertTrue("kitchen job $index vượt guard",EscPosTransport.estimatedBytes(commands,PrinterProfile.MM58.transport)<768*1024)
        }
    }
}
