package vn.ecohome.pos0210.banknotification

import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Locale

enum class TransactionDirection { CREDIT, DEBIT }

data class BankTransaction(
 val bank:String,val account:String,val amount:Long,val direction:TransactionDirection,
 val transactionTime:Long?,val receivedNotificationTime:Long,val content:String,
 val reference:String?,val rawHash:String
)

interface BankNotificationParser {
 fun parse(title:String,body:String,receivedAt:Long=System.currentTimeMillis()):BankTransaction?
}

internal fun digitsAmount(raw:String)=raw.filter(Char::isDigit).toLongOrNull()
internal fun parseTime(raw:String,pattern:String):Long?=runCatching {
 SimpleDateFormat(pattern,Locale.US).apply{isLenient=false}.parse(raw)?.time
}.getOrNull()
internal fun sha256(value:String)=MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
 .joinToString(""){"%02x".format(it)}
internal fun fingerprint(bank:String,account:String,amount:Long,time:Long?,reference:String?,content:String):String =
 sha256(listOf(bank,account,amount.toString(),time?.toString().orEmpty(),reference?.trim().orEmpty().ifBlank{sha256(content.trim())}).joinToString("|"))

class VcbNotificationParser:BankNotificationParser {
 private val main=Regex("TK\\s+VCB\\s+(\\d+)\\s+([+-])\\s*([\\d.,]+)\\s*VND\\s+lúc\\s+(\\d{2}-\\d{2}-\\d{4}\\s+\\d{2}:\\d{2}:\\d{2})",RegexOption.IGNORE_CASE)
 override fun parse(title:String,body:String,receivedAt:Long):BankTransaction? {
  val m=main.find(body)?:return null
  val account=m.groupValues[1];val amount=digitsAmount(m.groupValues[3])?:return null
  val direction=if(m.groupValues[2]=="+")TransactionDirection.CREDIT else TransactionDirection.DEBIT
  val time=parseTime(m.groupValues[4],"dd-MM-yyyy HH:mm:ss")
  val ref=Regex("\\bRef\\s+([^\\s.]+)",RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)
  val content=body.substring(m.range.last+1).trim().replace(Regex("^\\.\\s*"),"")
  return BankTransaction("VCB",account,amount,direction,time,receivedAt,content,ref,fingerprint("VCB",account,amount,time,ref,content))
 }
}

class VietinbankNotificationParser:BankNotificationParser {
 override fun parse(title:String,body:String,receivedAt:Long):BankTransaction? {
  val timeRaw=Regex("VietinBank:\\s*(\\d{2}/\\d{2}/\\d{4}\\s+\\d{2}:\\d{2})",RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)?:return null
  val account=Regex("(?:^|\\n)TK:\\s*(\\d+)",setOf(RegexOption.IGNORE_CASE,RegexOption.MULTILINE)).find(body)?.groupValues?.get(1)?:return null
  val gd=Regex("(?:^|\\n)GD:\\s*([+-])\\s*([\\d.,]+)\\s*VND",setOf(RegexOption.IGNORE_CASE,RegexOption.MULTILINE)).find(body)?:return null
  val amount=digitsAmount(gd.groupValues[2])?:return null
  val direction=if(gd.groupValues[1]=="+")TransactionDirection.CREDIT else TransactionDirection.DEBIT
  val content=Regex("(?:^|\\n)ND:\\s*(.*)",setOf(RegexOption.IGNORE_CASE,RegexOption.MULTILINE,RegexOption.DOT_MATCHES_ALL)).find(body)?.groupValues?.get(1)?.trim().orEmpty()
  val time=parseTime(timeRaw,"dd/MM/yyyy HH:mm")
  return BankTransaction("VIETINBANK",account,amount,direction,time,receivedAt,content,null,fingerprint("VIETINBANK",account,amount,time,null,content))
 }
}

class TechcombankNotificationParser:BankNotificationParser {
 private val structured=Regex("""(?:TCB|Techcombank)\s+TK\s+([0-9xX*]{4,24})\s+lúc\s+(\d{2}/\d{2}/\d{2,4}\s+\d{2}:\d{2})(?:\s*:\s*|\s+)([+-])\s*([\d.,]+)\s*(?:VND|VNĐ|đồng|đ)\b""",RegexOption.IGNORE_CASE)
 override fun parse(title:String,body:String,receivedAt:Long):BankTransaction? {
  val full="$title\n$body"
  val match=structured.find(full)?:return null
  val account=match.groupValues[1]
  val rawTime=match.groupValues[2]
  val direction=if(match.groupValues[3]=="+")TransactionDirection.CREDIT else TransactionDirection.DEBIT
  val amount=digitsAmount(match.groupValues[4])?.takeIf{it>0L}?:return null
  val time=parseTime(rawTime,if(rawTime.substringBefore(" ").substringAfterLast("/").length==2)"dd/MM/yy HH:mm" else "dd/MM/yyyy HH:mm")
  val content=Regex("""\bND\s*:\s*(.*)""",setOf(RegexOption.IGNORE_CASE,RegexOption.DOT_MATCHES_ALL)).find(full)?.groupValues?.get(1)?.trim().orEmpty()
  val reference=Regex("""(?:mã giao dịch|ma giao dich|ref|trace)\s*[:#]?\s*([A-Z0-9]+)""",RegexOption.IGNORE_CASE).find(full)?.groupValues?.get(1)
  return BankTransaction("TECHCOMBANK",account,amount,direction,time,receivedAt,content,reference,fingerprint("TECHCOMBANK",account,amount,time,reference,full))
 }
}

object BankParserRegistry {
 private val parsers=mapOf(
  "com.VCB" to VcbNotificationParser(),
  "com.vietinbank.ipay" to VietinbankNotificationParser(),
  "vn.com.techcombank.bb.app" to TechcombankNotificationParser()
 )
 val supportedPackages:Set<String> get()=parsers.keys
 fun parser(packageName:String)=parsers[packageName]
}
