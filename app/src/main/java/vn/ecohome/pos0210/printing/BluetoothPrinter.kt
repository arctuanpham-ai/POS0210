package vn.ecohome.pos0210.printing

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.*
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.OutputStream
import java.util.UUID

data class PrinterDevice(val name:String,val address:String)

object BluetoothPrinter {
    const val PROFILE_NAME="Xprinter XP-NB8H"
    const val PAPER_MM=58
    const val DPI=203
    private const val TAG="POS0210_PRINT"
    private const val MAX_JOB_BYTES=768*1024
    private val PRINT_LOCK=Any()
    private val SPP_UUID:UUID=UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    fun hasPermission(context:Context):Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(context,Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    fun pairedDevices(context:Context):List<PrinterDevice>{
        if(!hasPermission(context)) return emptyList()
        val adapter=(context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter ?: return emptyList()
        return try {
            adapter.bondedDevices
                .map{PrinterDevice(it.name ?: "Bluetooth printer",it.address)}
                .sortedBy{it.name.lowercase()}
        } catch(_:SecurityException){ emptyList() }
    }

    fun printBitmap(context:Context,address:String,bitmap:Bitmap,profile:PrinterProfile=PrinterProfile.MM58,jobType:PrintJobType=PrintJobType.TEST):Result<Unit> =
        synchronized(PRINT_LOCK){printBitmapLocked(context,address,bitmap,profile,jobType)}

    @SuppressLint("MissingPermission")
    private fun printBitmapLocked(context:Context,address:String,bitmap:Bitmap,profile:PrinterProfile,jobType:PrintJobType):Result<Unit> = runCatching {
        require(address.isNotBlank()){"Chưa chọn máy in Bluetooth"}
        require(hasPermission(context)){"Chưa cấp quyền Bluetooth"}
        val adapter=(context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
            ?: error("Thiết bị không hỗ trợ Bluetooth")
        val device=adapter.getRemoteDevice(address)
        require(profile.supportsRaster){"Profile không hỗ trợ raster"}
        val raster=EscPosRaster.encode(bitmap,profile).toMutableList().apply{addAll(EscPosRaster.blank(profile,profile.transport.trailingBlankDots))}
        val textBytes=0
        val rasterBytes=raster.sumOf{it.size}
        val totalBytes=EscPosTransport.estimatedBytes(raster,profile.transport)
        require(totalBytes in 1..MAX_JOB_BYTES){"PRINT_JOB_SIZE_INVALID:$totalBytes"}
        val policy=profile.transport
        Log.i(TAG,"PRINT START printer=${device.name ?: "unknown"} mac=$address profile=${profile.label} dots=${profile.printableWidthDots} type=$jobType bitmap=${bitmap.width}x${bitmap.height} stripes=${raster.size} textBytes=$textBytes rasterBytes=$rasterBytes totalBytes=$totalBytes qrMode=raster pacing=${policy.delayPerStripeMs}ms/${policy.burstBytes}B/${policy.delayPerBurstMs}ms blankDots=${policy.trailingBlankDots} feed=${policy.trailingFeedLines} drain=${policy.postJobDrainMs}ms cutter=${policy.hasAutoCutter}")
        adapter.cancelDiscovery()
        try{
            device.createRfcommSocketToServiceRecord(SPP_UUID).use { socket ->
                socket.connect()
                socket.outputStream.use { out ->
                    val stats=EscPosTransport.write(out,raster,policy)
                    Log.i(TAG,"transport stripes=${stats.stripeCount} bursts=${stats.burstCount} sent=${stats.totalBytesSent}")
                }
            }
            Log.i(TAG,"PRINT SUCCESS printer=${device.name ?: "unknown"} mac=$address profile=${profile.label} type=$jobType totalBytes=$totalBytes")
        }catch(t:Throwable){
            val transport=t as? PrintTransportException
            Log.e(TAG,"PRINT FAILURE printer=${device.name ?: "unknown"} mac=$address profile=${profile.label} type=$jobType stripe=${transport?.stripeIndex ?: -1} sent=${transport?.bytesSent ?: 0} totalBytes=$totalBytes",t)
            throw t
        }
    }
}

data class PrintTransportStats(val stripeCount:Int,val burstCount:Int,val totalBytesSent:Int)
class PrintTransportException(val stripeIndex:Int,val bytesSent:Int,cause:Throwable):Exception("TRANSPORT_FAILED stripe=$stripeIndex sent=$bytesSent",cause)

object EscPosTransport{
    private val RESET=byteArrayOf(0x1B,0x40,0x1B,0x61,0x00,0x1B,0x32,0x1D,0x4C,0x00,0x00,0x1B,0x21,0x00)
    internal fun trailingCommand(policy:PrinterTransportProfile):ByteArray = if(policy.hasAutoCutter){
        byteArrayOf(0x1B,0x64,policy.trailingFeedLines.toByte(),0x1D,0x56,0x00)
    }else byteArrayOf(0x1B,0x64,policy.trailingFeedLines.toByte())
    fun estimatedBytes(commands:List<ByteArray>,policy:PrinterTransportProfile)=RESET.size+commands.sumOf{it.size}+trailingCommand(policy).size

    fun write(out:OutputStream,commands:List<ByteArray>,policy:PrinterTransportProfile,sleep:(Long)->Unit={Thread.sleep(it)}):PrintTransportStats{
        require(commands.isNotEmpty()){ "RASTER_EMPTY" }
        var sent=0;var burstBytes=0;var bursts=0;var stripeIndex=-1
        try{
            out.write(RESET);out.flush();sent+=RESET.size
            commands.forEachIndexed{index,command->
                stripeIndex=index
                require(command.size<=policy.burstBytes){"STRIPE_EXCEEDS_BURST:${command.size}"}
                out.write(command);out.flush();sent+=command.size;burstBytes+=command.size
                if(policy.delayPerStripeMs>0)sleep(policy.delayPerStripeMs)
                if(burstBytes>=policy.burstBytes&&index<commands.lastIndex){
                    bursts++;burstBytes=0
                    if(policy.delayPerBurstMs>0)sleep(policy.delayPerBurstMs)
                }
            }
            val trailing=trailingCommand(policy)
            out.write(trailing);out.flush();sent+=trailing.size
            if(policy.postJobDrainMs>0)sleep(policy.postJobDrainMs)
            return PrintTransportStats(commands.size,bursts,sent)
        }catch(t:Throwable){throw PrintTransportException(stripeIndex,sent,t)}
    }
}

object EscPosRaster{
    fun encode(src:Bitmap,profile:PrinterProfile):List<ByteArray>{
        require(src.width>0&&src.height>0){"Bitmap rỗng"}
        val width=profile.printableWidthDots
        val targetHeight=(src.height.toLong()*width/src.width).toInt()
        require(targetHeight in 1..10000){"RASTER_HEIGHT_INVALID:$targetHeight"}
        val scaled=if(src.width==width) src else Bitmap.createScaledBitmap(src,width,targetHeight,true)
        val commands=mutableListOf<ByteArray>()
        var top=0
        while(top<scaled.height){
            val height=minOf(profile.rasterStripeHeight,scaled.height-top)
            commands+=encodeStripe(width,height){x,y->
                val c=scaled.getPixel(x,top+y)
                (Color.red(c)*30+Color.green(c)*59+Color.blue(c)*11)/100<160
            }
            top+=height
        }
        if(scaled!==src) scaled.recycle()
        return commands
    }

    internal fun encodeStripe(width:Int,height:Int,isBlack:(Int,Int)->Boolean):ByteArray{
        require(width>0&&height>0)
        val bytesPerRow=(width+7)/8
        val command=ByteArray(8+bytesPerRow*height)
        command[0]=0x1D;command[1]=0x76;command[2]=0x30;command[3]=0x00
        command[4]=(bytesPerRow and 0xFF).toByte();command[5]=((bytesPerRow shr 8) and 0xFF).toByte()
        command[6]=(height and 0xFF).toByte();command[7]=((height shr 8) and 0xFF).toByte()
        for(y in 0 until height)for(x in 0 until width)if(isBlack(x,y)){
            val i=8+y*bytesPerRow+x/8
            command[i]=(command[i].toInt() or (0x80 shr (x%8))).toByte()
        }
        return command
    }

    fun blank(profile:PrinterProfile,height:Int):List<ByteArray>{
        if(height<=0)return emptyList()
        val result=mutableListOf<ByteArray>();var remaining=height
        while(remaining>0){
            val stripe=minOf(profile.rasterStripeHeight,remaining)
            result+=encodeStripe(profile.printableWidthDots,stripe){_,_->false}
            remaining-=stripe
        }
        return result
    }
}

object ReceiptRenderer {
    private var W=384
    private var PAD=18f

    private fun paint(size:Float,bold:Boolean=false,align:Paint.Align=Paint.Align.LEFT)=Paint(Paint.ANTI_ALIAS_FLAG).apply{
        color=Color.BLACK
        textSize=size
        typeface=if(bold) Typeface.create(Typeface.DEFAULT,Typeface.BOLD) else Typeface.create(Typeface.DEFAULT,Typeface.NORMAL)
        textAlign=align
    }

    private fun canvas(height:Int):Pair<Bitmap,Canvas>{
        val b=Bitmap.createBitmap(W,height,Bitmap.Config.ARGB_8888)
        val c=Canvas(b)
        c.drawColor(Color.WHITE)
        return b to c
    }

    @Synchronized
    fun sampleBill(qr:Bitmap?,profile:PrinterProfile=PrinterProfile.MM58):Bitmap = bill(
        table="BÀN 02",
        period="08:32–09:25",
        items=listOf(Triple("Bún gà",2,40000L),Triple("Bạc xỉu",1,30000L),Triple("Đen đá",1,25000L)),
        subtotal=135000L,
        surcharge=0L,
        discount=13500L,
        total=121500L,
        adjustmentLines=listOf("ƯU ĐÃI HẠNG VIP  -10%"),
        customerName="ANH NAM",
        customerTier="VIP",
        pointsBefore=188,
        pointsEarned=12,
        pointsAfter=200,
        method="CHUYỂN KHOẢN",
        qr=qr,profile=profile
    )

    @Synchronized
    fun bill(
        table:String,
        period:String,
        items:List<Triple<String,Int,Long>>,
        subtotal:Long,
        surcharge:Long=0L,
        discount:Long=0L,
        total:Long,
        adjustmentLines:List<String> = emptyList(),
        customerName:String="KHÁCH LẠ",
        customerTier:String?=null,
        pointsBefore:Int=0,
        pointsEarned:Int=0,
        pointsAfter:Int=0,
        method:String,
        qr:Bitmap?,
        profile:PrinterProfile=PrinterProfile.MM58,
        orderTag:String?=null
    ):Bitmap{
        dimensions(profile)
        val adjustmentHeight = (if(surcharge>0) 44 else 0) + (if(discount>0) 44 else 0) + adjustmentLines.size*34
        val customerHeight=if(customerTier!=null)140 else 70
        val estimated=(if(orderTag!=null)300 else 0)+1000+items.size*150+adjustmentHeight+customerHeight+(if(qr!=null)520 else 0)
        val (b,c)=canvas(estimated)
        var y=62f
        c.drawText("0210",W/2f,y,paint(58f,true,Paint.Align.CENTER));y+=32
        c.drawText("BREAKFAST · COFFEE · DRINKS",W/2f,y,paint(20f,false,Paint.Align.CENTER));y+=44
        c.drawText("BILL THANH TOÁN",W/2f,y,paint(34f,true,Paint.Align.CENTER));y+=32
        if(orderTag!=null){
            y+=44
            c.drawText(table.uppercase(),W/2f,y,paint(72f,true,Paint.Align.CENTER));y+=46
            c.drawText(orderTag,W/2f,y,paint(36f,true,Paint.Align.CENTER));y+=32
            c.drawText(period,W/2f,y,paint(22f,false,Paint.Align.CENTER));y+=28
        }else{
            c.drawText("${table.uppercase()}  ·  $period",W/2f,y,paint(24f,true,Paint.Align.CENTER));y+=28
        }
        line(c,y);y+=38
        items.forEach{(name,qty,unitPrice)->
            y=item(c,y,"$qty × $name",money(unitPrice*qty))
        }
        line(c,y);y+=40
        c.drawText("TẠM TÍNH",PAD,y,paint(26f,true))
        c.drawText(money(subtotal),W-PAD,y,paint(26f,true,Paint.Align.RIGHT));y+=40
        if(surcharge>0){
            c.drawText("PHỤ THU",PAD,y,paint(24f,true))
            c.drawText("+${money(surcharge)}",W-PAD,y,paint(24f,true,Paint.Align.RIGHT));y+=38
        }
        if(discount>0){
            c.drawText("ƯU ĐÃI",PAD,y,paint(24f,true))
            c.drawText("-${money(discount)}",W-PAD,y,paint(24f,true,Paint.Align.RIGHT));y+=38
        }
        adjustmentLines.forEach{lineText->
            y=wrap(c,lineText,PAD,y,W-PAD*2,paint(20f,true),26f)
        }
        line(c,y);y+=46
        c.drawText("THÀNH TIỀN",PAD,y,paint(30f,true))
        c.drawText(money(total),W-PAD,y,paint(36f,true,Paint.Align.RIGHT));y+=42
        line(c,y);y+=36
        y=wrap(c,"KHÁCH: ${customerName.uppercase()}",PAD,y,W-PAD*2,paint(22f,true),28f)
        if(customerTier!=null){
            c.drawText("HẠNG: $customerTier",PAD,y,paint(22f,true));y+=30
            c.drawText("ĐIỂM: $pointsBefore + $pointsEarned = $pointsAfter",PAD,y,paint(21f,true));y+=32
        }
        y=wrap(c,"Thanh toán: $method",PAD,y,W-PAD*2,paint(22f,true),28f)
        y+=6
        line(c,y);y+=38
        if(qr!=null){
            c.drawText("TECHCOMBANK · SOUNDBOX",W/2f,y,paint(24f,true,Paint.Align.CENTER));y+=38
            c.drawText("CHUYỂN KHOẢN: ${money(total)}",W/2f,y,paint(26f,true,Paint.Align.CENTER));y+=22
            val qrSize=300
            // Thermal printers need hard pixel edges; bilinear scaling blurs QR modules.
            val q=Bitmap.createScaledBitmap(qr,qrSize,qrSize,false)
            c.drawBitmap(q,(W-qrSize)/2f,y,null);y+=qrSize+22
            c.drawText("NHẬP ĐÚNG SỐ TIỀN TRÊN",W/2f,y,paint(21f,true,Paint.Align.CENTER));y+=30
            c.drawText("CHỜ LOA XÁC NHẬN TIỀN VỀ",W/2f,y,paint(21f,true,Paint.Align.CENTER));y+=32
        }
        line(c,y);y+=38
        if(orderTag!=null){
            c.drawText("GIỮ BILL NÀY",W/2f,y,paint(32f,true,Paint.Align.CENTER));y+=38
            c.drawText("Báo số thẻ khi nhận món",W/2f,y,paint(22f,false,Paint.Align.CENTER));y+=36
            line(c,y);y+=38
        }
        c.drawText("CẢM ƠN QUÝ KHÁCH!",W/2f,y,paint(26f,true,Paint.Align.CENTER));y+=32
        c.drawText("Good Food · Good Coffee · Brighter Day",W/2f,y,paint(18f,false,Paint.Align.CENTER))
        return crop(b,(y+30).toInt())
    }

    private fun invertedBar(c:Canvas,top:Float,height:Float,text:String,size:Float){
        c.drawRect(0f,top,W.toFloat(),top+height,Paint().apply{color=Color.BLACK})
        val p=paint(size,true,Paint.Align.CENTER).apply{color=Color.WHITE}
        c.drawText(text,W/2f,top+height/2f+size*0.36f,p)
    }

    private fun thickLine(c:Canvas,y:Float){ c.drawLine(0f,y,W.toFloat(),y,Paint().apply{color=Color.BLACK;strokeWidth=4f}) }

    private fun hhmm(t:Long)=java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(java.util.Date(t))

    /** Phiếu làm hàng: số thẻ/bàn to nhất, số đơn, giờ, trạng thái thu tiền, rồi từng món (số lượng lớn) + ghi chú. */
    @Synchronized
    fun kitchen(table:String,sequence:Int,serviceNo:Int,orderer:String,items:List<Triple<String,Int,String>>,profile:PrinterProfile=PrinterProfile.MM58,flowTag:String="",at:Long=System.currentTimeMillis()):Bitmap{
        dimensions(profile)
        val h=760+items.size*420
        val (b,c)=canvas(h)
        invertedBar(c,0f,112f,table.uppercase(),if(table.length>7)50f else 66f)
        var y=176f
        c.drawText("#${serviceNo.toString().padStart(3,'0')}",PAD,y,paint(64f,true))
        c.drawText(hhmm(at),W-PAD,y,paint(38f,true,Paint.Align.RIGHT));y+=16
        if(flowTag.isNotBlank()){
            val tagPaint=paint(25f,true,Paint.Align.CENTER)
            val box=Paint().apply{color=Color.BLACK;style=Paint.Style.STROKE;strokeWidth=3f}
            c.drawRect(PAD,y+6f,W-PAD,y+52f,box)
            c.drawText(flowTag,W/2f,y+40f,tagPaint);y+=72f
        }else y+=10f
        thickLine(c,y);y+=60f
        val qtyW=92f
        items.forEach{(name,qty,note)->
            val top=y
            c.drawText("$qty",PAD,top+6f,paint(58f,true))
            val end=wrap(c,name,PAD+qtyW,top,W-PAD*2-qtyW,paint(34f,true),40f)
            y=maxOf(end,top+56f)
            if(note.isNotBlank()){
                y=wrap(c,"GHI CHÚ: ${note.trim()}",PAD+qtyW,y-2f,W-PAD*2-qtyW,paint(26f,true),31f)
            }
            y+=8f
            line(c,y);y+=52f
        }
        val total=items.sumOf{it.second.coerceAtLeast(0)}
        c.drawText("TỔNG: $total món",PAD,y,paint(30f,true));y+=40f
        c.drawText("Đơn #$sequence · $orderer",PAD,y,paint(22f,true))
        return crop(b,(y+30).toInt())
    }

    /** Phiếu nhắc bếp: in lại đơn đang chờ, nói rõ đã chờ bao lâu và nhắc lần thứ mấy. */
    @Synchronized
    fun kitchenReminder(table:String,serviceNo:Int,items:List<Triple<String,Int,String>>,waitedMinutes:Long,remindCount:Int,profile:PrinterProfile=PrinterProfile.MM58):Bitmap{
        dimensions(profile)
        val (b,c)=canvas(700+items.size*420)
        invertedBar(c,0f,100f,"NHẮC BẾP · LÀM GẤP",40f)
        var y=172f
        c.drawText(table.uppercase(),PAD,y,paint(64f,true));y+=64f
        c.drawText("ĐƠN #${serviceNo.toString().padStart(3,'0')}",PAD,y,paint(50f,true));y+=50f
        y=wrap(c,"ĐÃ CHỜ $waitedMinutes PHÚT · NHẮC LẦN $remindCount",PAD,y,W-PAD*2,paint(26f,true),32f)
        y+=4f
        thickLine(c,y);y+=44f
        items.forEach{(name,qty,note)->
            val top=y
            c.drawText("$qty",PAD,top+6f,paint(54f,true))
            val end=wrap(c,name,PAD+88f,top,W-PAD*2-88f,paint(32f,true),38f)
            y=maxOf(end,top+52f)
            if(note.isNotBlank())y=wrap(c,"GHI CHÚ: ${note.trim()}",PAD+88f,y-2f,W-PAD*2-88f,paint(24f,true),29f)
            y+=22f
        }
        line(c,y);y+=30f
        c.drawText("In lúc ${hhmm(System.currentTimeMillis())}",PAD,y,paint(22f,true))
        return crop(b,(y+30).toInt())
    }

    @Synchronized
    fun cancel(table:String,sequence:Int,manager:String,reason:String,profile:PrinterProfile=PrinterProfile.MM58):Bitmap{
        dimensions(profile)
        val (b,c)=canvas(620)
        var y=48f
        c.drawText("0210",W/2f,y,paint(50f,true,Paint.Align.CENTER));y+=44
        c.drawText("PHIẾU HỦY ĐƠN",W/2f,y,paint(36f,true,Paint.Align.CENTER));y+=40
        c.drawText("${table.uppercase()} · ĐƠN #$sequence",W/2f,y,paint(26f,true,Paint.Align.CENTER));y+=38
        line(c,y);y+=34
        c.drawText("LÝ DO:",PAD,y,paint(28f,true));y+=34
        y=wrap(c,reason,PAD,y,W-PAD*2,paint(28f,true),34f)
        y+=8
        line(c,y);y+=30
        c.drawText("Manager: $manager",PAD,y,paint(22f,true))
        return crop(b,(y+30).toInt())
    }

    private fun item(c:Canvas,y0:Float,name:String,price:String):Float{
        val namePaint=paint(28f,true)
        val pricePaint=paint(23f,true,Paint.Align.RIGHT)
        val priceWidth=pricePaint.measureText(price)
        val available=W-PAD*3-priceWidth
        return if(namePaint.measureText(name)<=available){
            c.drawText(name,PAD,y0,namePaint);c.drawText(price,W-PAD,y0,pricePaint);y0+44
        }else{
            val next=wrap(c,name,PAD,y0,W-PAD*2,namePaint,34f)
            c.drawText(price,W-PAD,next,pricePaint);next+38
        }
    }

    private fun money(v:Long)="%,dđ".format(v).replace(',','.')
    private fun line(c:Canvas,y:Float){ c.drawLine(PAD,y,W-PAD,y,Paint().apply{color=Color.BLACK;strokeWidth=1f}) }

    private fun wrap(c:Canvas,text:String,x:Float,y0:Float,max:Float,p:Paint,step:Float):Float{
        var y=y0
        var line=""
        text.split(" ").forEach{word->
            val test=if(line.isBlank())word else "$line $word"
            if(p.measureText(test)>max){
                if(line.isNotBlank()){c.drawText(line,x,y,p);y+=step}
                line=word
            }else line=test
        }
        if(line.isNotBlank()){c.drawText(line,x,y,p);y+=step}
        return y
    }

    private fun dimensions(profile:PrinterProfile){W=profile.printableWidthDots;PAD=if(profile.paperSize==PaperSize.MM58)18f else 24f}

    private fun crop(b:Bitmap,h:Int)=Bitmap.createBitmap(b,0,0,b.width,h.coerceAtMost(b.height))
}
