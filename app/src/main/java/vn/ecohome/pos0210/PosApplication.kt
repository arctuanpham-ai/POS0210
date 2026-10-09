package vn.ecohome.pos0210

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import androidx.room.InvalidationTracker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import vn.ecohome.pos0210.cloud.CloudQuotaPolicy
import vn.ecohome.pos0210.cloud.FirebaseCloudSync
import vn.ecohome.pos0210.data.PosDatabase

class PosApplication : Application(), ImageLoaderFactory {
    private val appScope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    override fun onCreate() {
        super.onCreate()
        FirebaseCloudSync.schedule(this)
        val db=PosDatabase.get(this)
        val settingMutex=Mutex()
        var lastBusinessSettings:Map<String,String>?=null
        appScope.launch{settingMutex.withLock{lastBusinessSettings=CloudQuotaPolicy.businessSettings(db.dao().allSettingsSnapshot().associate{it.key to it.value})}}
        db.invalidationTracker.addObserver(object:InvalidationTracker.Observer("AppSettingEntity","AreaEntity","DiningTableEntity","MenuCategoryEntity","MenuItemEntity","TableSessionEntity","OrderBatchEntity","OrderItemEntity","BillEntity","PaymentEntity","PurchaseEntity","MonthlyAccountingEntity","AssetEntity","FinancialMovementEntity","SupplierEntity","PurchaseItemEntity","CustomerEntity","AttendanceSessionEntity","ComboEntity","ComboItemEntity","EmployeeEntity","PricingRuleEntity","BuyGetPromotionEntity"){
            override fun onInvalidated(tables:Set<String>){appScope.launch{
                val business=tables.toMutableSet()
                if("AppSettingEntity" in business){
                    settingMutex.withLock{
                        val settings=CloudQuotaPolicy.businessSettings(db.dao().allSettingsSnapshot().associate{it.key to it.value})
                        if(lastBusinessSettings==settings)business.remove("AppSettingEntity")
                        lastBusinessSettings=settings
                    }
                }
                if(business.isEmpty())return@launch
                db.dao().markCloudDirty()
                val finance=setOf("PurchaseEntity","PurchaseItemEntity","MonthlyAccountingEntity","AssetEntity","FinancialMovementEntity","SupplierEntity")
                val catalog=setOf("MenuItemEntity","MenuCategoryEntity")
                if(business.any{it in finance})FirebaseCloudSync.enqueueFinance(this@PosApplication)
                if(business.any{it in catalog})FirebaseCloudSync.enqueueCatalog(this@PosApplication)
                if(business.any{it !in finance&&it !in catalog})FirebaseCloudSync.enqueueImmediate(this@PosApplication)
                FirebaseCloudSync.enqueueBackup(this@PosApplication)
            }}
        })
    }
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .components {
            add(OfflineVietQrFetcher.Factory())
        }
        .build()
}
