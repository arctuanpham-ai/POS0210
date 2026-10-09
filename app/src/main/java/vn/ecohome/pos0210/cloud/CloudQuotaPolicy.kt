package vn.ecohome.pos0210.cloud

import java.io.IOException
import java.time.Instant
import java.time.ZoneId

internal class CloudQuotaDeferred(val until:Long, reason:String):IOException("CLOUD_DEFERRED: $reason")

/** Allocations are soft for business data; optional tasks cannot consume the sales reserve. */
internal object CloudQuotaPolicy {
    const val TARGET=12_000L
    const val RESERVE=14_000L
    const val CEILING=16_000L
    val budgets=mapOf("sales" to 8000L,"dashboard" to 1000L,"catalog" to 300L,"finance" to 500L,"people" to 1000L,"backup" to 500L,"media" to 200L,"system" to 500L)
    private val pacific=ZoneId.of("America/Los_Angeles")
    fun day(now:Long)=Instant.ofEpochMilli(now).atZone(pacific).toLocalDate().toString()
    fun reset(now:Long)=Instant.ofEpochMilli(now).atZone(pacific).toLocalDate().plusDays(1).atStartOfDay(pacific).toInstant().toEpochMilli()
    fun category(path:String):String {
        val collection=path.split('/').getOrNull(4)
        return when(collection){
            "tableStatus","sessions","orderBatches","orderItems","bills","payments" -> "sales"
            "dashboard" -> "dashboard"
            "menu","menuCategories","areas","config" -> "catalog"
            "purchases","purchaseItems","purchaseCategories","suppliers","costCodes","profitPartners","assetCategories","monthlyAccounting","assets","financialMovements" -> "finance"
            "attendance","customers","loyalty" -> "people"
            "privateBackup" -> "backup"
            "media" -> "media"
            else -> "system"
        }
    }
    fun businessSettings(settings:Map<String,String>)=settings.filterKeys{
        !it.startsWith("cloud_")&&!it.startsWith("firebase_")&&!it.startsWith("autoback_")&&it !in setOf("master_config_uri","storage_root_uri","storage_write_enabled")
    }
    fun next(data:Map<String,Any?>,charges:Map<String,Long>,device:String,operation:String,now:Long):Map<String,Any?> {
        fun count(key:String):Long = data[key]?.let{value->
            require(value is Long && value>=0){"QUOTA_COUNTER_INVALID $key"};value
        }?:0L
        require(device.isNotBlank()&&operation.isNotBlank())
        require(charges.keys.all{it in budgets}&&charges.values.all{it>=0 && it<=399})
        val used=count("total")
        val amount=charges.values.sum()+1 // the shared counter is also a document write
        if(used>CEILING-amount)throw CloudQuotaDeferred(reset(now),"Đã đạt trần $CEILING lượt ghi/ngày; giữ hàng đợi local")
        val optional=charges.keys.filter{it in setOf("dashboard","backup","media")}
        if(optional.isNotEmpty()&&used+amount>RESERVE)throw CloudQuotaDeferred(reset(now),"Giữ ngân sách Cloud cho bán hàng")
        optional.forEach{category->if(count(category)+charges.getValue(category)>budgets.getValue(category))throw CloudQuotaDeferred(reset(now),"Hết ngân sách $category hôm nay")}
        val result=data.toMutableMap()
        for(category in optional.filter{it!="media"}){
            val last=count("${category}At")
            val sameOperation=data["${category}Operation"]==operation
            val interval=if(category=="dashboard") {if(used>=TARGET)300_000L else 60_000L} else {if(used>=TARGET)10_800_000L else 3_600_000L}
            if(!sameOperation&&last>0&&now<last+interval)throw CloudQuotaDeferred(last+interval,"$category chờ đến lượt kế tiếp")
            val lease=count("publisherUntil")
            if(!sameOperation&&data["publisher"]!=null&&data["publisher"]!=device&&now<lease)throw CloudQuotaDeferred(lease,"Máy khác đang xuất dashboard/backup")
            result["publisher"]=device
            result["publisherUntil"]=now+300_000L
            if(!sameOperation){result["${category}At"]=now;result["${category}Operation"]=operation}
        }
        charges.forEach{(category,value)->result[category]=count(category)+value}
        result["system"]=(result["system"] as? Long?:count("system"))+1L
        result["total"]=used+amount
        return result
    }
}
