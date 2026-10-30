package vn.ecohome.pos0210.cloud

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.MutableStateFlow
import java.util.UUID

internal object CloudQuotaGuard {
    @Volatile var lastCause:String=""
    val status=MutableStateFlow("Ngân sách Cloud: mục tiêu 12.000 · trần 16.000 lượt ghi/ngày")
    private fun prefs(fs:FirebaseFirestore)=fs.app.applicationContext.getSharedPreferences("pos0210_cloud_quota_v1",Context.MODE_PRIVATE)
    private fun scope(fs:FirebaseFirestore)="${fs.app.options.projectId}/${FirebaseAuth.getInstance(fs.app).currentUser?.uid}"
    @Synchronized fun device(fs:FirebaseFirestore):String {
        val prefs=prefs(fs)
        return prefs.getString("device",null)?:UUID.randomUUID().toString().also{prefs.edit().putString("device",it).commit()}
    }
    fun check(fs:FirebaseFirestore) {
        val p=prefs(fs);val scope=scope(fs);val now=System.currentTimeMillis();val until=p.getLong("$scope/pause3",0L)
        if(now<until){
            val time=java.text.SimpleDateFormat("dd/MM HH:mm",java.util.Locale.getDefault()).format(java.util.Date(until))
            status.value="Cloud tạm dừng đến $time · giữ dữ liệu và hàng đợi trên máy"+(if(lastCause.isNotBlank()) " · lỗi gốc: $lastCause" else "")
            throw CloudQuotaDeferred(until,status.value)
        }
        val day=CloudQuotaPolicy.day(now)
        if(p.getString("$scope/day",null)!=day)status.value="Ngày quota mới · mục tiêu 12.000 · trần 16.000 lượt ghi"
        else status.value="Cloud đã theo dõi: ${p.getLong("$scope/total",0L)} / 16.000 lượt ghi · ngày Pacific $day"
    }
    fun observed(fs:FirebaseFirestore,data:Map<String,Any?>) {
        val now=System.currentTimeMillis();val used=data["total"] as? Long?:0L;val scope=scope(fs)
        prefs(fs).edit().putString("$scope/day",CloudQuotaPolicy.day(now)).putLong("$scope/total",used).apply()
        status.value="Cloud đã theo dõi: $used / 16.000 lượt ghi · mục tiêu 12.000 · chưa gồm máy cũ/dịch vụ khác"
    }
    fun failed(fs:FirebaseFirestore,e:Exception) {
        val now=System.currentTimeMillis()
        val quota=(e is com.google.firebase.firestore.FirebaseFirestoreException&&e.code==com.google.firebase.firestore.FirebaseFirestoreException.Code.RESOURCE_EXHAUSTED)||e.message.orEmpty().contains("RESOURCE_EXHAUSTED")||e.message.orEmpty().contains("HTTP_429")
        val cap=e is CloudQuotaDeferred&&e.message.orEmpty().contains("Đã đạt trần")
        if(quota||cap){
            // Chỉ khi chính bộ đếm của app báo đã chạm trần ngày mới nghỉ đến mốc reset Pacific.
            // Lỗi 429/RESOURCE_EXHAUSTED từ máy chủ có thể chỉ là nghẽn tạm thời: nghỉ 20 phút rồi thử lại, không nghỉ cả ngày.
            val until=if(cap)CloudQuotaPolicy.reset(now) else now+3*60_000L
            // Ghi lại lỗi gốc để màn Cloud & Manager hiện đúng lý do (trước đây chỉ thấy CLOUD_DEFERRED).
            runCatching{CloudExecution.trace("QUOTA_PAUSE nguyên nhân: ${e.javaClass.simpleName} ${e.message.orEmpty().take(200)}")}
            lastCause="${e.javaClass.simpleName}: ${e.message.orEmpty().take(160)}"
            prefs(fs).edit().putLong("${scope(fs)}/pause3",until).commit()
            status.value=if(cap)"Cloud tạm dừng vì quota · tự kiểm tra lại sau mốc reset Pacific · giữ dữ liệu local" else "Cloud bị máy chủ báo bận · tự thử lại sau 3 phút · lỗi gốc: $lastCause"
        }
    }
    fun recordFailure(context:Context,error:Exception){
        com.google.firebase.FirebaseApp.getApps(context).firstOrNull{it.name=="pos0210-cloud"}?.let{failed(FirebaseFirestore.getInstance(it),error)}
    }
    fun retry(error:Throwable?)=(error !is com.google.firebase.firestore.FirebaseFirestoreException||error.code!=com.google.firebase.firestore.FirebaseFirestoreException.Code.RESOURCE_EXHAUSTED)&&retryMessage(error)
    fun retryMessage(error:Throwable?)=error !is CloudQuotaDeferred&&!error?.message.orEmpty().let{it.contains("HTTP_429")||it.contains("RESOURCE_EXHAUSTED")}
}
