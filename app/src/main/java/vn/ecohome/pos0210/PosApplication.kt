package vn.ecohome.pos0210

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import androidx.room.InvalidationTracker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import vn.ecohome.pos0210.cloud.FirebaseCloudSync
import vn.ecohome.pos0210.data.PosDatabase

class PosApplication : Application(), ImageLoaderFactory {
    private val appScope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    override fun onCreate() {
        super.onCreate()
        FirebaseCloudSync.schedule(this)
        val db=PosDatabase.get(this)
        db.invalidationTracker.addObserver(object:InvalidationTracker.Observer("AppSettingEntity","AreaEntity","DiningTableEntity","MenuCategoryEntity","MenuItemEntity","TableSessionEntity","OrderBatchEntity","OrderItemEntity","BillEntity","PaymentEntity","PurchaseEntity","MonthlyAccountingEntity","AssetEntity","FinancialMovementEntity"){
            override fun onInvalidated(tables:Set<String>){appScope.launch{db.dao().markCloudDirty();FirebaseCloudSync.enqueueImmediate(this@PosApplication);FirebaseCloudSync.enqueueBackup(this@PosApplication)}}
        })
    }
    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .components {
            add(OfflineVietQrFetcher.Factory())
        }
        .build()
}
