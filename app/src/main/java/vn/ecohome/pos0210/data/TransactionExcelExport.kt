package vn.ecohome.pos0210.data
import android.content.Context
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlinx.coroutines.flow.first

object TransactionExcelExport {
 data class Filter(val from:Long?=null,val toExclusive:Long?=null,val payer:String?=null,val cashier:String?=null)
 private fun day(t:Long?)=t?.let{SimpleDateFormat("dd/MM/yyyy HH:mm",Locale.US).format(Date(it))}.orEmpty()
 private fun esc(v:Any?)=v?.toString().orEmpty().replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").filter{it.code>=32||it=='\n'||it=='\t'}
 private fun columnName(index:Int):String {
  var n=index+1
  val out=StringBuilder()
  while(n>0){n--;out.insert(0,('A'.code+n%26).toChar());n/=26}
  return out.toString()
 }
 private fun sheet(rows:List<List<Any?>>):String{
  val maxColumns=rows.maxOfOrNull{it.size}?:1
  val widths=(0 until maxColumns).map{col->
   val header=rows.firstOrNull()?.getOrNull(col)?.toString().orEmpty()
   val longest=rows.asSequence().take(150).map{it.getOrNull(col)?.toString().orEmpty().length}.maxOrNull()?:0
   kotlin.math.min(52,kotlin.math.max(14,kotlin.math.max(header.length+3,longest+2))).toDouble()
  }
  val columns="<cols>"+widths.mapIndexed{i,w->"<col min=\""+(i+1)+"\" max=\""+(i+1)+"\" width=\""+w+"\" customWidth=\"1\"/>"}.joinToString("")+"</cols>"
  val body=rows.mapIndexed{idx,row->
   "<row r=\""+(idx+1)+"\" ht=\""+(if(idx==0)34 else 25)+"\" customHeight=\"1\">"+
    row.mapIndexed{col,v->
     val ref=columnName(col)+(idx+1)
     val style=if(idx==0)1 else if(v is Number)2 else 3
     if(v is Number)"<c r=\""+ref+"\" s=\""+style+"\"><v>"+v+"</v></c>"
     else "<c r=\""+ref+"\" s=\""+style+"\" t=\"inlineStr\"><is><t>"+esc(v)+"</t></is></c>"
    }.joinToString("")+"</row>"
  }.joinToString("")
  val range="A1:"+columnName(maxColumns-1)+rows.size.coerceAtLeast(1)
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><dimension ref=\""+range+"\"/><sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight=\"25\"/>"+columns+"<sheetData>"+body+"</sheetData><autoFilter ref=\""+range+"\"/><pageMargins left=\"0.3\" right=\"0.3\" top=\"0.5\" bottom=\"0.5\" header=\"0.2\" footer=\"0.2\"/></worksheet>"
 }
 private fun styles():String{
  val border="<border><left style=\"thin\"><color rgb=\"FFB0B0B0\"/></left><right style=\"thin\"><color rgb=\"FFB0B0B0\"/></right><top style=\"thin\"><color rgb=\"FFB0B0B0\"/></top><bottom style=\"thin\"><color rgb=\"FFB0B0B0\"/></bottom><diagonal/></border>"
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"+
   "<numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"#,##0.##\"/></numFmts>"+
   "<fonts count=\"2\"><font><sz val=\"13\"/><name val=\"Times New Roman\"/><family val=\"1\"/></font><font><b/><sz val=\"13\"/><name val=\"Times New Roman\"/><family val=\"1\"/></font></fonts>"+
   "<fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFEAE3D6\"/><bgColor indexed=\"64\"/></patternFill></fill></fills>"+
   "<borders count=\"2\"><border><left/><right/><top/><bottom/><diagonal/></border>"+border+"</borders>"+
   "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>"+
   "<cellXfs count=\"4\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>"+
   "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"1\" borderId=\"1\" xfId=\"0\" applyAlignment=\"1\"><alignment horizontal=\"center\" vertical=\"center\" wrapText=\"1\"/></xf>"+
   "<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyNumberFormat=\"1\" applyAlignment=\"1\"><alignment horizontal=\"right\" vertical=\"center\"/></xf>"+
   "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyAlignment=\"1\"><alignment horizontal=\"left\" vertical=\"center\" wrapText=\"1\"/></xf></cellXfs>"+
   "<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>"
 }
 private fun ZipOutputStream.add(path:String,body:String){putNextEntry(ZipEntry(path));write(body.toByteArray(Charsets.UTF_8));closeEntry()}
 suspend fun create(context:Context,dao:PosDao,f:Filter):File {
  fun ok(t:Long)=(f.from==null||t>=f.from)&&(f.toExclusive==null||t<f.toExclusive)
  val people=dao.allEmployeesSnapshot().associateBy{it.id}
  val purchases=dao.allPurchasesSnapshot().filter{it.status=="ACTIVE"&&ok(it.purchasedAt)&&(f.payer.isNullOrBlank()||it.paidByName.equals(f.payer,true))}
  val bills=dao.allPaidBillsSnapshot().associateBy{it.id}
  val payments=dao.allPaymentsSnapshot().filter{it.billId in bills&&ok(it.paidAt)&&(f.cashier.isNullOrBlank()||it.cashierId==f.cashier)}
  val movements=dao.allFinancialMovementsSnapshot().filter{ok(it.occurredAt)&&(f.payer.isNullOrBlank()||it.counterpartyName.equals(f.payer,true))}
  val suppliers=dao.allSuppliersSnapshot().associateBy{it.id}
  val sessions=dao.allSessionsSnapshot().associateBy{it.id}
  val tables=dao.allTablesSnapshot().associateBy{it.id}
  val batches=dao.allOrderBatchesSnapshot().filter{it.status!="CANCELLED"}.groupBy{it.sessionId}
  val orderItems=dao.allOrderItemsSnapshot().groupBy{it.batchId}
  val customers=bills.values.mapNotNull{it.customerId}.distinct().associateWith{dao.customerById(it)}
  val sheets=linkedMapOf<String,List<List<Any?>>>()
  val purchaseRows=mutableListOf<List<Any?>>()
  for(p in purchases){
   val items=dao.purchaseItemsSnapshot(p.id)
   val base=listOf<Any?>(p.id,day(p.purchasedAt),suppliers[p.supplierId]?.name.orEmpty(),people[p.enteredBy]?.name?:p.enteredBy,p.paidByName,p.expenseCategory,p.total,p.note)
   if(items.isEmpty())purchaseRows.add(base+listOf<Any?>("","","","","",0L))
   else items.forEachIndexed{index,item->purchaseRows.add(base+listOf<Any?>(item.name,item.qty,item.unit,item.unitPrice,item.amount,if(index==0)p.total else 0L))}
  }
  sheets["Nhap hang"]=listOf(listOf("Ma phieu","Ngay nhap","Nha cung cap","Nguoi nhap","Nguoi chi","Nhom chi phi","Tong phieu VND (doi chieu)","Ghi chu phieu","Mat hang","So luong","Don vi","Don gia VND","Thanh tien dong VND","Tong phieu VND (chi tinh mot lan)"))+purchaseRows
  sheets["Phieu chi"]=listOf(listOf("Ma phieu","Ngay","Loai","Nguoi chi nhan","Phuong thuc","So tien VND","Noi dung"))+movements.map{listOf(it.id,day(it.occurredAt),it.type,it.counterpartyName,it.method,it.amount,it.note)}
  val billRows=mutableListOf<List<Any?>>()
  val billDetails=mutableListOf<List<Any?>>()
  for(payment in payments){
   val bill=bills[payment.billId]?:continue
   val customer=bill.customerId?.let{customers[it]}
   val session=sessions[bill.sessionId]
   val tableName=session?.tableId?.let{tables[it]?.name}.orEmpty()
   val adjustments=dao.adjustmentsByBillId(bill.id)
   val surcharge=adjustments.filter{it.kind=="SURCHARGE"}.sumOf{it.amount}
   val discount=adjustments.filter{it.kind=="DISCOUNT"}.sumOf{kotlin.math.abs(it.amount)}
   val base=listOf<Any?>(bill.billNo,bill.id,day(bill.openedAt),day(payment.paidAt),tableName,people[payment.cashierId]?.name?:payment.cashierId,payment.method,payment.reference.orEmpty(),customer?.name.orEmpty(),customer?.phone.orEmpty(),customer?.tier.orEmpty())
   billRows.add(base+listOf<Any?>(bill.subtotal,surcharge,discount,bill.total,payment.amount,adjustments.joinToString("; "){it.kind+": "+it.name+" ("+it.amount+")"}))
   val billBatches=batches[bill.sessionId].orEmpty()
   val lines=billBatches.flatMap{batch->orderItems[batch.id].orEmpty().map{batch to it}}
   if(lines.isEmpty())billDetails.add(base+listOf<Any?>("","","",0,0L,0L,"",""))
   else lines.forEach{(batch,item)->
    billDetails.add(base+listOf<Any?>(batch.sequence,item.itemNameSnapshot,item.menuItemId.orEmpty(),item.qty,item.unitPriceSnapshot,item.qty.toLong()*item.unitPriceSnapshot,item.note,item.loyaltyLabel?:item.buyGetLabel.orEmpty()))
   }
  }
  sheets["Bill"]=listOf(listOf("So bill","ID bill","Gio mo","Gio thanh toan","Ban","Thu ngan","Thanh toan","Tham chieu","Ten khach","SDT khach","Hang khach","Tien mon VND","Phu thu VND","Giam gia VND","Tong bill VND","Thuc thu VND","Chi tiet dieu chinh"))+billRows
  sheets["Mon theo bill"]=listOf(listOf("So bill","ID bill","Gio mo","Gio thanh toan","Ban","Thu ngan","Thanh toan","Tham chieu","Ten khach","SDT khach","Hang khach","Dot goi","Ten mon tai thoi diem ban","Ma mon","So luong","Don gia tai thoi diem ban VND","Thanh tien VND","Ghi chu mon","Uu dai / voucher"))+billDetails
  sheets["Bo loc"]=listOf(listOf("Thong tin","Gia tri"),listOf("Tu",day(f.from)),listOf("Den truoc",day(f.toExclusive)),listOf("Nguoi chi",f.payer?:"Tat ca"),listOf("Thu ngan",f.cashier?.let{people[it]?.name?:it}?:"Tat ca"),listOf("So phieu nhap",purchases.size),listOf("So dong hang nhap",purchaseRows.size),listOf("So dong mon theo bill",billDetails.size),listOf("So phieu chi",movements.size),listOf("So bill",payments.size))
  val file=File(File(context.cacheDir,"exports").apply{mkdirs()},"POS0210_${System.currentTimeMillis()}.xlsx")
  ZipOutputStream(file.outputStream().buffered()).use{z->
   val ns="http://schemas.openxmlformats.org/"
   z.add("[Content_Types].xml","<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"+sheets.keys.indices.joinToString(""){"<Override PartName=\"/xl/worksheets/sheet"+(it+1)+".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"}+"</Types>")
   z.add("_rels/.rels","<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>")
   z.add("xl/workbook.xml","<?xml version=\"1.0\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets>"+sheets.keys.mapIndexed{i,n->"<sheet name=\""+esc(n)+"\" sheetId=\""+(i+1)+"\" r:id=\"rId"+(i+1)+"\"/>"}.joinToString("")+"</sheets></workbook>")
   z.add("xl/_rels/workbook.xml.rels","<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"+sheets.keys.indices.joinToString(""){"<Relationship Id=\"rId"+(it+1)+"\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet"+(it+1)+".xml\"/>"}+"<Relationship Id=\"rIdStyles\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>")
   z.add("xl/styles.xml",styles())
   sheets.values.forEachIndexed{i,rows->z.add("xl/worksheets/sheet"+(i+1)+".xml",sheet(rows))}
  }
  return file
 }
 fun uri(context:Context,file:File)=FileProvider.getUriForFile(context,context.packageName+".fileprovider",file)
}
