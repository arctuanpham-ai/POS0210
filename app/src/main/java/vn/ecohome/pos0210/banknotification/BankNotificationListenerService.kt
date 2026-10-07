package vn.ecohome.pos0210.banknotification

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import kotlinx.coroutines.*
import vn.ecohome.pos0210.data.*

class BankNotificationListenerService:NotificationListenerService(){
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
 override fun onDestroy(){scope.cancel();super.onDestroy()}
 override fun onNotificationPosted(sbn:StatusBarNotification){
  val parser=BankParserRegistry.parser(sbn.packageName)?:return
  val extras=sbn.notification.extras
  val title=extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
  val body=(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?:extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
  if(body.isBlank())return
  scope.launch{process(sbn.packageName,title,body,sbn.postTime,parser)}
 }
 private suspend fun process(packageName:String,title:String,body:String,receivedAt:Long,parser:BankNotificationParser){
  val dao=PosDatabase.get(applicationContext).dao()
  if(dao.settingValue("bank_notification_enabled")!="true")return
  val tx=runCatching{parser.parse(title,body,receivedAt)}.getOrNull()
  val fallbackHash=sha256("$packageName|$title|$body|$receivedAt")
  val event=BankNotificationEventEntity(
   fingerprint=tx?.rawHash?:fallbackHash,packageName=packageName,bank=tx?.bank,title=title.take(160),body=body.take(2000),receivedAt=receivedAt,
   parserResult=if(tx==null)"PARSE_FAILED" else "PARSED",amount=tx?.amount,account=tx?.account,transactionTime=tx?.transactionTime,
   content=tx?.content?.take(1000),reference=tx?.reference?.take(200),direction=tx?.direction?.name
  )
  if(dao.insertBankNotification(event)==-1L)return
  dao.trimBankNotifications()
  if(tx==null||tx.direction!=TransactionDirection.CREDIT)return
  val result=PaymentMatcher.match(tx,dao.waitingPaymentSessions(tx.amount,receivedAt),receivedAt)
  val target=result.session
  if(target==null){dao.updateBankNotificationMatch(tx.rawHash,result.confidence.name,null);return}
  if(dao.markPaymentDetected(target.id,tx.rawHash,tx.bank,tx.amount,receivedAt,result.confidence.name)!=1)return
  dao.updateBankNotificationMatch(tx.rawHash,"MATCHED_${result.confidence.name}",target.id)
  val tableName=dao.allTablesSnapshot().firstOrNull{it.id==target.tableId}?.name
  BankPaymentAnnouncer.announce(applicationContext,tx.amount,tableName,dao.settingValue("bank_notification_vibrate")!="false",dao.settingValue("bank_notification_tts")!="false")
 }
}
