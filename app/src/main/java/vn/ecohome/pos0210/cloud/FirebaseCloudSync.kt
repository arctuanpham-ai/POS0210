package vn.ecohome.pos0210.cloud

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import vn.ecohome.pos0210.data.CloudSyncStateEntity
import vn.ecohome.pos0210.data.PosDao
import vn.ecohome.pos0210.data.PosDatabase
import vn.ecohome.pos0210.ExpenseCategories
import vn.ecohome.pos0210.calculateAssetValue
import java.util.Calendar
import java.util.concurrent.TimeUnit

data class FirebaseConfig(val projectId:String,val applicationId:String,val apiKey:String){
    val valid:Boolean get()=projectId.isNotBlank()&&applicationId.isNotBlank()&&apiKey.isNotBlank()
}
data class CloudDashboard(val openTables:Int=0,val revenueToday:Long=0,val paidBillsToday:Int=0,val monthRevenue:Long=0,val operatingProfit:Long?=null,val closingCash:Long=0,val initialInvestment:Long=0,val recoveredCapital:Long=0,val paybackBasisPoints:Int=0,val lastUpdatedAt:Long=0,val openTableNames:List<String> = emptyList(),val online:Boolean=false,val error:String?=null)
object CloudSyncPolicy{
    val safeSettingKeys=setOf("bank_name","bank_account","bank_holder","qr_prefix","printer_paper_mm","loyalty_auto_tier","member_discount_percent","vip_min_points","vip_discount_percent","vvip_min_points","vvip_discount_percent")
    fun shouldUploadSetting(key:String)=key in safeSettingKeys
}

object FirebaseCloudSync {
    private const val APP_NAME="pos0210-cloud"
    private const val WORK_NAME="pos0210-firebase-periodic"
    private const val BACKUP_WORK_NAME="pos0210-firebase-hourly-backup"

    suspend fun config(context:Context):FirebaseConfig{
        val settings=PosDatabase.get(context).dao().allSettingsSnapshot().associate{it.key to it.value}
        return FirebaseConfig(settings["firebase_project_id"].orEmpty(),settings["firebase_application_id"].orEmpty(),settings["firebase_api_key"].orEmpty())
    }
    internal fun firebaseApp(context:Context,c:FirebaseConfig):FirebaseApp{
        FirebaseApp.getApps(context).firstOrNull{it.name==APP_NAME}?.let{return it}
        return FirebaseApp.initializeApp(context,FirebaseOptions.Builder().setProjectId(c.projectId).setApplicationId(c.applicationId).setApiKey(c.apiKey).build(),APP_NAME)
            ?: error("Không thể khởi tạo Firebase")
    }
    suspend fun signIn(context:Context,email:String,password:String):String{
        val c=config(context);require(c.valid){"Chưa cấu hình Firebase"}
        return FirebaseAuth.getInstance(firebaseApp(context,c)).signInWithEmailAndPassword(email.trim(),password).await().user?.uid?:error("Firebase không trả UID")
    }
    fun signOut(context:Context){runCatching{FirebaseApp.getApps(context).firstOrNull{it.name==APP_NAME}?.let{FirebaseAuth.getInstance(it).signOut()}}}
    fun reset(context:Context){runCatching{FirebaseApp.getApps(context).firstOrNull{it.name==APP_NAME}?.delete()}}
    fun currentUid(context:Context):String?=runCatching{FirebaseApp.getApps(context).firstOrNull{it.name==APP_NAME}?.let{FirebaseAuth.getInstance(it).currentUser?.uid}}.getOrNull()

    private suspend fun <T> stage(name:String,block:suspend()->T):T =
        try{ block() }catch(e:Throwable){ throw IllegalStateException("$name: ${e.message}",e) }

    suspend fun backupNow(context:Context):Result<CloudBackupInfo> = runCatching{
        val c=config(context);require(c.valid){"Chưa cấu hình Firebase"}
        val app=firebaseApp(context,c)
        val uid=FirebaseAuth.getInstance(app).currentUser?.uid?:error("Chưa đăng nhập Firebase")
        FirestorePrivateBackup.upload(context,FirebaseFirestore.getInstance(app),uid,System.currentTimeMillis())
    }

    suspend fun syncNow(context:Context):Result<Unit> = runCatching{
        val db=PosDatabase.get(context);val dao=db.dao();val old=dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity()
        dao.saveCloudSyncState(old.copy(lastAttemptAt=System.currentTimeMillis(),lastError=null))
        val c=config(context);require(c.valid){"Chưa cấu hình Firebase"};val firebaseApp=firebaseApp(context,c);val uid=FirebaseAuth.getInstance(firebaseApp).currentUser?.uid?:error("Chưa đăng nhập Firebase")
        val fs=FirebaseFirestore.getInstance(firebaseApp);val root=fs.collection("users").document(uid).collection("stores").document("0210")
        stage("PULL_FINANCE"){pullCloudFinance(root,dao)}
        stage("WRITE_FINANCE"){writeFinanceMirror(fs,root,dao)}
        val tables=dao.cloudTablesSnapshot();val sessions=dao.cloudSessionsSnapshot();val bills=dao.cloudBillsSnapshot();val payments=dao.cloudPaymentsSnapshot()
        val today=Calendar.getInstance().apply{set(Calendar.HOUR_OF_DAY,0);set(Calendar.MINUTE,0);set(Calendar.SECOND,0);set(Calendar.MILLISECOND,0)}.timeInMillis
        val paidToday=bills.filter{it.status=="PAID"&&(it.closedAt?:0)>=today};val open=sessions.filter{it.status=="OPEN"};val now=System.currentTimeMillis()
        stage("STORE_ROOT"){root.set(mapOf("name" to "0210","updatedAt" to now,"schemaVersion" to 1)).await()}
        val openByTable=open.associateBy{it.tableId}
        stage("DASHBOARD"){root.collection("dashboard").document("current").set(financialDashboard(dao,bills,payments,now)+mapOf("openTables" to open.size,"openTableNames" to tables.filter{openByTable.containsKey(it.id)}.map{it.name},"revenueToday" to paidToday.sumOf{it.total},"paidBillsToday" to paidToday.size,"lastUpdatedAt" to now)).await()}
        writeMaps(fs,root.collection("tableStatus"),tables.map{t->t.id to mapOf("id" to t.id,"name" to t.name,"areaId" to t.areaId,"active" to t.active,"occupied" to openByTable.containsKey(t.id),"openedAt" to openByTable[t.id]?.openedAt,"updatedAt" to now)})
        writeMaps(fs,root.collection("menu"),dao.allMenuSnapshot().map{m->m.id to mapOf("id" to m.id,"categoryId" to m.categoryId,"name" to m.name,"price" to m.price,"sortOrder" to m.sortOrder,"active" to m.active,"productCode" to m.productCode,"description" to m.description)})
        writeMaps(fs,root.collection("areas"),dao.allAreasSnapshot().map{a->a.id to mapOf("id" to a.id,"name" to a.name,"sortOrder" to a.sortOrder,"active" to a.active)})
        writeMaps(fs,root.collection("menuCategories"),dao.allCategoriesSnapshot().map{c0->c0.id to mapOf("id" to c0.id,"name" to c0.name,"sortOrder" to c0.sortOrder,"active" to c0.active)})
        writeMaps(fs,root.collection("sessions"),sessions.map{s->s.id to mapOf("id" to s.id,"tableId" to s.tableId,"openedAt" to s.openedAt,"openedBy" to s.openedBy,"status" to s.status,"version" to s.version)})
        writeMaps(fs,root.collection("orderBatches"),dao.cloudOrderBatchesSnapshot().map{b->b.id to mapOf("id" to b.id,"sessionId" to b.sessionId,"sequence" to b.sequence,"ordererId" to b.ordererId,"createdAt" to b.createdAt,"sentAt" to b.sentAt,"status" to b.status,"serviceNo" to b.serviceNo,"deliveredAt" to b.deliveredAt,"deliveredBy" to b.deliveredBy)})
        writeMaps(fs,root.collection("orderItems"),dao.cloudOrderItemsSnapshot().map{i->i.id to mapOf("id" to i.id,"batchId" to i.batchId,"menuItemId" to i.menuItemId,"itemName" to i.itemNameSnapshot,"unitPrice" to i.unitPriceSnapshot,"qty" to i.qty,"note" to i.note,"adjustmentOfItemId" to i.adjustmentOfItemId)})
        writeMaps(fs,root.collection("bills"),bills.map{b->b.id to mapOf("id" to b.id,"sessionId" to b.sessionId,"billNo" to b.billNo,"openedAt" to b.openedAt,"closedAt" to b.closedAt,"subtotal" to b.subtotal,"total" to b.total,"status" to b.status)})
        writeMaps(fs,root.collection("payments"),payments.map{p->p.id to mapOf("id" to p.id,"billId" to p.billId,"method" to p.method,"amount" to p.amount,"cashierId" to p.cashierId,"paidAt" to p.paidAt,"reference" to p.reference)})
        val settings=dao.allSettingsSnapshot().filter{CloudSyncPolicy.shouldUploadSetting(it.key)}.associate{it.key to it.value};root.collection("config").document("safe").set(settings+mapOf("updatedAt" to now)).await()
        // Realtime/business sync must not fail just because the independent private backup fails.
        // Backup is handled separately and keeps its own status/error.
        val backupError=runCatching{FirestorePrivateBackup.upload(context,fs,uid,now)}.exceptionOrNull()?.message?.take(240)
        dao.saveCloudSyncState(old.copy(enabled=true,dirty=false,lastAttemptAt=now,lastSuccessAt=now,lastError=backupError?.let{"PRIVATE_BACKUP_ONLY: $it"},syncedUid=uid))
    }.onFailure{e->
        val dao=PosDatabase.get(context).dao();val old=dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity();dao.saveCloudSyncState(old.copy(lastAttemptAt=System.currentTimeMillis(),lastError=e.message?.take(300)))
    }

    suspend fun syncDashboardNow(context:Context):Result<Unit> = runCatching{
        val db=PosDatabase.get(context);val dao=db.dao();val c=config(context);require(c.valid){"Chưa cấu hình Firebase"};val firebaseApp=firebaseApp(context,c);val uid=FirebaseAuth.getInstance(firebaseApp).currentUser?.uid?:error("Chưa đăng nhập Firebase")
        val fs=FirebaseFirestore.getInstance(firebaseApp);val root=fs.collection("users").document(uid).collection("stores").document("0210")
        stage("PULL_FINANCE"){pullCloudFinance(root,dao)}
        stage("WRITE_FINANCE"){writeFinanceMirror(fs,root,dao)}
        val tables=dao.cloudTablesSnapshot();val sessions=dao.cloudSessionsSnapshot();val batches=dao.cloudOrderBatchesSnapshot();val items=dao.cloudOrderItemsSnapshot();val bills=dao.cloudBillsSnapshot();val open=sessions.filter{it.status=="OPEN"};val openByTable=open.associateBy{it.tableId}
        val today=Calendar.getInstance().apply{set(Calendar.HOUR_OF_DAY,0);set(Calendar.MINUTE,0);set(Calendar.SECOND,0);set(Calendar.MILLISECOND,0)}.timeInMillis;val paidToday=bills.filter{it.status=="PAID"&&(it.closedAt?:0)>=today};val now=System.currentTimeMillis()
        root.collection("dashboard").document("current").set(financialDashboard(dao,bills,dao.cloudPaymentsSnapshot(),now)+mapOf("openTables" to open.size,"openTableNames" to tables.filter{openByTable.containsKey(it.id)}.map{it.name},"revenueToday" to paidToday.sumOf{it.total},"paidBillsToday" to paidToday.size,"lastUpdatedAt" to now)).await()
        writeMaps(fs,root.collection("tableStatus"),tables.map{t->t.id to mapOf("id" to t.id,"name" to t.name,"areaId" to t.areaId,"active" to t.active,"occupied" to openByTable.containsKey(t.id),"openedAt" to openByTable[t.id]?.openedAt,"updatedAt" to now)})
        // The browser manager is read-only, but it needs these live records to show
        // the current order and elapsed serving time without waiting for the backup job.
        writeMaps(fs,root.collection("sessions"),sessions.map{s->s.id to mapOf("id" to s.id,"tableId" to s.tableId,"openedAt" to s.openedAt,"openedBy" to s.openedBy,"status" to s.status,"version" to s.version)})
        writeMaps(fs,root.collection("orderBatches"),batches.map{b->b.id to mapOf("id" to b.id,"sessionId" to b.sessionId,"sequence" to b.sequence,"ordererId" to b.ordererId,"createdAt" to b.createdAt,"sentAt" to b.sentAt,"status" to b.status,"serviceNo" to b.serviceNo,"deliveredAt" to b.deliveredAt,"deliveredBy" to b.deliveredBy)})
        writeMaps(fs,root.collection("orderItems"),items.map{i->i.id to mapOf("id" to i.id,"batchId" to i.batchId,"menuItemId" to i.menuItemId,"itemName" to i.itemNameSnapshot,"unitPrice" to i.unitPriceSnapshot,"qty" to i.qty,"note" to i.note,"adjustmentOfItemId" to i.adjustmentOfItemId)})
    }

    private suspend fun pullCloudFinance(root:com.google.firebase.firestore.DocumentReference,dao:PosDao){
        val remotePurchases=root.collection("purchases").get().await().documents
        remotePurchases.forEach{doc->
            val id=doc.getString("id")?.ifBlank{doc.id}?:doc.id
            val purchasedAt=doc.getLong("purchasedAt")?:return@forEach
            val total=doc.getLong("total")?:return@forEach
            if(total<=0)return@forEach
            dao.insertCloudPurchase(
                vn.ecohome.pos0210.data.PurchaseEntity(
                    id=id,
                    supplierId=doc.getString("supplierId"),
                    enteredBy=doc.getString("enteredBy").orEmpty().ifBlank{"WEB_MANAGER"},
                    purchasedAt=purchasedAt,
                    total=total,
                    note=doc.getString("note").orEmpty(),
                    status=doc.getString("status").orEmpty().ifBlank{"ACTIVE"},
                    expenseCategory=doc.getString("expenseCategory").orEmpty().ifBlank{"OTHER_EXPENSE"},
                    paidByName=doc.getString("paidByName").orEmpty(),
                    costCodeId=doc.getString("costCodeId"),
                    updatedAt=doc.getLong("updatedAt")
                )
            )
        }
        val remoteSuppliers=root.collection("suppliers").get().await().documents
        remoteSuppliers.forEach{doc->
            val id=doc.getString("id")?.ifBlank{doc.id}?:doc.id
            val name=doc.getString("name")?:return@forEach
            if(name.isNotBlank()) dao.saveSupplier(vn.ecohome.pos0210.data.SupplierEntity(id,name,doc.getString("phone").orEmpty(),doc.getString("note").orEmpty(),doc.getBoolean("active")?:true))
        }
        val remotePurchaseItems=root.collection("purchaseItems").get().await().documents.mapNotNull{doc->
            val purchaseId=doc.getString("purchaseId")?:return@mapNotNull null
            val name=doc.getString("name")?:return@mapNotNull null
            val qty=doc.getDouble("qty")?:doc.getLong("qty")?.toDouble()?:return@mapNotNull null
            val unitPrice=doc.getLong("unitPrice")?:return@mapNotNull null
            val amount=doc.getLong("amount")?:return@mapNotNull null
            vn.ecohome.pos0210.data.PurchaseItemEntity(
                id=doc.getString("id")?.ifBlank{doc.id}?:doc.id,
                purchaseId=purchaseId,
                categoryId=doc.getString("categoryId").orEmpty(),
                name=name,
                qty=qty,
                unit=doc.getString("unit").orEmpty().ifBlank{"lần"},
                unitPrice=unitPrice,
                amount=amount
            )
        }
        if(remotePurchaseItems.isNotEmpty()) dao.insertCloudPurchaseItems(remotePurchaseItems)
        val remoteAssets=root.collection("assets").get().await().documents
        remoteAssets.forEach{doc->
            val id=doc.getString("id")?.ifBlank{doc.id}?:doc.id
            val name=doc.getString("name")?:return@forEach
            val categoryId=doc.getString("categoryId")?:return@forEach
            val purchaseDate=doc.getLong("purchaseDate")?:return@forEach
            val purchasePrice=doc.getLong("purchasePrice")?:0L
            val quantity=(doc.getLong("quantity")?:1L).toInt().coerceAtLeast(1)
            val totalCost=doc.getLong("totalCost")?:return@forEach
            val usefulLifeMonths=(doc.getLong("usefulLifeMonths")?:1L).toInt().coerceAtLeast(1)
            dao.insertCloudAsset(vn.ecohome.pos0210.data.AssetEntity(
                id=id,name=name,categoryId=categoryId,purchaseDate=purchaseDate,purchasePrice=purchasePrice,
                quantity=quantity,totalCost=totalCost,supplier=doc.getString("supplier").orEmpty(),
                usefulLifeMonths=usefulLifeMonths,residualValue=doc.getLong("residualValue")?:0L,
                estimatedLiquidationValue=doc.getLong("estimatedLiquidationValue")?:0L,
                status=doc.getString("status").orEmpty().ifBlank{"ACTIVE"},disposalDate=doc.getLong("disposalDate"),
                disposalPrice=doc.getLong("disposalPrice"),note=doc.getString("note").orEmpty(),
                investmentClass=doc.getString("investmentClass").orEmpty().ifBlank{"INITIAL"}
            ))
        }
        val remoteMovements=root.collection("financialMovements").get().await().documents
        remoteMovements.forEach{doc->
            val id=doc.getString("id")?.ifBlank{doc.id}?:doc.id
            val type=doc.getString("type")?:return@forEach
            val amount=doc.getLong("amount")?:return@forEach
            val occurredAt=doc.getLong("occurredAt")?:return@forEach
            if(amount<=0)return@forEach
            dao.insertCloudFinancialMovement(
                vn.ecohome.pos0210.data.FinancialMovementEntity(
                    id=id,
                    type=type,
                    amount=amount,
                    occurredAt=occurredAt,
                    partnerId=doc.getString("partnerId"),
                    method=doc.getString("method").orEmpty().ifBlank{"CASH"},
                    note=doc.getString("note").orEmpty(),
                    counterpartyName=doc.getString("counterpartyName").orEmpty()
                )
            )
        }
    }

    private suspend fun writeFinanceMirror(fs:FirebaseFirestore,root:com.google.firebase.firestore.DocumentReference,dao:PosDao){
        writeMaps(fs,root.collection("purchases"),dao.cloudPurchasesSnapshot().map{p->p.id to mapOf("id" to p.id,"supplierId" to p.supplierId,"enteredBy" to p.enteredBy,"purchasedAt" to p.purchasedAt,"total" to p.total,"note" to p.note,"status" to p.status,"expenseCategory" to p.expenseCategory,"paidByName" to p.paidByName,"costCodeId" to p.costCodeId,"updatedAt" to p.updatedAt)})
        val purchaseItems=dao.allPurchasesSnapshot().flatMap{p->dao.purchaseItemsSnapshot(p.id)}
        writeMaps(fs,root.collection("purchaseItems"),purchaseItems.map{i->i.id to mapOf("id" to i.id,"purchaseId" to i.purchaseId,"categoryId" to i.categoryId,"name" to i.name,"qty" to i.qty,"unit" to i.unit,"unitPrice" to i.unitPrice,"amount" to i.amount)})
        writeMaps(fs,root.collection("purchaseCategories"),dao.allPurchaseCategoriesSnapshot().map{p->p.id to mapOf("id" to p.id,"name" to p.name,"defaultUnit" to p.defaultUnit,"sortOrder" to p.sortOrder,"active" to p.active)})
        writeMaps(fs,root.collection("suppliers"),dao.allSuppliersSnapshot().map{s->s.id to mapOf("id" to s.id,"name" to s.name,"phone" to s.phone,"note" to s.note,"active" to s.active)})
        writeMaps(fs,root.collection("costCodes"),dao.allCostCodesSnapshot().map{c0->c0.id to mapOf("id" to c0.id,"code" to c0.code,"name" to c0.name,"parentExpenseCategory" to c0.parentExpenseCategory,"defaultUnit" to c0.defaultUnit,"defaultSupplier" to c0.defaultSupplier,"referenceUnitPrice" to c0.referenceUnitPrice,"sortOrder" to c0.sortOrder,"active" to c0.active)})
        writeMaps(fs,root.collection("profitPartners"),dao.allProfitPartnersSnapshot().map{p->p.id to mapOf("id" to p.id,"name" to p.name,"shareBasisPoints" to p.shareBasisPoints,"sortOrder" to p.sortOrder,"active" to p.active)})
        writeMaps(fs,root.collection("assetCategories"),dao.allAssetCategoriesSnapshot().map{a->a.id to mapOf("id" to a.id,"name" to a.name,"defaultUsefulLifeMonths" to a.defaultUsefulLifeMonths,"minUsefulLifeMonths" to a.minUsefulLifeMonths,"maxUsefulLifeMonths" to a.maxUsefulLifeMonths,"sortOrder" to a.sortOrder,"active" to a.active)})
        writeMaps(fs,root.collection("monthlyAccounting"),dao.cloudAccountingSnapshot().map{a->a.monthKey to mapOf("monthKey" to a.monthKey,"cogs" to a.cogs,"openingCash" to a.openingCash,"closingCash" to a.closingCashSnapshot,"operatingProfit" to a.operatingProfitSnapshot,"distributableProfit" to a.distributableProfitSnapshot)})
        writeMaps(fs,root.collection("assets"),dao.cloudAssetsSnapshot().map{a->a.id to mapOf("id" to a.id,"name" to a.name,"categoryId" to a.categoryId,"purchaseDate" to a.purchaseDate,"purchasePrice" to a.purchasePrice,"quantity" to a.quantity,"totalCost" to a.totalCost,"supplier" to a.supplier,"usefulLifeMonths" to a.usefulLifeMonths,"residualValue" to a.residualValue,"estimatedLiquidationValue" to a.estimatedLiquidationValue,"status" to a.status,"disposalDate" to a.disposalDate,"disposalPrice" to a.disposalPrice,"note" to a.note,"investmentClass" to a.investmentClass)})
        writeMaps(fs,root.collection("financialMovements"),dao.cloudMovementsSnapshot().map{m->m.id to mapOf("id" to m.id,"type" to m.type,"amount" to m.amount,"occurredAt" to m.occurredAt,"partnerId" to m.partnerId,"method" to m.method,"note" to m.note,"counterpartyName" to m.counterpartyName)})
    }

    private suspend fun writeMaps(fs:FirebaseFirestore,collection:com.google.firebase.firestore.CollectionReference,rows:List<Pair<String,Map<String,Any?>>>){
        rows.chunked(400).forEach{chunk->val batch=fs.batch();chunk.forEach{(id,data)->batch.set(collection.document(id),data)};batch.commit().await()}
    }
    private suspend fun financialDashboard(dao:PosDao,bills:List<vn.ecohome.pos0210.data.BillEntity>,payments:List<vn.ecohome.pos0210.data.PaymentEntity>,now:Long):Map<String,Any?>{
        val month=Calendar.getInstance().apply{timeInMillis=now;set(Calendar.DAY_OF_MONTH,1);set(Calendar.HOUR_OF_DAY,0);set(Calendar.MINUTE,0);set(Calendar.SECOND,0);set(Calendar.MILLISECOND,0)}
        val from=month.timeInMillis;val to=Calendar.getInstance().apply{timeInMillis=from;add(Calendar.MONTH,1)}.timeInMillis;val monthKey="%04d-%02d".format(month.get(Calendar.YEAR),month.get(Calendar.MONTH)+1)
        val monthBills=bills.filter{it.status=="PAID"&&(it.closedAt?:Long.MIN_VALUE) in from until to};val billIds=monthBills.map{it.id}.toSet();val monthRevenue=monthBills.sumOf{it.total};val received=payments.filter{it.billId in billIds}.sumOf{it.amount}
        val purchases=dao.cloudPurchasesSnapshot();val monthPurchases=purchases.filter{it.status=="ACTIVE"&&it.purchasedAt in from until to};fun sum(category:String)=monthPurchases.filter{it.expenseCategory==category}.sumOf{it.total}
        val fixed=sum(ExpenseCategories.FIXED_EXPENSE);val variableExpense=sum(ExpenseCategories.VARIABLE_EXPENSE);val other=sum(ExpenseCategories.OTHER_EXPENSE);val inventory=sum(ExpenseCategories.INVENTORY_PURCHASE);val capital=sum(ExpenseCategories.CAPITAL_ASSET);val setup=sum(ExpenseCategories.SETUP_COST)+sum(ExpenseCategories.INITIAL_INVESTMENT_SUNK);val unclassified=sum(ExpenseCategories.UNCLASSIFIED)
        val movements=dao.cloudMovementsSnapshot();val monthMovements=movements.filter{it.occurredAt in from until to};val contribution=sum(ExpenseCategories.OWNER_CONTRIBUTION)+monthMovements.filter{it.type=="CAPITAL_CONTRIBUTION"}.sumOf{it.amount};val workingCapital=monthMovements.filter{it.type=="WORKING_CAPITAL"}.sumOf{it.amount};val otherCashIn=monthMovements.filter{it.type in setOf("OTHER_CASH_IN","OTHER_CASH_ADJUSTMENT","ASSET_DISPOSAL_IN")}.sumOf{it.amount};val withdrawal=sum(ExpenseCategories.OWNER_WITHDRAWAL)+monthMovements.filter{it.type=="OWNER_WITHDRAWAL"}.sumOf{it.amount};val profitWithdrawal=sum(ExpenseCategories.PROFIT_WITHDRAWAL)+monthMovements.filter{it.type=="PROFIT_WITHDRAWAL"}.sumOf{it.amount}
        val assets=dao.cloudAssetsSnapshot();val activeAssets=assets.filter{it.status in setOf("ACTIVE","DAMAGED","TRANSFERRED")};val depreciation=activeAssets.filter{it.purchaseDate<to}.sumOf{a->val p=Calendar.getInstance().apply{timeInMillis=a.purchaseDate};val used=((month.get(Calendar.YEAR)-p.get(Calendar.YEAR))*12+month.get(Calendar.MONTH)-p.get(Calendar.MONTH)+1).coerceAtLeast(0);calculateAssetValue(a.totalCost,a.residualValue,a.usefulLifeMonths,used).monthlyDepreciation}
        val accounting=dao.cloudAccountingSnapshot().firstOrNull{it.monthKey==monthKey};val operatingProfit=accounting?.cogs?.let{monthRevenue-it-fixed-variableExpense-other-depreciation};val openingCash=accounting?.openingCash?:0;val closingCash=openingCash+received+contribution+workingCapital+otherCashIn-inventory-fixed-variableExpense-other-unclassified-capital-setup-withdrawal-profitWithdrawal
        val initialInvestment=purchases.filter{it.status=="ACTIVE"&&it.expenseCategory in setOf(ExpenseCategories.SETUP_COST,ExpenseCategories.INITIAL_INVESTMENT_SUNK)}.sumOf{it.total}+assets.sumOf{it.totalCost};val recoveredCapital=movements.filter{it.type=="RECOVERED_CAPITAL"}.sumOf{it.amount};val paybackBp=if(initialInvestment<=0)0 else ((recoveredCapital.coerceAtMost(initialInvestment)*10_000)/initialInvestment).toInt()
        return mapOf("monthKey" to monthKey,"monthRevenue" to monthRevenue,"operatingProfit" to operatingProfit,"closingCash" to closingCash,"initialInvestment" to initialInvestment,"recoveredCapital" to recoveredCapital,"paybackBasisPoints" to paybackBp)
    }
    fun dashboard(context:Context):Flow<CloudDashboard> = callbackFlow{
        val c=config(context);if(!c.valid){trySend(CloudDashboard(error="Chưa cấu hình Firebase"));close();return@callbackFlow}
        val firebaseApp=firebaseApp(context,c);val uid=FirebaseAuth.getInstance(firebaseApp).currentUser?.uid
        if(uid==null){trySend(CloudDashboard(error="Chưa đăng nhập Firebase"));close();return@callbackFlow}
        val registration=FirebaseFirestore.getInstance(firebaseApp).collection("users").document(uid).collection("stores").document("0210").collection("dashboard").document("current")
            .addSnapshotListener{doc,error->if(error!=null)trySend(CloudDashboard(error=error.message)) else trySend(CloudDashboard(openTables=doc?.getLong("openTables")?.toInt()?:0,revenueToday=doc?.getLong("revenueToday")?:0,paidBillsToday=doc?.getLong("paidBillsToday")?.toInt()?:0,monthRevenue=doc?.getLong("monthRevenue")?:0,operatingProfit=doc?.getLong("operatingProfit"),closingCash=doc?.getLong("closingCash")?:0,initialInvestment=doc?.getLong("initialInvestment")?:0,recoveredCapital=doc?.getLong("recoveredCapital")?:0,paybackBasisPoints=doc?.getLong("paybackBasisPoints")?.toInt()?:0,lastUpdatedAt=doc?.getLong("lastUpdatedAt")?:0,openTableNames=(doc?.get("openTableNames") as? List<*>)?.mapNotNull{it as? String}.orEmpty(),online=true))}
        awaitClose{registration.remove()}
    }
    fun schedule(context:Context){
        val network=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val syncRequest=PeriodicWorkRequestBuilder<FirebaseSyncWorker>(24,TimeUnit.HOURS)
            .setConstraints(network).build()
        val backupRequest=PeriodicWorkRequestBuilder<FirebaseBackupWorker>(1,TimeUnit.HOURS)
            .setConstraints(network).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,ExistingPeriodicWorkPolicy.UPDATE,syncRequest
        )
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            BACKUP_WORK_NAME,ExistingPeriodicWorkPolicy.UPDATE,backupRequest
        )
    }
    fun enqueueImmediate(context:Context){
        val request=OneTimeWorkRequestBuilder<FirebaseRealtimeWorker>().setInitialDelay(3,TimeUnit.SECONDS).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(context).enqueueUniqueWork("pos0210-firebase-immediate",ExistingWorkPolicy.REPLACE,request)
    }
    fun enqueueBackup(context:Context){
        val request=OneTimeWorkRequestBuilder<FirebaseBackupWorker>()
            .setInitialDelay(5,TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            "pos0210-firebase-backup",ExistingWorkPolicy.REPLACE,request
        )
    }
}

class FirebaseSyncWorker(context:Context,params:WorkerParameters):CoroutineWorker(context,params){
    override suspend fun doWork():Result{
        val state=PosDatabase.get(applicationContext).dao().cloudSyncStateSnapshot()
        if(state?.enabled!=true)return Result.success()
        return if(FirebaseCloudSync.syncNow(applicationContext).isSuccess)Result.success() else Result.retry()
    }
}
class FirebaseRealtimeWorker(context:Context,params:WorkerParameters):CoroutineWorker(context,params){
    override suspend fun doWork():Result{
        val state=PosDatabase.get(applicationContext).dao().cloudSyncStateSnapshot()
        if(state?.enabled!=true)return Result.success()
        return if(FirebaseCloudSync.syncDashboardNow(applicationContext).isSuccess)Result.success() else Result.retry()
    }
}

class FirebaseBackupWorker(context:Context,params:WorkerParameters):CoroutineWorker(context,params){
    override suspend fun doWork():Result{
        val state=PosDatabase.get(applicationContext).dao().cloudSyncStateSnapshot()
        if(state?.enabled!=true)return Result.success()
        return if(FirebaseCloudSync.backupNow(applicationContext).isSuccess)Result.success() else Result.retry()
    }
}
