package vn.ecohome.pos0210.banknotification

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

object BankPaymentAnnouncer {
 fun announce(context:Context,amount:Long,tableName:String?,vibrate:Boolean,speak:Boolean){
  if(vibrate)runCatching{
   val vibrator=if(Build.VERSION.SDK_INT>=31)context.getSystemService(VibratorManager::class.java).defaultVibrator else @Suppress("DEPRECATION")(context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
   if(Build.VERSION.SDK_INT>=26)vibrator.vibrate(VibrationEffect.createOneShot(180,VibrationEffect.DEFAULT_AMPLITUDE)) else @Suppress("DEPRECATION") vibrator.vibrate(180)
  }
  if(!speak)return
  var tts:TextToSpeech?=null
  tts=TextToSpeech(context.applicationContext){status->
   if(status==TextToSpeech.SUCCESS){
    val engine=tts?:return@TextToSpeech
    val localeResult=engine.setLanguage(Locale("vi","VN"))
    if(localeResult==TextToSpeech.LANG_MISSING_DATA||localeResult==TextToSpeech.LANG_NOT_SUPPORTED){engine.shutdown();return@TextToSpeech}
    engine.setOnUtteranceProgressListener(object:UtteranceProgressListener(){
     override fun onStart(utteranceId:String?)=Unit
     override fun onDone(utteranceId:String?){engine.shutdown()}
     @Deprecated("Deprecated in Java") override fun onError(utteranceId:String?){engine.shutdown()}
    })
    val subject=tableName?.takeIf{it.isNotBlank()}?.let{"$it đã thanh toán"}?:"Đã nhận"
    engine.speak("$subject ${"%,d".format(amount).replace(',','.')} đồng",TextToSpeech.QUEUE_FLUSH,null,"bank-payment")
   } else tts?.shutdown()
  }
 }
}
