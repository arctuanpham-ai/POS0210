package vn.ecohome.pos0210.data
import android.content.Context
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

object TransactionExcelExport {
 data class Filter(val from:Long?=null,val toExclusive:Long?=null,val payer:String?=null,val cashier:String?=null)
 private fun day(t:Long?)=t?.let{SimpleDateFormat("dd/MM/yyyy HH:mm",Locale.US).format(Date(it))}.orEmpty()
 private fun esc(v:Any?)=v?.toString().orEmpty().replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").filter{it.code>=32||it=='\n'||it=='\t'}
 private fun sheet(rows:List<List<Any?>>):String{
  val body=rows.mapIndexed{idx,row->"<row r=\""+(idx+1)+"\">"+row.joinToString(""){v->if(v is Number)"<c><v>"+v+"</v></c>" else "<c t=\"inlineStr\"><is><t>"+esc(v)+"</t></is></c>"}+"</row>"}.joinToString("")
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>"+body+"</sheetData></worksheet>"
 }
 private fun ZipOutputStream.add(path:String,body:String){putNextEntry(ZipEntry(path));write(body.toByteArray(Charsets.UTF_8));closeEntry()}
 suspend fun create(context:Context,dao:PosDao,f:Filter):File {
  fun ok(t:Long)=(f.from==null||t>=f.from)&&(f.toExclusive==null||t<f.toExclusive)
  val people=dao.allEmployeesSnapshot().associateBy{it.id}
  val purchases=dao.allPurchasesSnapshot().filter{it.status=="ACTIVE"&&ok(it.purchasedAt)&&(f.payer.isNullOrBlank()||it.paidByName.equals(f.payer,true))}
  val bills=dao.allPaidBillsSnapshot().associateBy{it.id}
  val payments=dao.allPaymentsSnapshot().filter{it.billId in bills&&ok(it.paidAt)&&(f.cashier.isNullOrBlank()||it.cashierId==f.cashier)}
  val movements=dao.allFinancialMovementsSnapshot().filter{ok(it.occurredAt)&&(f.payer.isNullOrBlank()||it.counterpartyName.equals(f.payer,true))}
  val sheets=linkedMapOf<String,List<List<Any?>>>()
  sheets["Nhap hang"]=listOf(listOf("Ma phieu","Ngay","Nguoi nhap","Nguoi chi","Nhom","Tong VND","Ghi chu"))+purchases.map{listOf(it.id,day(it.purchasedAt),people[it.enteredBy]?.name?:it.enteredBy,it.paidByName,it.expenseCategory,it.total,it.note)}
  sheets["Chi tiet nhap"]=listOf(listOf("Ma phieu","Ten hang","So luong","Don vi","Don gia VND","Thanh tien VND"))+purchases.flatMap{p->dao.purchaseItemsSnapshot(p.id).map{listOf(p.id,it.name,it.qty,it.unit,it.unitPrice,it.amount)}}
  sheets["Phieu chi"]=listOf(listOf("Ma phieu","Ngay","Loai","Nguoi chi nhan","Phuong thuc","So tien VND","Noi dung"))+movements.map{listOf(it.id,day(it.occurredAt),it.type,it.counterpartyName,it.method,it.amount,it.note)}
  sheets["Bill"]=listOf(listOf("So bill","Ngay thanh toan","Thu ngan","Hinh thuc","Tien hang VND","Thuc thu VND","Tham chieu"))+payments.mapNotNull{p->bills[p.billId]?.let{b->listOf(b.billNo,day(p.paidAt),people[p.cashierId]?.name?:p.cashierId,p.method,b.subtotal,p.amount,p.reference.orEmpty())}}
  sheets["Bo loc"]=listOf(listOf("Thong tin","Gia tri"),listOf("Tu",day(f.from)),listOf("Den truoc",day(f.toExclusive)),listOf("Nguoi chi",f.payer?:"Tat ca"),listOf("Thu ngan",f.cashier?.let{people[it]?.name?:it}?:"Tat ca"),listOf("So phieu nhap",purchases.size),listOf("So phieu chi",movements.size),listOf("So bill",payments.size))
  val file=File(File(context.cacheDir,"exports").apply{mkdirs()},"POS0210_${System.currentTimeMillis()}.xlsx")
  ZipOutputStream(file.outputStream().buffered()).use{z->
   val ns="http://schemas.openxmlformats.org/"
   z.add("[Content_Types].xml","<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"+sheets.keys.indices.joinToString(""){"<Override PartName=\"/xl/worksheets/sheet"+(it+1)+".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"}+"</Types>")
   z.add("_rels/.rels","<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>")
   z.add("xl/workbook.xml","<?xml version=\"1.0\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets>"+sheets.keys.mapIndexed{i,n->"<sheet name=\""+esc(n)+"\" sheetId=\""+(i+1)+"\" r:id=\"rId"+(i+1)+"\"/>"}.joinToString("")+"</sheets></workbook>")
   z.add("xl/_rels/workbook.xml.rels","<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"+sheets.keys.indices.joinToString(""){"<Relationship Id=\"rId"+(it+1)+"\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet"+(it+1)+".xml\"/>"}+"</Relationships>")
   sheets.values.forEachIndexed{i,rows->z.add("xl/worksheets/sheet"+(i+1)+".xml",sheet(rows))}
  }
  return file
 }
 fun uri(context:Context,file:File)=FileProvider.getUriForFile(context,context.packageName+".fileprovider",file)
}
