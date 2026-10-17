package vn.ecohome.pos0210
import android.app.Application
import android.content.Intent
import android.graphics.BitmapFactory
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.room.withTransaction
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import vn.ecohome.pos0210.cloud.*
import vn.ecohome.pos0210.data.*
import vn.ecohome.pos0210.printing.PrinterText
import vn.ecohome.pos0210.printing.BluetoothPrinter
import vn.ecohome.pos0210.printing.PrinterRouting
import vn.ecohome.pos0210.printing.ReceiptRenderer
import vn.ecohome.pos0210.payment.VietQrOffline
import vn.ecohome.pos0210.payment.PaymentQrMode
import vn.ecohome.pos0210.payment.CheckoutPrintPolicy
import vn.ecohome.pos0210.promotion.BuyGetPolicy
import vn.ecohome.pos0210.promotion.BuyGetRule
import java.util.UUID
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
data class PurchaseReceiptLine(
 val name:String,
 val categoryId:String,
 val qty:Double,
 val unit:String,
 val unitPrice:Long
){
 val amount:Long get()=(qty*unitPrice).toLong()
 val isValid:Boolean get()=name.isNotBlank()&&qty>0&&unitPrice>0
}

class PosViewModel(app:Application):AndroidViewModel(app){
 private val db=PosDatabase.get(app);private val repo=PosRepository(db);private val dao=db.dao();private val masterMutex=Mutex();private val attendanceMutex=Mutex()
 val orderMessage=MutableStateFlow("")
 // ---- Giỏ món chưa gửi theo bàn: lưu nháp trên máy (SharedPreferences, không đồng bộ cloud), thoát ra vào lại không mất món ----
 private val draftPrefs by lazy { getApplication<Application>().getSharedPreferences("pos0210_cart_drafts_v1", android.content.Context.MODE_PRIVATE) }
 val cartDrafts=MutableStateFlow<Map<String,Int>>(emptyMap())
 private fun loadDraftCounts(){cartDrafts.value=draftPrefs.all.mapNotNull{(k,v)->runCatching{val o=org.json.JSONObject(v as String);val c=o.getJSONObject("cart");k to c.keys().asSequence().sumOf{c.getInt(it)}}.getOrNull()}.filter{it.second>0}.toMap()}
 fun saveDraft(tableId:String){
  val c=cart.value.filterValues{it>0}
  if(c.isEmpty()){draftPrefs.edit().remove(tableId).apply()}
  else{
   val o=org.json.JSONObject().put("cart",org.json.JSONObject(c as Map<*,*>)).put("notes",org.json.JSONObject(cartNotes.value as Map<*,*>)).put("at",System.currentTimeMillis()).put("by",currentEmployee.value?.name.orEmpty())
   draftPrefs.edit().putString(tableId,o.toString()).apply()
  }
  loadDraftCounts()
 }
 /** Khôi phục giỏ nháp của bàn (nếu có). Trả về số món khôi phục. */
 fun restoreDraft(tableId:String):Int{
  val raw=draftPrefs.getString(tableId,null)?:return 0
  return runCatching{
   val o=org.json.JSONObject(raw);val c=o.getJSONObject("cart");val n=o.optJSONObject("notes")
   val menuIds=menu.value.map{it.id}.toSet()+combos.value.map{"combo:"+it.id}
   val restored=c.keys().asSequence().filter{it in menuIds}.associateWith{c.getInt(it)}.filterValues{it>0}
   cart.value=restored
   cartNotes.value=n?.keys()?.asSequence()?.filter{key->restored.keys.any{key.startsWith(it)}}?.associateWith{n.getString(it)}?:emptyMap()
   restored.values.sum()
  }.getOrDefault(0).also{if(it>0)orderMessage.value="ĐÃ KHÔI PHỤC $it MÓN CHƯA GỬI CỦA BÀN NÀY · kiểm tra rồi bấm gửi"}
 }
 fun clearDraft(tableId:String){draftPrefs.edit().remove(tableId).apply();loadDraftCounts()}
 /** Rời màn order: còn món chưa gửi thì lưu nháp cho bàn, không mất. */
 fun leaveOrder(){
  val t=currentTable.value
  if(t!=null){saveDraft(t.id);if(cart.value.isNotEmpty())orderMessage.value="Đã lưu nháp ${cart.value.values.sum()} món chưa gửi của ${t.name}"}
  screen.value="TABLES"
 }
 // ---- Chống bấm gửi order 2 lần ----
 private val sending=java.util.concurrent.atomic.AtomicBoolean(false)
 val sendingBatch=MutableStateFlow(false)
 // ---- Dự báo doanh thu cuối ngày (chỉ dữ liệu bill trên máy) ----
 val revenueForecast=MutableStateFlow<RevenueForecast?>(null)
 fun refreshForecast(){viewModelScope.launch(Dispatchers.IO){runCatching{
  val since=System.currentTimeMillis()-29L*86_400_000L
  val sales=dao.cloudBillsSnapshot().filter{it.status=="PAID"&&it.dataScope=="LIVE"&&it.closedAt!=null&&it.openedAt>=since}.map{RevenueForecaster.Sale(it.openedAt,it.total)}
  revenueForecast.value=RevenueForecaster.forecast(sales,System.currentTimeMillis())
 }}}
 val allPurchaseItems=dao.allPurchaseItems().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val salesReport=repo.salesReportData().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),SalesReportData())
 /** Phiếu chi web chưa duyệt / bị trả lại (chưa tính chi phí). */
 val unreviewedPurchases=dao.unreviewedPurchases().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val monthlyAccounting=dao.monthlyAccounting().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val profitPartners=dao.profitPartners().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val tableServiceTimings=dao.tableServiceTimings().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val areas=repo.areas().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val tables=repo.tables().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val waitingBatches=dao.waitingBatches().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val categories=repo.categories().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val menu=repo.menuItems().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val combos=dao.combos().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val employees=repo.employees().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val sessions=repo.openSessions().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val bills=repo.paidBills().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val testBills=dao.testPaidBills().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val openAttendances=dao.openAttendances().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val myAttendance=MutableStateFlow<AttendanceSessionEntity?>(null);val suppliers=dao.suppliers().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val purchases=dao.purchases().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val purchaseCosts=dao.purchaseCosts().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val purchaseCategories=dao.purchaseCategories().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val costCodes=dao.costCodes().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val purchaseItemsAll=dao.allPurchaseItems().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val payments=dao.payments().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val customers=dao.customers().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val customerItemStats=dao.customerItemStats().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val pricingRules=dao.pricingRules().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val buyGetPromotions=dao.buyGetPromotions().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val billAdjustments=dao.billAdjustments().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val settings=dao.settings().stateIn(viewModelScope,SharingStarted.Eagerly,emptyList());val printJobs=dao.printJobs().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val audits=dao.audits().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val itemSales=dao.paidItemSales().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val loyaltyCampaigns=dao.allLoyaltyCampaigns().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val payrollDays=MutableStateFlow<List<PayrollDay>>(emptyList())
 val payrollPeriodLabel=MutableStateFlow("")
 val attendanceQaMode=MutableStateFlow(false)
 private val payrollSelection=MutableStateFlow<PayrollPeriod?>(null)
 private var payrollRefreshJob:Job?=null
 fun loadPayrollMonth(year:Int,month:Int){
  payrollSelection.value=PayrollPeriod.of(year,month,java.time.ZoneId.systemDefault())
  refreshPayroll()
 }
 private fun refreshPayroll(){
  val selected=payrollSelection.value?:return
  viewModelScope.launch(Dispatchers.IO){
   val now=System.currentTimeMillis()
   val zone=java.time.ZoneId.systemDefault()
   val scope=if(attendanceQaMode.value) "TEST" else "LIVE"
   val rows=AttendancePayroll.period(dao.attendanceBetween(selected.startAt,selected.endAt,now,scope),now,zone).filter{
    val date=java.time.LocalDate.parse(it.date)
    date.year==selected.year&&date.monthValue==selected.month
   }
   if(payrollSelection.value==selected){
    payrollDays.value=rows
    payrollPeriodLabel.value="%02d/%04d".format(selected.month,selected.year)
   }
  }
 }val healthIssues=MutableStateFlow<List<String>>(emptyList());val healthMessage=MutableStateFlow("Chưa kiểm tra");val customerUpdateMessage=MutableStateFlow("");val cartNotes=MutableStateFlow<Map<String,String>>(emptyMap());val cart=MutableStateFlow<Map<String,Int>>(emptyMap());val currentTable=MutableStateFlow<DiningTableEntity?>(null);val currentSession=MutableStateFlow<TableSessionEntity?>(null);val currentEmployee=MutableStateFlow<EmployeeEntity?>(null);val authError=MutableStateFlow("");val screen=MutableStateFlow("LOGIN");val printerPreview=MutableStateFlow("");val printerMessage=MutableStateFlow("");val printedCheckoutKey=MutableStateFlow<String?>(null);val checkoutPrintAttemptedKey=MutableStateFlow<String?>(null);val checkoutPrinting=MutableStateFlow(false);val checkoutPrintTestMode=MutableStateFlow(false);val businessTestMode=MutableStateFlow(false)
 val selectedVoucher=MutableStateFlow<CustomerRewardEntity?>(null);val selectedVoucherItemId=MutableStateFlow<String?>(null);val voucherMessage=MutableStateFlow("");val verifiedVoucher=MutableStateFlow<CustomerRewardEntity?>(null)
 val recentBankNotifications=dao.recentBankNotifications().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val assetCategories=dao.assetCategories().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val assets=dao.assets().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val assetValuations=dao.assetValuations().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val financialMovements=dao.financialMovements().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val openingCashAdjustments=dao.openingCashAdjustments().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val cloudSyncState=dao.cloudSyncState().stateIn(viewModelScope,SharingStarted.Eagerly,null)
 val cloudMessage=MutableStateFlow("");val cloudDashboard=MutableStateFlow(CloudDashboard());private var cloudDashboardJob:Job?=null
 // true khi máy còn nhớ syncedUid nhưng FirebaseAuth đã mất phiên: UI hiện "Đăng nhập lại, giữ nguyên UID" thay vì bắt đăng xuất.
 val firebaseSessionMissing=MutableStateFlow(false)
 init{
  loadDraftCounts()
  viewModelScope.launch{bootstrap()}
  viewModelScope.launch{openAttendances.collect{refreshPayroll()}}
  payrollRefreshJob=viewModelScope.launch{
   while(true){
    kotlinx.coroutines.delay(60_000L)
    refreshPayroll()
   }
  }
 }
 private suspend fun bootstrap(){
  val recovered=dao.recoverClaimedPrints()
  if(recovered>0){
   dao.audit(AuditEventEntity(UUID.randomUUID().toString(),"PRINT","RECOVERY","CLAIMED_TO_REVIEW",null,"ANDROID",System.currentTimeMillis(),"count=$recovered"))
  }
  seedAssetCategories()
  seedCostCodes()
  if(dao.areas().first().isNotEmpty())return
  seed()
 }
 private suspend fun seedAssetCategories(){
  if(dao.assetCategories().first().isNotEmpty())return
  listOf(
   AssetCategoryEntity("coffee_machine","Máy pha cà phê",60,36,96,0),AssetCategoryEntity("grinder","Máy xay",60,36,96,1),
   AssetCategoryEntity("cold_equipment","Thiết bị lạnh",72,36,120,2),AssetCategoryEntity("electrical","Thiết bị điện / POS",48,24,72,3),
   AssetCategoryEntity("kitchen","Thiết bị bếp",60,24,96,4),AssetCategoryEntity("furniture","Bàn ghế / nội thất",60,24,120,5),
   AssetCategoryEntity("other","Dụng cụ khác",36,12,84,6)
  ).forEach{dao.saveAssetCategory(it)}
 }
 private suspend fun seedCostCodes(){
  if(dao.costCodes().first().isNotEmpty())return
  listOf(
   CostCodeEntity("cc_electric","DV-DIEN","Điện",ExpenseCategories.ELECTRICITY,"kWh",sortOrder=0),
   CostCodeEntity("cc_water","DV-NUOC","Nước",ExpenseCategories.WATER,"m³",sortOrder=1),
   CostCodeEntity("cc_rent","DV-THUE","Thuê mặt bằng",ExpenseCategories.RENT,"tháng",sortOrder=2),
   CostCodeEntity("cc_payroll","NS-LUONG","Lương",ExpenseCategories.PAYROLL,"tháng",sortOrder=3),
   CostCodeEntity("cc_coffee","NL-CAFE-HAT","Cà phê hạt",ExpenseCategories.INVENTORY_PURCHASE,"kg",sortOrder=4)
  ).forEach{dao.saveCostCode(it)}
 }
 private suspend fun seed(){if(dao.areas().first().isNotEmpty())return;
 repo.savePurchaseCategory(PurchaseCategoryEntity("pc_salary","Lương","ngày công",0,true))
 repo.savePurchaseCategory(PurchaseCategoryEntity("pc_fixed","Vật tư cố định","cái",1,true))
 repo.savePurchaseCategory(PurchaseCategoryEntity("pc_production","Vật tư sản xuất","kg",2,true));repo.saveArea(AreaEntity("inside","Trong nhà",0));repo.saveArea(AreaEntity("outside","Ngoài trời",1));(1..6).forEach{repo.saveTable(DiningTableEntity("t$it","inside","Bàn %02d".format(it),it))};(7..8).forEach{repo.saveTable(DiningTableEntity("t$it","outside","Bàn %02d".format(it),it))};listOf("Cà phê","Ăn sáng","Trà","Sinh tố","Khác").forEachIndexed{i,n->repo.saveCategory(MenuCategoryEntity("c$i",n,i))};listOf(MenuItemEntity("m1","c0","Đen đá",25000,productCode="CF-001"),MenuItemEntity("m2","c0","Nâu đá",30000,productCode="CF-002"),MenuItemEntity("m3","c0","Bạc xỉu",30000,productCode="CF-003"),MenuItemEntity("m4","c1","Bún gà",40000,productCode="AS-001"),MenuItemEntity("m5","c1","Đùi gà",55000,productCode="AS-002"),MenuItemEntity("m6","c1","Cánh gà",45000,productCode="AS-003"),MenuItemEntity("m7","c2","Trà mạn",25000,productCode="TR-001"),MenuItemEntity("m8","c2","Trà đào",35000,productCode="TR-002")).forEach{repo.saveMenuItem(it)};repo.saveEmployee(EmployeeEntity("e0","Tuấn",true,"0210","ADMIN",true,true,true,true,true,true,true));repo.saveEmployee(EmployeeEntity("e1","Hương",true,"1992","STAFF",true,true,true,true,false,false,false));repo.saveEmployee(EmployeeEntity("e2","Nam",true,"2000","STAFF",false,false,true,true,false,false,false))}
 fun setAttendanceQaMode(enabled:Boolean){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN")return
  attendanceQaMode.value=enabled;refreshPayroll()
 }
 fun seedAttendanceQa(){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"){printerMessage.value="CHỈ ADMIN ĐƯỢC TẠO DỮ LIỆU QA";return}
  viewModelScope.launch(Dispatchers.IO){
   val now=System.currentTimeMillis();val fallback=PayrollSettings.hourlyRate(setting("hourly_rate_default"),35000L)
   val targets=dao.allEmployeesSnapshot().filter{it.active}.take(2)
   dao.deleteTestAttendances()
   val rows=targets.flatMap{employee->
    val rate=PayrollSettings.hourlyRate(setting("hourly_rate_"+employee.id),fallback)
    AttendanceQaFixtures.sample(employee.id,now,rate)
   }
   if(rows.isNotEmpty())dao.insertAttendanceSessions(rows)
   attendanceQaMode.value=true;refreshPayroll()
   audit("ATTENDANCE_QA","FIXTURE","SEED","sessions="+rows.size)
   printerMessage.value="QA · ĐÃ TẠO "+rows.size+" CA MẪU · KHÔNG TÍNH LƯƠNG THẬT"
  }
 }
 fun clearAttendanceQa(){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN")return
  viewModelScope.launch(Dispatchers.IO){
   val count=dao.deleteTestAttendances();attendanceQaMode.value=false;refreshPayroll()
   audit("ATTENDANCE_QA","FIXTURE","CLEAR","sessions="+count)
   printerMessage.value="QA · ĐÃ XÓA "+count+" CA MẪU"
  }
 }
 fun checkIn(){
  val e=currentEmployee.value?:return
  viewModelScope.launch(Dispatchers.IO){
   attendanceMutex.withLock {
   if(dao.openAttendance(e.id)!=null){printerMessage.value="BẠN ĐANG TRONG CA";return@withLock}
   val now=System.currentTimeMillis()
   val defaultRate=PayrollSettings.hourlyRate(setting("hourly_rate_default"),0L)
   val rate=PayrollSettings.hourlyRate(setting("hourly_rate_"+e.id),defaultRate)
   val localDate=SimpleDateFormat("yyyy-MM-dd",Locale.US).format(Date(now))
   val multiplier=HolidayMultiplier.basisPoints(setting(HolidayMultiplier.settingKey(localDate)))
   val s=AttendanceSessionEntity(UUID.randomUUID().toString(),e.id,now,hourlyRate=rate,multiplierBasisPoints=multiplier)
   dao.insertAttendanceSession(s);myAttendance.value=s;refreshPayroll()
   dao.enqueueSync(SyncQueueEntity(UUID.randomUUID().toString(),"ATTENDANCE",s.id,"UPSERT","",now,now))
   audit("ATTENDANCE",s.id,"CHECK_IN","hourlyRate=$rate,multiplierBp=$multiplier")
   printerMessage.value="ĐÃ CHECK-IN"
   }
  }
 }
fun checkOut(){ val e=currentEmployee.value?:return; viewModelScope.launch(Dispatchers.IO){ attendanceMutex.withLock { val s=dao.openAttendance(e.id)?:run{printerMessage.value="CHƯA CHECK-IN";return@withLock}; val now=System.currentTimeMillis(); if(dao.closeAttendance(s.id,now)==1){myAttendance.value=null;refreshPayroll();dao.enqueueSync(SyncQueueEntity(UUID.randomUUID().toString(),"ATTENDANCE",s.id,"UPSERT","",now,now));audit("ATTENDANCE",s.id,"CHECK_OUT","minutes="+((now-s.checkInAt)/60000));printerMessage.value="ĐÃ CHECK-OUT · "+((now-s.checkInAt)/60000)+" PHÚT"} } } }
fun login(pin:String){viewModelScope.launch{val e=dao.employeeByPin(pin);if(e==null)authError.value="PIN không đúng" else{currentEmployee.value=e;myAttendance.value=dao.openAttendance(e.id);authError.value="";touch();locked.value=false;runCatching{cleanupAbandonedPrepaid()};screen.value=if(dao.activeShift()==null&&!businessTestMode.value)"SHIFT_START" else "TABLES";audit("AUTH",e.id,"LOGIN")}}};fun logout(){locked.value=false;val e=currentEmployee.value;viewModelScope.launch{if(e!=null)audit("AUTH",e.id,"LOGOUT")};businessTestMode.value=false;checkoutPrintTestMode.value=false;printedCheckoutKey.value=null;currentEmployee.value=null;screen.value="LOGIN"}
 private suspend fun audit(type:String,id:String,action:String,payload:String=""){dao.audit(AuditEventEntity(UUID.randomUUID().toString(),type,id,action,currentEmployee.value?.id,"ANDROID",System.currentTimeMillis(),payload))}
 private fun autoBackup(){
  val root=setting("storage_root_uri")
  if(root.isNotBlank()&&setting("storage_write_enabled")!="false") DataBackup.backupLatest(getApplication(),root,includeMedia=false)
 }
 private fun autoBackupMedia(){
  val root=setting("storage_root_uri")
  if(root.isNotBlank()&&setting("storage_write_enabled")!="false") DataBackup.backupMediaLatest(getApplication(),root)
 }
 private suspend fun queueCatalogChange(type:String,id:String){
  val now=System.currentTimeMillis()
  dao.enqueueSync(SyncQueueEntity(UUID.randomUUID().toString(),type,id,"UPSERT","",now,now))
 }
 private suspend fun publishCatalogChange(){
  FirebaseCloudSync.enqueueCatalog(getApplication())
  cloudMessage.value="Menu đã lưu trên máy · chờ gom thay đổi 30 giây để đẩy Cloud"
 }
 private suspend fun autoMasterConfig(){
  val root=dao.allSettingsSnapshot().firstOrNull{it.key=="storage_root_uri"}?.value.orEmpty()
  val writes=dao.allSettingsSnapshot().firstOrNull{it.key=="storage_write_enabled"}?.value!="false"
  if(root.isBlank()||!writes)return
  masterMutex.withLock {
   ConfigBackup.saveMaster(getApplication(),root)
  }
 }
 fun runHealthCheck(){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN")return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val issues=runCatching{DatabaseHealth.diagnoseOperational(getApplication())}
    .getOrElse{listOf("Không chạy được kiểm tra: ${it.message ?: "UNKNOWN"}")}
   healthIssues.value=issues
   healthMessage.value=if(issues.isEmpty())"PASS · Dữ liệu lõi đang khớp" else "CẢNH BÁO · ${issues.size} nhóm lệch"
   audit("SYSTEM","HEALTH","CHECK","issues=${issues.size}")
  }
 } fun reconcileLegacyWaiting(){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN")return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val changed=dao.reconcileClosedSessionWaiting()
   if(changed>0){
    dao.audit(AuditEventEntity(UUID.randomUUID().toString(),"SYSTEM","LEGACY_WAITING","RECONCILE",e.id,"ANDROID",System.currentTimeMillis(),"count=$changed,status=RECONCILED"))
    autoBackup()
   }
   val issues=DatabaseHealth.diagnoseOperational(getApplication())
   healthIssues.value=issues
   healthMessage.value=if(issues.isEmpty())"PASS · Dữ liệu lõi đang khớp" else "CẢNH BÁO · ${issues.size} nhóm lệch"
  }
 }

 fun clearBusinessTestData(){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"){printerMessage.value="CHỈ ADMIN ĐƯỢC XÓA DỮ LIỆU TEST";return}
  if(currentSession.value!=null){printerMessage.value="HÃY KẾT THÚC BÀN ĐANG MỞ TRƯỚC";return}
  viewModelScope.launch(Dispatchers.IO){
   val n=repo.clearTestData()
   audit("SYSTEM","TEST_DATA","CLEAR_TEST_DATA","bills=$n")
   printerMessage.value="ĐÃ XÓA DỮ LIỆU TEST · $n BILL · LIVE GIỮ NGUYÊN"
  }
 }
 fun setBusinessTestMode(enabled:Boolean){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"&&e.role!="MANAGER"){printerMessage.value="CHỈ ADMIN/MANAGER ĐƯỢC BẬT TEST MODE";return}
  if(currentSession.value!=null){printerMessage.value="PHẢI KẾT THÚC BÀN HIỆN TẠI TRƯỚC KHI ĐỔI TEST MODE";return}
  businessTestMode.value=enabled
  printerMessage.value=if(enabled)"TEST MODE · KHÔNG TÍNH DOANH THU" else "ĐÃ VỀ CHẾ ĐỘ LIVE"
 }
 fun previewKitchen(){printerPreview.value="KITCHEN"}
 fun previewBill(){printerPreview.value="BILL"}
 fun previewCancel(){printerPreview.value="CANCEL"}
 fun clearPrinterPreview(){printerPreview.value=""}
 /** Ảnh xem trước đúng bằng ảnh sẽ in (cùng bộ vẽ, cùng khổ giấy). */
 fun previewBitmap(kind:String):android.graphics.Bitmap?{
  val profile=printerProfile()
  return when(kind){
   "KITCHEN"->ReceiptRenderer.kitchen("BÀN 02",1,27,"Tuấn",listOf(Triple("Bún gà",3,"không hành"),Triple("Cà phê sữa",1,"")),profile,"ĐÃ THU TIỀN · LÀM NGAY",System.currentTimeMillis())
   "BILL"->{
    val qr=if(isQrConfigured())runCatching{qrBitmap(121500L,"0210 BAN 02")}.getOrNull() else null
    ReceiptRenderer.bill("BÀN 02","08:32–09:25",listOf(Triple("Bún gà",2,40000L),Triple("Bạc xỉu",1,30000L),Triple("Đen đá",1,25000L)),135000L,0L,13500L,121500L,listOf("ƯU ĐÃI HẠNG VIP  -10%"),"ANH NAM","VIP",188,12,200,"CHUYỂN KHOẢN",qr,profile,"ĐƠN #027")
   }
   "CANCEL"->ReceiptRenderer.cancel("BÀN 02",2,"Quản lý","Khách đổi ý",profile)
   else->null
  }
 }
 private fun printerMode()=setting("printer_mode").ifBlank{"TEST"}
 private fun printerMac()=setting("printer_mac")
 private fun printerName()=setting("printer_name").ifBlank{BluetoothPrinter.PROFILE_NAME}
 private fun printerRouting()=PrinterRouting.fromSettings(printerMac(),setting("kitchen_printer_mac"),setting("receipt_printer_mac"))
 private fun kitchenPrinterMac()=printerRouting().addressFor(vn.ecohome.pos0210.printing.PrintJobType.KITCHEN)
 private fun receiptPrinterMac()=printerRouting().addressFor(vn.ecohome.pos0210.printing.PrintJobType.PAYMENT)
 private fun kitchenPrinterName()=setting("kitchen_printer_name").ifBlank{printerName()}
 private fun receiptPrinterName()=setting("receipt_printer_name").ifBlank{printerName()}
 private fun printerProfile()=vn.ecohome.pos0210.printing.PrinterProfile.fromSetting(setting("printer_paper_mm"))
 private fun qrMode()=setting("payment_qr_mode")
 private fun isQrConfigured()=PaymentQrMode.usesStaticSoundboxQr(qrMode())||
  (setting("bank_name").isNotBlank()&&setting("bank_account").isNotBlank())
 private fun qrBitmap(amount:Long,info:String)=
  if(PaymentQrMode.usesStaticSoundboxQr(qrMode())) {
   BitmapFactory.decodeResource(getApplication<Application>().resources,R.drawable.soundbox_qr_clean)
  } else VietQrOffline.bitmap(setting("bank_name"),setting("bank_account"),setting("bank_holder"),amount,info).getOrNull()
 fun testBluetoothPrint(){ testBluetoothPrint(vn.ecohome.pos0210.printing.PrintJobType.PAYMENT) }
 fun testKitchenBluetoothPrint(){ testBluetoothPrint(vn.ecohome.pos0210.printing.PrintJobType.KITCHEN) }
 private fun testBluetoothPrint(jobType:vn.ecohome.pos0210.printing.PrintJobType){
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   if(printerMode()!="BLUETOOTH"){printerMessage.value="Hãy chọn chế độ BLUETOOTH trước";return@launch}
   val mac=printerRouting().addressFor(jobType)
   val name=if(jobType==vn.ecohome.pos0210.printing.PrintJobType.KITCHEN) kitchenPrinterName() else receiptPrinterName()
   if(mac.isBlank()){printerMessage.value="Chưa chọn máy in Bluetooth";return@launch}
   printerMessage.value="Đang in thử..."
   val qr=qrBitmap(135000,"0210 TEST")
   val profile=printerProfile()
   val bitmap=if(jobType==vn.ecohome.pos0210.printing.PrintJobType.KITCHEN) ReceiptRenderer.kitchenItem("Bàn test",1,1,1,"Món test",1,"","Admin","",System.currentTimeMillis(),profile) else ReceiptRenderer.sampleBill(qr,profile)
   val result=BluetoothPrinter.printBitmap(getApplication(),mac,bitmap,profile,if(jobType==vn.ecohome.pos0210.printing.PrintJobType.KITCHEN) vn.ecohome.pos0210.printing.PrintJobType.KITCHEN else vn.ecohome.pos0210.printing.PrintJobType.TEST)
   printerMessage.value=if(result.isSuccess)"IN THỬ THÀNH CÔNG · $name" else "IN THỬ LỖI: ${result.exceptionOrNull()?.message}"
  }
 }
 fun setCartNote(key:String,note:String){cartNotes.value=cartNotes.value.toMutableMap().apply{if(note.isBlank())remove(key) else put(key,note.take(120))}}
 fun add(i:MenuItemEntity){cart.value=cart.value.toMutableMap().apply{put(i.id,(get(i.id)?:0)+1)}};fun sub(i:MenuItemEntity){cart.value=cart.value.toMutableMap().apply{val q=get(i.id)?:0;if(q<=1){remove(i.id);setCartNote(i.id,"")}else put(i.id,q-1)}};fun addCombo(i:ComboEntity){val k="combo:"+i.id;cart.value=cart.value.toMutableMap().apply{put(k,(get(k)?:0)+1)}};fun subCombo(i:ComboEntity){val k="combo:"+i.id;cart.value=cart.value.toMutableMap().apply{val q=get(k)?:0;if(q<=1){remove(k);setCartNote(k,"")}else put(k,q-1)}}
 /** Quy trình riêng của đơn đang soạn khi chưa có phiên. null = theo chế độ chung. */
 val orderFlowOverride=MutableStateFlow<String?>(null)
 fun orderFlow():String=orderFlowOverride.value?:paymentFlow()
 /** Từ danh sách chờ giao: mở thẳng bàn trả sau để sửa/hủy món hoặc thanh toán. */
 fun openPostpaidTable(tableId:String){viewModelScope.launch{val t=dao.tables().first().firstOrNull{it.id==tableId}?:return@launch;selectTable(t)}}
 val comboPartsAll=dao.comboItemsAll().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val comboOrderCounts=dao.comboOrderCounts().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 /** Áp dụng gợi ý combo vào giỏ (chỉ khi nhân viên bấm). Ghi chú của món lẻ đã đổi sang combo được bỏ. */
 fun applyComboSuggestion(s:ComboSuggestion,combo:ComboDef){
  val before=cart.value
  val after=ComboSuggestions.apply(before,s,combo)
  if(after==before)return
  cart.value=after
  cartNotes.value=cartNotes.value.filterKeys{k->k in after}
 }
 fun selectTable(t:DiningTableEntity,postpaidException:Boolean=false){
  val e=currentEmployee.value?:return
  if(!e.canOrder&&e.role!="ADMIN")return
  viewModelScope.launch{
   val existing=dao.openSessionForTable(t.id)
   if(existing!=null&&existing.flow==PaymentFlowRules.PREPAID&&dao.billBySessionId(existing.id)==null){resumePrepaid(existing);return@launch}
   val tap=PaymentFlowRules.tableTap(paymentFlow(),postpaidException,existing!=null&&existing.flow!=PaymentFlowRules.PREPAID)
   if(tap==PaymentFlowRules.TableTap.START_PREPAID){startPrepaidOrder(t);return@launch}
   // Đơn trả sau (kể cả ngoại lệ khi đang ở chế độ Trả trước): phiên sẽ được mở với flow trả sau.
   orderFlowOverride.value=PaymentFlowRules.POSTPAID
   resetPrepaidEdit()
   currentTable.value=t
   cart.value=emptyMap();cartNotes.value=emptyMap()
   if(existing==null)restoreDraft(t.id)
   if(existing!=null){
    currentSession.value=existing
    screen.value="SENT"
   }else{
    currentSession.value=null
    screen.value="ORDER"
   }
  }
 }
 fun addMore(){val e=currentEmployee.value?:return;if(!e.canOrder&&e.role!="ADMIN")return;if(currentSession.value==null||currentTable.value==null)return;cart.value=emptyMap();cartNotes.value=emptyMap();restoreDraft(currentTable.value!!.id);screen.value="ORDER"}
 fun addTable(areaId:String,name:String=""){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"&&!e.canManageSystem)return
  viewModelScope.launch{
   val n=tables.value.size+1
   val id=UUID.randomUUID().toString()
   val tableName=name.trim().ifBlank{"Bàn %02d".format(n)}
   repo.saveTable(DiningTableEntity(id,areaId,tableName,n,true))
   audit("TABLE",id,"CREATE","name=$tableName,area=$areaId")
   autoBackup();autoMasterConfig()
  }
 }
 fun updateTable(t:DiningTableEntity,name:String,areaId:String){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"&&!e.canManageSystem)return
  viewModelScope.launch{
   repo.saveTable(t.copy(name=name.trim().ifBlank{t.name},areaId=areaId))
   audit("TABLE",t.id,"UPDATE","name=$name,area=$areaId")
   autoBackup();autoMasterConfig()
  }
 }
 fun hideTable(t:DiningTableEntity){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"&&!e.canManageSystem)return
  viewModelScope.launch{
   if(dao.openSessionForTable(t.id)!=null)return@launch
   repo.saveTable(t.copy(active=false))
   audit("TABLE",t.id,"HIDE",t.name)
   autoBackup();autoMasterConfig()
  }
 }
 fun canConfigureQr():Boolean{val r=currentEmployee.value?.role?:return false;return r=="ADMIN"||r=="MANAGER"}
 private fun canManageMenu():Boolean{val e=currentEmployee.value?:return false;return e.role=="ADMIN"||e.canManageMenu}
 fun saveMenu(name:String,price:Long,cat:String,description:String="",imageUri:String?=null,active:Boolean=true){
  if(!canManageMenu())return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val id=UUID.randomUUID().toString()
   val existing=dao.allMenuSnapshot()
   val categoryName=categories.value.firstOrNull{it.id==cat}?.name.orEmpty()
   val sameCategoryPrefix=existing.firstOrNull{it.categoryId==cat&&it.productCode.isNotBlank()}?.productCode?.substringBefore('-')
   val occupiedByOther=existing.filter{it.categoryId!=cat}.map{it.productCode.substringBefore('-')}.filter{it.isNotBlank()}.toSet()
   val root=ProductCodes.basePrefix(categoryName);var prefix=sameCategoryPrefix?:root;var suffix=2
   while(sameCategoryPrefix==null&&prefix in occupiedByOther)prefix="$root${suffix++}"
   val used=dao.allProductCodes().toSet();var seq=1;var code:String
   do{code="$prefix-${seq.toString().padStart(3,'0')}";seq++}while(code in used)
   val managed=runCatching{ManagedMedia.importImage(getApplication(),imageUri,"menu_"+id)}.getOrNull()
   repo.saveMenuItem(MenuItemEntity(id,cat,name.trim(),price,managed,menu.value.size+1,active,code,description.trim()))
   audit("MENU",id,"CREATE","$code | ${name.trim()} | price=$price | category=$categoryName");autoBackup();autoBackupMedia();scheduleMediaUpload();autoMasterConfig();publishCatalogChange()
  }
 }
 /** Sửa mã món: chữ in hoa, số và gạch ngang, không trùng món khác. */
 fun updateMenuCode(original:MenuItemEntity,raw:String,onDone:(String?)->Unit){
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   fun done(m:String?){viewModelScope.launch(kotlinx.coroutines.Dispatchers.Main){onDone(m)}}
   if(!canManageMenu()){done("Không có quyền sửa menu");return@launch}
   val code=raw.trim().uppercase()
   if(!Regex("^[A-Z0-9]+(-[A-Z0-9]+)*$").matches(code)||code.length>20){done("Mã chỉ gồm chữ in hoa, số và gạch ngang, tối đa 20 ký tự (VD: AS-016)");return@launch}
   if(code==original.productCode){done(null);return@launch}
   if(dao.allMenuSnapshot().any{it.id!=original.id&&it.productCode.equals(code,true)}){done("Mã $code đã có món khác dùng");return@launch}
   runCatching{repo.saveMenuItem(original.copy(productCode=code))}.onFailure{done("Không lưu được mã: ${it.message}");return@launch}
   audit("MENU",original.id,"CODE_CHANGED","${original.productCode}->$code | ${original.name} | actor:${currentEmployee.value?.id}")
   autoBackup();autoMasterConfig();publishCatalogChange()
   done(null)
  }
 }
 /** Xoá hẳn món rác chưa từng bán. Món đã bán chỉ được tạm ngưng để giữ lịch sử. */
 fun deleteMenuPermanently(m:MenuItemEntity,onDone:(String?)->Unit){
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   fun done(x:String?){viewModelScope.launch(kotlinx.coroutines.Dispatchers.Main){onDone(x)}}
   if(currentEmployee.value?.role!="ADMIN"){done("Chỉ ADMIN được xoá hẳn món");return@launch}
   val sold=dao.orderCountForMenuItem(m.id)
   if(sold>0){done("Món đã bán $sold lần nên không xoá hẳn được, chỉ tạm ngưng để giữ lịch sử");return@launch}
   if(!repo.deleteUnusedMenuItem(m.id)){done("Món đang nằm trong combo hoặc khuyến mãi mua-tặng, gỡ ra trước rồi xoá");return@launch}
   audit("MENU",m.id,"DELETED","${m.productCode} | ${m.name} | price=${m.price} | actor:${currentEmployee.value?.id}")
   autoBackup();autoMasterConfig();publishCatalogChange()
   done(null)
  }
 }
 fun updateMenu(original:MenuItemEntity,name:String,price:Long,cat:String,description:String,imageUri:String?,active:Boolean){
  if(!canManageMenu())return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val managed=if(imageUri==original.imageUri)original.imageUri else runCatching{ManagedMedia.importImage(getApplication(),imageUri,"menu_"+original.id)}.getOrNull()
   val updated=original.copy(categoryId=cat,name=name.trim(),price=price,description=description.trim(),imageUri=managed,active=active)
   repo.saveMenuItem(updated)
   val oldCat=categories.value.firstOrNull{it.id==original.categoryId}?.name.orEmpty();val newCat=categories.value.firstOrNull{it.id==cat}?.name.orEmpty()
   audit("MENU",original.id,"UPDATE","${original.productCode} | name:${original.name}->${updated.name} | price:${original.price}->${updated.price} | category:$oldCat->$newCat | active:${original.active}->${updated.active} | actor:${currentEmployee.value?.id}")
   autoBackup();autoBackupMedia();scheduleMediaUpload();autoMasterConfig();publishCatalogChange()
  }
 }
 fun setMenuImage(i:MenuItemEntity,uri:String?){
  if(!canManageMenu())return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val managed=runCatching{ManagedMedia.importImage(getApplication(),uri,"menu_"+i.id)}.getOrNull()
   repo.saveMenuItem(i.copy(imageUri=managed))
   audit("MENU",i.id,"IMAGE");autoBackup();autoBackupMedia();scheduleMediaUpload();autoMasterConfig();publishCatalogChange()
  }
 }
 fun toggleMenu(i:MenuItemEntity){if(!canManageMenu())return;viewModelScope.launch{dao.setMenuActive(i.id,!i.active);queueCatalogChange("MENU_ITEM",i.id);audit("MENU",i.id,"ACTIVE",(!i.active).toString());autoBackup();autoMasterConfig();publishCatalogChange()}}
 fun deleteMenu(i:MenuItemEntity){if(!canManageMenu())return;viewModelScope.launch{dao.setMenuActive(i.id,false);queueCatalogChange("MENU_ITEM",i.id);audit("MENU",i.id,"DELETE_SOFT",i.name);autoBackup();autoMasterConfig();publishCatalogChange()}}
 fun addCategory(name:String){if(!canManageMenu()||name.isBlank())return;viewModelScope.launch{val id=UUID.randomUUID().toString();repo.saveCategory(MenuCategoryEntity(id,name.trim(),categories.value.size+1,true));queueCatalogChange("MENU_CATEGORY",id);audit("CATEGORY",id,"CREATE",name.trim());autoBackup();autoMasterConfig();publishCatalogChange()}}
 fun deleteCategory(c:MenuCategoryEntity){
  if(!canManageMenu())return
  viewModelScope.launch{
   if(menu.value.any{it.active&&it.categoryId==c.id})return@launch
   dao.setCategoryActive(c.id,false)
   queueCatalogChange("MENU_CATEGORY",c.id)
   audit("CATEGORY",c.id,"DELETE_SOFT",c.name)
   autoBackup();autoMasterConfig();publishCatalogChange()
  }
 }
 fun saveEmployee(name:String,pin:String,role:String,checkout:Boolean,purchase:Boolean,order:Boolean=true,kitchen:Boolean=true,report:Boolean=false,menu:Boolean=false,system:Boolean=false){if(currentEmployee.value?.role!="ADMIN")return;viewModelScope.launch{val id=UUID.randomUUID().toString();repo.saveEmployee(EmployeeEntity(id,name,true,pin,role,checkout,purchase,order,kitchen,report,menu,system));audit("EMPLOYEE",id,"CREATE",name);autoBackup();autoMasterConfig()}}
 fun updateEmployee(e:EmployeeEntity){if(currentEmployee.value?.role!="ADMIN")return;viewModelScope.launch{repo.saveEmployee(e);audit("EMPLOYEE",e.id,"UPDATE");autoBackup();autoMasterConfig()}};fun toggleEmployee(e:EmployeeEntity){if(currentEmployee.value?.role!="ADMIN"||e.id==currentEmployee.value?.id)return;viewModelScope.launch{dao.setEmployeeActive(e.id,!e.active);audit("EMPLOYEE",e.id,if(e.active)"DISABLE" else "ENABLE");autoBackup();autoMasterConfig()}}
 fun saveSupplier(name:String){val e=currentEmployee.value?:return;if(!e.canPurchase&&e.role!="ADMIN")return;if(name.isBlank())return;viewModelScope.launch{val id=UUID.randomUUID().toString();repo.saveSupplier(SupplierEntity(id,name.trim()));audit("SUPPLIER",id,"CREATE",name.trim());autoBackup()}}
 fun addPurchaseCategory(name:String,defaultUnit:String){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"&&e.role!="MANAGER")return
  if(name.isBlank())return
  viewModelScope.launch{
   val id=UUID.randomUUID().toString()
   repo.savePurchaseCategory(PurchaseCategoryEntity(id,name.trim(),defaultUnit.trim().ifBlank{"lần"},purchaseCategories.value.size+1,true))
   audit("PURCHASE_CATEGORY",id,"CREATE",name.trim())
   autoBackup();autoMasterConfig()
  }
 }
 fun deletePurchaseCategory(c:PurchaseCategoryEntity){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"&&e.role!="MANAGER")return
  viewModelScope.launch{
   val used=purchases.value.any { p -> dao.purchaseItems(p.id).first().any { it.categoryId==c.id } }
   if(used)return@launch
   dao.setPurchaseCategoryActive(c.id,false)
   audit("PURCHASE_CATEGORY",c.id,"DELETE_SOFT",c.name)
   autoBackup();autoMasterConfig()
  }
 };
 fun saveCombo(name:String,price:Long,description:String,imageUri:String?,items:Map<String,Int>,initial:ComboEntity?=null){
  val e=currentEmployee.value?:return
  if((e.role!="ADMIN"&&!e.canManageMenu)||name.isBlank()||price<=0||items.isEmpty())return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val id=initial?.id?:UUID.randomUUID().toString()
   val managed=if(imageUri==initial?.imageUri) initial?.imageUri else runCatching{ManagedMedia.importImage(getApplication(),imageUri,"combo_"+id)}.getOrNull()
   val cleanItems=items.filterValues{it>0}
   db.withTransaction {
    dao.saveCombo(ComboEntity(id,name.trim(),price,managed,initial?.sortOrder?:combos.value.size+1,initial?.active?:true,description.trim()))
    val queueNow=System.currentTimeMillis()
    dao.enqueueSync(SyncQueueEntity(UUID.randomUUID().toString(),"COMBO",id,"UPSERT","",queueNow,queueNow))
    if(!managed.isNullOrBlank()) dao.enqueueSync(SyncQueueEntity(UUID.randomUUID().toString(),"MEDIA","combo_"+id,"UPSERT",managed,queueNow,queueNow))
    if(initial!=null)dao.deleteComboItems(id)
    cleanItems.forEach{(menuItemId,qty)->
     dao.saveComboItem(ComboItemEntity(UUID.randomUUID().toString(),id,menuItemId,qty))
    }
   }
   val action=if(initial==null)"CREATE" else "UPDATE"
   val before=initial?.let{"name=${it.name},price=${it.price},description=${it.description}"}.orEmpty()
   audit("COMBO",id,action,"$before -> name=${name.trim()},price=$price,description=${description.trim()},items=${cleanItems.size}")
   autoBackup();autoBackupMedia();scheduleMediaUpload();autoMasterConfig()
  }
 }
 fun toggleCombo(combo:ComboEntity){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"&&!e.canManageMenu)return
  viewModelScope.launch{dao.setComboActive(combo.id,!combo.active);audit("COMBO",combo.id,"ACTIVE",(!combo.active).toString());autoBackup();autoMasterConfig()}
 }
 fun savePricingRule(name:String,code:String,kind:String,percent:Int,startAt:Long?,endAt:Long?,startMinute:Int?,endMinute:Int?,autoApply:Boolean){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"||name.isBlank()||percent<=0)return
  viewModelScope.launch{
   val id=UUID.randomUUID().toString()
   dao.savePricingRule(PricingRuleEntity(id,name.trim(),code.trim().uppercase(),kind,percent.coerceIn(1,100),startAt,endAt,startMinute,endMinute,autoApply,true))
   audit("PRICING",id,"CREATE","name=${name.trim()},kind=$kind,percent=$percent,code=${code.trim().uppercase()}")
   autoBackup();autoMasterConfig()
  }
 }
 fun updatePricingRule(rule:PricingRuleEntity,name:String,code:String,kind:String,percent:Int,startAt:Long?,endAt:Long?,startMinute:Int?,endMinute:Int?,autoApply:Boolean){val e=currentEmployee.value?:return;if(e.role!="ADMIN"||name.isBlank()||percent !in 1..100||(startAt!=null&&endAt!=null&&endAt<startAt))return;viewModelScope.launch{dao.savePricingRule(rule.copy(name=name.trim(),code=code.trim().uppercase(),kind=kind,percent=percent,startAt=startAt,endAt=endAt,startMinute=startMinute,endMinute=endMinute,autoApply=autoApply));audit("PRICING",rule.id,"UPDATE","name=$name,percent=$percent");autoBackup();autoMasterConfig()}}
 fun togglePricingRule(rule:PricingRuleEntity){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN")return
  viewModelScope.launch{dao.setPricingRuleActive(rule.id,!rule.active);audit("PRICING",rule.id,"ACTIVE",(!rule.active).toString());autoBackup();autoMasterConfig()}
 }
 fun deletePricingRule(rule:PricingRuleEntity){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN")return
  viewModelScope.launch{
   dao.setPricingRuleActive(rule.id,false)
   audit("PRICING",rule.id,"DELETE_SOFT","pricing_rule_archived")
   autoBackup();autoMasterConfig()
  }
 }
 fun saveBuyGetPromotion(name:String,buyMenuItemId:String,buyQuantity:Int,giftMenuItemId:String,giftQuantity:Int,repeat:Boolean,startAt:Long?,endAt:Long?){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"||name.isBlank()||buyMenuItemId.isBlank()||giftMenuItemId.isBlank()||buyQuantity !in 1..1000||giftQuantity !in 1..1000||(startAt!=null&&endAt!=null&&endAt<startAt))return
  viewModelScope.launch(Dispatchers.IO){
   val now=System.currentTimeMillis();val id=UUID.randomUUID().toString()
   dao.saveBuyGetPromotion(BuyGetPromotionEntity(id,name.trim(),buyMenuItemId,buyQuantity,giftMenuItemId,giftQuantity,repeat,true,startAt,endAt,now,now))
   audit("BUY_GET",id,"CREATE","buy=$buyMenuItemId x$buyQuantity,gift=$giftMenuItemId x$giftQuantity,repeat=$repeat")
   autoBackup();autoMasterConfig()
  }
 }
 fun toggleBuyGetPromotion(rule:BuyGetPromotionEntity){
  val e=currentEmployee.value?:return;if(e.role!="ADMIN")return
  viewModelScope.launch(Dispatchers.IO){dao.setBuyGetPromotionActive(rule.id,!rule.active,System.currentTimeMillis());audit("BUY_GET",rule.id,"ACTIVE",(!rule.active).toString());autoBackup();autoMasterConfig()}
 }
fun saveLoyaltyCampaign(campaign:LoyaltyCampaignEntity){
 val e=currentEmployee.value?:return
 if(e.role!="ADMIN"){viewModelScope.launch{audit("SECURITY","LOYALTY_CAMPAIGN","DENIED","role=${e.role}")};return}
 if(!LoyaltyCampaignPolicy.isValid(campaign.triggerType,campaign.threshold,campaign.expiresDays)){printerMessage.value="ĐIỀU KIỆN TÍCH LŨY HOẶC HẠN QUÀ KHÔNG HỢP LỆ";return}
 if(campaign.triggerType!="POINTS"||campaign.threshold !in 1L..1000000L||campaign.cycleMode!="ONCE"||!((campaign.rewardType=="BILL_DISCOUNT"&&campaign.rewardValue in 1L..10000000L)||(campaign.rewardType=="BILL_DISCOUNT_PERCENT"&&campaign.rewardValue in 1L..100L))){printerMessage.value="ĐIỀU KIỆN GIẢM GIÁ KHÔNG HỢP LỆ";return}
 viewModelScope.launch(Dispatchers.IO){
  val now=System.currentTimeMillis()
  val fixed=campaign.copy(name=campaign.name.trim(),rewardMenuItemId=null,updatedAt=now,createdAt=if(campaign.createdAt<=0)now else campaign.createdAt)
  dao.upsertLoyaltyCampaign(fixed)
  dao.enqueueSync(SyncQueueEntity(UUID.randomUUID().toString(),"LOYALTY_CAMPAIGN",fixed.id,"UPSERT","",now,now))
  audit("LOYALTY",fixed.id,"CAMPAIGN_SAVE","trigger=${fixed.triggerType},threshold=${fixed.threshold},reward=${fixed.rewardType}:${fixed.rewardValue},active=${fixed.active}")
  autoBackup();autoMasterConfig()
  printerMessage.value="ĐÃ LƯU CHƯƠNG TRÌNH TÍCH LŨY"
 }
}
fun toggleLoyaltyCampaign(campaign:LoyaltyCampaignEntity){
 val e=currentEmployee.value?:return
 if(e.role!="ADMIN")return
 viewModelScope.launch(Dispatchers.IO){
  if(campaign.rewardType !in listOf("BILL_DISCOUNT","BILL_DISCOUNT_PERCENT")){printerMessage.value="CHƯƠNG TRÌNH VOUCHER/QUÀ ĐÃ TẠM KHÓA";return@launch}
  val now=System.currentTimeMillis();val active=!campaign.active
  dao.setLoyaltyCampaignActive(campaign.id,active,now)
  dao.enqueueSync(SyncQueueEntity(UUID.randomUUID().toString(),"LOYALTY_CAMPAIGN",campaign.id,"UPSERT","",now,now))
  audit("LOYALTY",campaign.id,"CAMPAIGN_ACTIVE",active.toString());autoBackup();autoMasterConfig()
 }
}
fun savePointEarningRate(text:String){
 val e=currentEmployee.value?:return
 if(e.role!="ADMIN")return
 val amount=text.toLongOrNull()
 if(amount==null||amount !in 1000L..10000000L){printerMessage.value="SỐ TIỀN/ĐIỂM PHẢI TỪ 1.000 ĐẾN 10.000.000Đ";return}
 viewModelScope.launch(Dispatchers.IO){
  dao.saveSetting(AppSettingEntity("loyalty_vnd_per_point",amount.toString()))
  audit("LOYALTY","POINT_RATE","SAVE","vnd_per_point=$amount")
  autoBackup();autoMasterConfig()
  printerMessage.value="ĐÃ LƯU QUY TẮC TÍCH ĐIỂM"
 }
}
fun saveLoyaltyConfig(auto:Boolean,memberDiscount:Int,vipPoints:Int,vipDiscount:Int,vvipPoints:Int,vvipDiscount:Int){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN")return
  viewModelScope.launch{
   val safeVip=vipPoints.coerceAtLeast(0)
   val safeVvip=vvipPoints.coerceAtLeast(safeVip)
   dao.saveSetting(AppSettingEntity("loyalty_auto_tier",auto.toString()))
   dao.saveSetting(AppSettingEntity("member_discount_percent",memberDiscount.coerceIn(0,100).toString()))
   dao.saveSetting(AppSettingEntity("vip_min_points",safeVip.toString()))
   dao.saveSetting(AppSettingEntity("vip_discount_percent",vipDiscount.coerceIn(0,100).toString()))
   dao.saveSetting(AppSettingEntity("vvip_min_points",safeVvip.toString()))
   dao.saveSetting(AppSettingEntity("vvip_discount_percent",vvipDiscount.coerceIn(0,100).toString()))
   if(auto){
    customers.value.filter{!it.tierManual}.forEach{cu->
     val tier=when{
      cu.points>=safeVvip -> "VVIP"
      cu.points>=safeVip -> "VIP"
      else -> "MEMBER"
     }
     if(tier!=cu.tier)dao.updateCustomerTierFields(cu.id,tier,false)
    }
   }
   audit("LOYALTY","CONFIG","SAVE","auto=$auto,vip=$safeVip,vvip=$safeVvip")
   autoBackup();autoMasterConfig()
  }
 }
fun savePayrollConfig(defaultRateText:String,employeeRates:Map<String,String>){
 val e=currentEmployee.value?:return
 if(e.role!="ADMIN"&&e.role!="MANAGER"){viewModelScope.launch{audit("SECURITY","PAYROLL_CONFIG","DENIED","role=${e.role}")};return}
 val defaultRate=defaultRateText.trim().toLongOrNull()
 if(defaultRate !in 1_000L..1_000_000L){printerMessage.value="ĐƠN GIÁ GIỜ MẶC ĐỊNH PHẢI TỪ 1.000Đ ĐẾN 1.000.000Đ";return}
 val allowedEmployees=employees.value.map{it.id}.toSet()
 if(employeeRates.any{(id,value)->id !in allowedEmployees||(value.isNotBlank()&&value.trim().toLongOrNull() !in 1_000L..1_000_000L)}){
  printerMessage.value="ĐƠN GIÁ RIÊNG KHÔNG HỢP LỆ";return
 }
 viewModelScope.launch(Dispatchers.IO){
  db.withTransaction{
   dao.saveSetting(AppSettingEntity("hourly_rate_default",defaultRate.toString()))
   allowedEmployees.forEach{id->dao.saveSetting(AppSettingEntity("hourly_rate_"+id,employeeRates[id].orEmpty().trim()))}
  }
  audit("PAYROLL","CONFIG","SAVE","defaultRate=$defaultRate,operator=${e.id}")
  autoBackup();autoMasterConfig()
  printerMessage.value="ĐÃ LƯU ĐƠN GIÁ CÔNG / GIỜ"
 }
}
fun saveHolidayMultiplier(localDate:String,multiplierText:String){
 val e=currentEmployee.value?:return
 if(e.role!="ADMIN"&&e.role!="MANAGER"){viewModelScope.launch{audit("SECURITY","PAYROLL_DATE_MULTIPLIER","DENIED","role=${e.role}")};return}
 val normalized=multiplierText.trim().replace(',','.')
 val multiplier=HolidayMultiplier.basisPoints(normalized)
 val format=SimpleDateFormat("yyyy-MM-dd",Locale.US).apply{isLenient=false}
 val validDate=runCatching{format.parse(localDate)}.isSuccess
 val validMultiplier=normalized.matches(Regex("""\\d+(\\.\\d{1,4})?"""))&&multiplier in 5_000..30_000
 if(!validDate||!validMultiplier){printerMessage.value="K PHẢI TỪ 0.5 ĐẾN 3.0";return}
 viewModelScope.launch(Dispatchers.IO){
  dao.saveSetting(AppSettingEntity(HolidayMultiplier.settingKey(localDate),multiplier.toString()))
  audit("PAYROLL",localDate,"DATE_MULTIPLIER_SAVE","multiplierBp=$multiplier,operator=${e.id}")
  autoBackup();autoMasterConfig()
  printerMessage.value="ĐÃ LƯU HỆ SỐ K NGÀY $localDate"
 }
}
fun saveHolidayMultipliers(localDates:Set<String>,multiplierText:String){
 val e=currentEmployee.value?:return
 if(e.role!="ADMIN"&&e.role!="MANAGER"){viewModelScope.launch{audit("SECURITY","PAYROLL_DATE_MULTIPLIER","DENIED","role=${e.role}")};return}
 val normalized=multiplierText.trim().replace(',','.')
 val multiplier=HolidayMultiplier.basisPoints(normalized)
 val format=SimpleDateFormat("yyyy-MM-dd",Locale.US).apply{isLenient=false}
 val dates=localDates.map{it.trim()}.filter{it.isNotBlank()}.toSortedSet()
 val validMultiplier=normalized.matches(Regex("""\d+(\.\d{1,4})?"""))&&multiplier in 5_000..30_000
 if(dates.isEmpty()||dates.any{runCatching{format.parse(it)}.isFailure}||!validMultiplier){printerMessage.value="K PHẢI TỪ 0.5 ĐẾN 3.0 VÀ PHẢI CHỌN NGÀY";return}
 viewModelScope.launch(Dispatchers.IO){
  db.withTransaction{dates.forEach{date->dao.saveSetting(AppSettingEntity(HolidayMultiplier.settingKey(date),multiplier.toString()))}}
  audit("PAYROLL",dates.joinToString(","),"DATE_MULTIPLIER_BATCH_SAVE","multiplierBp=$multiplier,count=${dates.size},operator=${e.id}")
  autoBackup();autoMasterConfig()
  printerMessage.value="ĐÃ LƯU K = $normalized CHO ${dates.size} NGÀY: ${dates.joinToString(", ")}"
 }
}
fun clearHolidayMultiplier(localDate:String){
 val e=currentEmployee.value?:return
 if(e.role!="ADMIN"&&e.role!="MANAGER"){viewModelScope.launch{audit("SECURITY","PAYROLL_DATE_MULTIPLIER","DENIED","role=${e.role}")};return}
 viewModelScope.launch(Dispatchers.IO){
  dao.saveSetting(AppSettingEntity(HolidayMultiplier.settingKey(localDate),""))
  audit("PAYROLL",localDate,"DATE_MULTIPLIER_CLEAR","operator=${e.id}")
  autoBackup();autoMasterConfig()
  printerMessage.value="ĐÃ XÓA HỆ SỐ K NGÀY $localDate"
 }
}
fun saveSetting(key:String,value:String){
 val e=currentEmployee.value?:return
 val allowed=when(key){
  "storage_root_uri","master_config_uri","autoback_tree_uri" -> e.role=="ADMIN"||e.canManageSystem
  "bank_name","bank_account","bank_holder","qr_prefix","payment_qr_mode","printer_mode","printer_mac","printer_name","kitchen_printer_mac","kitchen_printer_name","receipt_printer_mac","receipt_printer_name","printer_paper_mm","bank_notification_enabled","bank_notification_vibrate","bank_notification_tts","delivery_remind_on","delivery_remind_min","delivery_remind_repeat_min","delivery_remind_voice" -> e.role=="ADMIN"||e.role=="MANAGER"
  else -> e.role=="ADMIN"
 }
 if(!allowed){viewModelScope.launch{audit("SECURITY",key,"SETTING_DENIED","role=${e.role}")};return}
 viewModelScope.launch{
  dao.saveSetting(AppSettingEntity(key,value))
  val safePayload=if(key=="bank_account")"updated" else value.take(120)
  audit("SETTING",key,"SAVE",safePayload)
  if(key!="master_config_uri"&&key!="autoback_tree_uri"&&key!="storage_root_uri")autoMasterConfig()
 }
}
fun configureFirebase(projectId:String,applicationId:String,apiKey:String){
 val e=currentEmployee.value?:return;if(e.role!="ADMIN"||projectId.isBlank()||applicationId.isBlank()||apiKey.isBlank())return
 viewModelScope.launch(Dispatchers.IO){
  val pid=projectId.trim();val aid=applicationId.trim();val key=apiKey.trim()
  val currentSettings=dao.allSettingsSnapshot().associate{it.key to it.value}
  val unchanged=currentSettings["firebase_project_id"]==pid&&currentSettings["firebase_application_id"]==aid&&currentSettings["firebase_api_key"]==key
  if(unchanged){
   cloudMessage.value="Cấu hình Firebase không đổi · giữ nguyên phiên đăng nhập"
   return@launch
  }
  db.withTransaction{
   dao.saveSetting(AppSettingEntity("firebase_project_id",pid))
   dao.saveSetting(AppSettingEntity("firebase_application_id",aid))
   dao.saveSetting(AppSettingEntity("firebase_api_key",key))
   dao.saveCloudSyncState((dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity()).copy(enabled=false,dirty=true,lastError=null,syncedUid=null))
  }
  FirebaseCloudSync.reset(getApplication())
  cloudMessage.value="Đã đổi cấu hình Firebase · cần đăng nhập lại"
  audit("CLOUD","FIREBASE","CONFIGURE","project=$pid")
 }
}
fun firebaseSignIn(email:String,password:String){
 val e=currentEmployee.value?:return;if(e.role!="ADMIN"||email.isBlank()||password.isBlank())return
 viewModelScope.launch(Dispatchers.IO){runCatching{FirebaseCloudSync.signIn(getApplication(),email,password)}.onSuccess{uid->dao.saveSetting(AppSettingEntity("firebase_email",email.trim()));dao.saveCloudSyncState((dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity()).copy(enabled=true,dirty=true,lastError=null,syncedUid=uid));firebaseSessionMissing.value=false;FirebaseCloudSync.schedule(getApplication());cloudMessage.value="Đăng nhập Firebase thành công";syncFirebase();observeCloudDashboard()}.onFailure{cloudMessage.value="Đăng nhập lỗi: ${it.message}"}}
}
fun firebaseSignOut(){FirebaseCloudSync.signOut(getApplication());firebaseSessionMissing.value=false;viewModelScope.launch(Dispatchers.IO){dao.saveCloudSyncState((dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity()).copy(enabled=false,syncedUid=null));cloudMessage.value="Đã đăng xuất Firebase"};cloudDashboardJob?.cancel()}
private var manualCloudJob:Job?=null
fun syncFirebase(){
 if(manualCloudJob?.isActive==true)return
 manualCloudJob=viewModelScope.launch(Dispatchers.IO){
  cloudMessage.value="Đang đồng bộ · các bước hiển thị bên dưới…"
  FirebaseCloudSync.syncNow(getApplication())
   .onSuccess{cloudMessage.value="Dữ liệu realtime đã được server xác nhận · backup và ảnh chạy riêng"}
   .onFailure{if(it.message?.contains("AUTH_SESSION_MISSING")==true)firebaseSessionMissing.value=true;cloudMessage.value=if(it.message?.contains("MUTEX_BUSY")==true)"Tác vụ Cloud khác đang chạy · lần bấm này chưa bắt đầu; theo dõi các bước bên dưới" else "Đồng bộ chưa hoàn tất: ${it.message} · giữ dữ liệu và hàng đợi local"}
 }
}
/** Một lần: đẩy lại toàn bộ nhóm món + món (chỉ đọc menu trên máy, ghi bản sao lên Cloud) rồi đẩy ảnh + ảnh nhỏ cho web. */
fun syncFullMenuToWeb(){val e=currentEmployee.value?:return;if(e.role!="ADMIN")return;viewModelScope.launch(Dispatchers.IO){runCatching{
  val uid=FirebaseCloudSync.currentUid(getApplication())?:error("Chưa đăng nhập Firebase")
  val fs=com.google.firebase.firestore.FirebaseFirestore.getInstance(FirebaseCloudSync.firebaseApp(getApplication(),FirebaseCloudSync.config(getApplication())))
  if(FirebaseCloudSync.cloudMenuNewer(getApplication(),fs,uid)){cloudMessage.value="Menu trên web mới hơn máy: bấm ĐỒNG BỘ REALTIME NGAY để kéo về trước, rồi mới đẩy.";return@launch}
  val cats=dao.allCategoriesSnapshot();val items=dao.allMenuSnapshot()
  cats.forEach{queueCatalogChange("MENU_CATEGORY",it.id)};items.forEach{queueCatalogChange("MENU_ITEM",it.id)}
  audit("MENU","ALL","CLOUD_FULL_SYNC","categories=${cats.size} items=${items.size} | actor:${e.id}")
  publishCatalogChange()
  cloudMessage.value="Đã xếp ${cats.size} nhóm, ${items.size} món để đẩy lên web · đang đẩy ảnh…"
 }.onFailure{cloudMessage.value="Lỗi đồng bộ menu: ${it.message}"};transferCloudMedia(true)}}
fun transferCloudMedia(upload:Boolean){val e=currentEmployee.value?:return;if(e.role!="ADMIN")return;viewModelScope.launch(Dispatchers.IO){cloudMessage.value=if(upload)"Đang đẩy ảnh lên Cloud…" else "Đang tải ảnh từ Cloud…";runCatching{val uid=FirebaseCloudSync.currentUid(getApplication())?:error("Chưa đăng nhập Firebase");val cfg=FirebaseCloudSync.config(getApplication());val app=FirebaseCloudSync.firebaseApp(getApplication(),cfg);val fs=com.google.firebase.firestore.FirebaseFirestore.getInstance(app);val r=if(upload)CloudMediaSync.uploadLocal(getApplication(),fs,uid) else CloudMediaSync.restoreMissing(getApplication(),fs,uid);val count=CloudMediaSync.cloudManifestCount(getApplication(),fs,uid);cloudMessage.value="Media: upload ${r.uploaded} · tải ${r.downloaded} · bỏ qua ${r.skipped} · lỗi ${r.errors} · Cloud ${count} file"+(r.firstError?.let{" · Lỗi đầu: $it"}?:"")}.onFailure{cloudMessage.value="Lỗi Media: ${it.message}"}}}
fun reconcileFirebaseSession(){
 viewModelScope.launch(Dispatchers.IO){
  // Initialize the named FirebaseApp before reading its persisted Auth session.
  // A cold start otherwise reports null and incorrectly erases the stored UID.
  val actualUid=runCatching{val cfg=FirebaseCloudSync.config(getApplication());FirebaseCloudSync.firebaseApp(getApplication(),cfg);FirebaseCloudSync.currentUid(getApplication())}.getOrNull()
  val saved=dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity()
  firebaseSessionMissing.value=actualUid==null&&saved.syncedUid!=null
  when{
   actualUid==null&&saved.syncedUid!=null->dao.saveCloudSyncState(saved.copy(lastError="Phiên Firebase chưa sẵn sàng · kiểm tra đăng nhập, giữ nguyên UID đã lưu"))
   actualUid!=null&&saved.syncedUid!=null&&saved.syncedUid!=actualUid->dao.saveCloudSyncState(saved.copy(lastError="AUTH_UID_MISMATCH · giữ nguyên UID đã lưu, không đồng bộ"))
  }
  if(actualUid!=null)FirebaseCloudSync.schedule(getApplication())
  if(actualUid!=null)runCatching{vn.ecohome.pos0210.cloud.ShiftAlerts.start(getApplication())}
  recoverMediaOnce(actualUid)
 }
}
private var mediaRecoveryTried=false
private var mediaUploadJob:Job?=null
private fun mediaReadable(uri:String?):Boolean{
 if(uri.isNullOrBlank())return false
 val parsed=android.net.Uri.parse(uri)
 return when(parsed.scheme){
  "file"->parsed.path?.let{java.io.File(it).exists()}==true
  "content"->runCatching{getApplication<Application>().contentResolver.openInputStream(parsed)?.use{true}?:false}.getOrDefault(false)
  else->false
 }
}
private suspend fun hasMissingMenuImages():Boolean=dao.allMenuSnapshot().any{it.active&&!mediaReadable(it.imageUri)}||dao.allCombosSnapshot().any{it.active&&!mediaReadable(it.imageUri)}
/** DB trỏ tới đường dẫn ảnh không còn đọc được nhưng file cùng món vẫn nằm trong managed_media thì gắn lại. */
private suspend fun relinkManagedImages(){
 val dir=java.io.File(getApplication<Application>().filesDir,"managed_media")
 val files=dir.listFiles()?.filter{it.isFile&&it.length()>0}.orEmpty()
 if(files.isEmpty())return
 fun find(prefix:String,id:String)=files.filter{it.name==prefix+"_"+id+".jpg"||it.name.startsWith(prefix+"_"+id+"_")}.maxByOrNull{it.lastModified()}
 dao.allMenuSnapshot().forEach{m->if(!mediaReadable(m.imageUri))find("menu",m.id)?.let{dao.updateMenuImage(m.id,android.net.Uri.fromFile(it).toString())}}
 dao.allCombosSnapshot().forEach{c->if(!mediaReadable(c.imageUri))find("combo",c.id)?.let{dao.updateComboImage(c.id,android.net.Uri.fromFile(it).toString())}}
}
/**
 * Mỗi lần mở app: nếu thiếu file ảnh món/combo thì tự lấy lại, theo thứ tự (1) MEDIA_LATEST trong thư mục POS0210, (2) Cloud.
 * Sau đó đẩy ảnh đã đổi lên Cloud. Chỉ thêm file ảnh và gắn lại đường dẫn, không sửa menu, bill hay dữ liệu bán hàng.
 */
private suspend fun recoverMediaOnce(uid:String?){
 if(mediaRecoveryTried)return
 mediaRecoveryTried=true
 runCatching{
  if(hasMissingMenuImages()){
   val root=dao.allSettingsSnapshot().firstOrNull{it.key=="storage_root_uri"}?.value.orEmpty()
   if(root.isNotBlank()){
    val restored=DataBackup.restoreMediaMissingOnly(getApplication(),root).getOrDefault(0)
    if(restored>0)audit("MEDIA","saf","AUTO_RESTORE_SAF","files=$restored")
    relinkManagedImages()
   }
  }
  if(uid!=null&&hasMissingMenuImages()){
   val cfg=FirebaseCloudSync.config(getApplication())
   val fs=com.google.firebase.firestore.FirebaseFirestore.getInstance(FirebaseCloudSync.firebaseApp(getApplication(),cfg))
   val r=CloudMediaSync.restoreMissing(getApplication(),fs,uid)
   if(r.downloaded>0)audit("MEDIA",uid,"AUTO_RESTORE_CLOUD","downloaded=${r.downloaded},errors=${r.errors}")
   relinkManagedImages()
  }
 }
 if(uid!=null)uploadMediaToCloud(uid,0L)
}
private suspend fun uploadMediaToCloud(uid:String,delayMs:Long){
 kotlinx.coroutines.delay(delayMs)
 runCatching{
  val cfg=FirebaseCloudSync.config(getApplication())
  val fs=com.google.firebase.firestore.FirebaseFirestore.getInstance(FirebaseCloudSync.firebaseApp(getApplication(),cfg))
  val r=CloudMediaSync.uploadLocal(getApplication(),fs,uid)
  if(r.uploaded>0)audit("MEDIA",uid,"AUTO_UPLOAD","uploaded=${r.uploaded},errors=${r.errors}")
 }
}
/** Menu/combo đổi ảnh: gom 5 giây rồi ghi đè ảnh lên Cloud (ảnh không đổi thì bỏ qua). Mất mạng thì lần mở app sau sẽ đẩy bù. */
/** Nút "Chỉ khôi phục ảnh món": lấy lại ảnh còn thiếu từ POS0210 rồi từ Cloud, gắn lại vào menu. Không đụng bill, order hay cài đặt. */
fun recoverMediaManually(onDone:(String)->Unit){
 viewModelScope.launch(Dispatchers.IO){
  val text=runCatching{
   val root=dao.allSettingsSnapshot().firstOrNull{it.key=="storage_root_uri"}?.value.orEmpty()
   val saf=if(root.isNotBlank())DataBackup.restoreMediaMissingOnly(getApplication(),root).getOrDefault(0) else 0
   relinkManagedImages()
   var cloud=0
   val uid=runCatching{FirebaseCloudSync.currentUid(getApplication())}.getOrNull()
   if(uid!=null&&hasMissingMenuImages()){
    val cfg=FirebaseCloudSync.config(getApplication())
    val fs=com.google.firebase.firestore.FirebaseFirestore.getInstance(FirebaseCloudSync.firebaseApp(getApplication(),cfg))
    cloud=CloudMediaSync.restoreMissing(getApplication(),fs,uid).downloaded
    relinkManagedImages()
   }
   val missing=dao.allMenuSnapshot().count{it.active&&!mediaReadable(it.imageUri)}
   "Đã lấy lại $saf ảnh từ POS0210 và $cloud ảnh từ Cloud · còn $missing món chưa có ảnh"
  }.getOrElse{"Khôi phục ảnh lỗi: ${it.message}"}
  kotlinx.coroutines.withContext(Dispatchers.Main){onDone(text)}
 }
}
private fun scheduleMediaUpload(){
 mediaUploadJob?.cancel()
 mediaUploadJob=viewModelScope.launch(Dispatchers.IO){
  val uid=runCatching{FirebaseCloudSync.currentUid(getApplication())}.getOrNull()?:return@launch
  uploadMediaToCloud(uid,5_000L)
 }
}
fun createFirebaseBackup(){
 val e=currentEmployee.value?:return;if(e.role!="ADMIN")return
 viewModelScope.launch(Dispatchers.IO){
  cloudMessage.value="Đang tạo cloud backup…"
  FirebaseCloudSync.backupNow(getApplication()).onSuccess{info->
   val old=dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity()
   dao.saveCloudSyncState(old.copy(lastError=null))
   cloudMessage.value="Cloud backup được server xác nhận lúc "+SimpleDateFormat("dd/MM/yyyy HH:mm:ss",Locale.getDefault()).format(Date(info.createdAt))+" · slot ${info.slot} · ${info.chunks} mảnh · ${info.bytes/1024} KB"
  }.onFailure{err->
   cloudMessage.value="Cloud backup lỗi: ${err.message}"
  }
 }
}
fun restoreFirebaseBackup(){
 val e=currentEmployee.value?:return;if(e.role!="ADMIN")return
 viewModelScope.launch(Dispatchers.IO){
  cloudMessage.value="Đang khôi phục cloud backup…"
  runCatching{FirestorePrivateBackup.restoreLatest(getApplication())}.onSuccess{
   cloudMessage.value="Đã khôi phục cloud backup. Ứng dụng đang mở lại…"
   val context=getApplication<Application>();val launch=context.packageManager.getLaunchIntentForPackage(context.packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
   if(launch!=null)context.startActivity(launch)
   android.os.Process.killProcess(android.os.Process.myPid())
  }.onFailure{cloudMessage.value="Khôi phục lỗi: ${it.message}"}
 }
}
fun observeCloudDashboard(){cloudDashboardJob?.cancel();cloudDashboardJob=viewModelScope.launch{FirebaseCloudSync.dashboard(getApplication()).collect{cloudDashboard.value=it}}}
fun attachStorageRoot(uri:String,allowWrites:Boolean){
 val e=currentEmployee.value?:return
 if(e.role!="ADMIN"&&!e.canManageSystem)return
 viewModelScope.launch{
  db.withTransaction{
   dao.saveSetting(AppSettingEntity("storage_root_uri",uri))
   dao.saveSetting(AppSettingEntity("storage_write_enabled",allowWrites.toString()))
  }
  audit("STORAGE","POS0210","ATTACH","writes=$allowWrites")
 }
}
 fun setting(key:String)=settings.value.firstOrNull{it.key==key}?.value?:""
 fun paymentSession(sessionId:String)=dao.activePaymentSession(sessionId)
 fun openPaymentSession(session:TableSessionEntity,table:DiningTableEntity,amount:Long){
  if(amount<=0)return
  viewModelScope.launch(Dispatchers.IO){
   val current=dao.activePaymentSessionSnapshot(session.id)
   if(current!=null&&current.expectedAmount==amount&&current.expiresAt>System.currentTimeMillis())return@launch
   dao.cancelPaymentSessions(session.id)
   val alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";val random=SecureRandom()
   repeat(12){
    val code=(1..4).map{alphabet[random.nextInt(alphabet.length)]}.joinToString("")
    val inserted=runCatching{dao.insertPaymentSession(PaymentSessionEntity(UUID.randomUUID().toString(),session.id,null,table.id,amount,code,System.currentTimeMillis(),System.currentTimeMillis()+600_000L))}
    if(inserted.isSuccess)return@launch
   }
  }
 }
 fun clearBankNotificationLog(){viewModelScope.launch(Dispatchers.IO){dao.clearBankNotifications()}}
 fun addPurchase(name:String,amount:Long,note:String,at:Long=System.currentTimeMillis(),imageUri:String?=null){addPurchaseDetailed(name,1.0,"lần",amount,note,at,"",imageUri)}
 fun addPurchaseDetailed(name:String,qty:Double,unit:String,unitPrice:Long,note:String,at:Long=System.currentTimeMillis(),supplierName:String="",imageUri:String?=null,categoryId:String="pc_production",expenseCategory:String="UNCLASSIFIED",asset:AssetEntity?=null,paidByName:String="",costCodeId:String?=null){
  val e=currentEmployee.value?:return
  if(!e.canPurchase&&e.role!="ADMIN")return
  if(name.isBlank()||qty<=0||unitPrice<=0)return
  if(asset!=null&&(asset.usefulLifeMonths<=0||asset.residualValue !in 0..asset.totalCost||asset.totalCost<=0))return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val id=UUID.randomUUID().toString()
   val managed=runCatching{ManagedMedia.importImage(getApplication(),imageUri,"invoice_"+id)}.getOrNull()
   val supplierId=if(supplierName.isBlank())null else UUID.randomUUID().toString().also{repo.saveSupplier(SupplierEntity(it,supplierName.trim()))}
   val amount=(qty*unitPrice).toLong()
   repo.savePurchase(
    PurchaseEntity(id,supplierId,e.id,at,amount,note,managed,expenseCategory=expenseCategory,paidByName=paidByName.trim(),costCodeId=costCodeId),
    listOf(PurchaseItemEntity(UUID.randomUUID().toString(),id,categoryId,name.trim(),qty,unit.ifBlank{"lần"},unitPrice,amount)),asset?.copy(id=assetIdForPurchase(id))
   )
   queueExpenseReceiptSync(id)
   audit("PURCHASE",id,"CREATE","${name.trim()}:$qty:$unit:$unitPrice:$amount:payer=${paidByName.trim()}");autoBackup();autoBackupMedia()
  }
 }
 /** Đưa phiếu chi vào hàng đợi đẩy lên cloud (expenseReceipts). Phiếu "web:..." là bản sao từ Web nên không đẩy ngược. */
 private suspend fun queueExpenseReceiptSync(purchaseId:String){
  if(purchaseId.startsWith("web:"))return
  val now=System.currentTimeMillis()
  dao.enqueueSync(SyncQueueEntity(UUID.randomUUID().toString(),"EXPENSE_RECEIPT",purchaseId,"UPSERT","",now,now))
  dao.markCloudDirty()
 }
 fun addPurchaseReceipt(lines:List<PurchaseReceiptLine>,note:String,at:Long=System.currentTimeMillis(),supplierName:String="",expenseCategory:String=ExpenseCategories.INVENTORY_PURCHASE,paidByName:String="",costCodeId:String?=null){
  val e=currentEmployee.value?:return
  val valid=lines.filter{it.isValid}
  if(!e.canPurchase&&e.role!="ADMIN"||valid.isEmpty()||valid.size!=lines.size||expenseCategory !in ExpenseCategories.all)return
  viewModelScope.launch(Dispatchers.IO){
   val id=UUID.randomUUID().toString()
   val supplierId=if(supplierName.isBlank())null else UUID.randomUUID().toString().also{repo.saveSupplier(SupplierEntity(it,supplierName.trim()))}
   val items=valid.map{line->PurchaseItemEntity(UUID.randomUUID().toString(),id,line.categoryId.ifBlank{"pc_production"},line.name.trim(),line.qty,line.unit.ifBlank{"lần"},line.unitPrice,line.amount)}
   val total=items.sumOf{it.amount}
   repo.savePurchase(PurchaseEntity(id,supplierId,e.id,at,total,note.trim(),expenseCategory=expenseCategory,paidByName=paidByName.trim(),costCodeId=costCodeId),items)
   queueExpenseReceiptSync(id)
   audit("PURCHASE",id,"CREATE_RECEIPT","lines=${items.size},total=${total},payer=${paidByName.trim()}")
   autoBackup()
  }
 }

 fun addCostCode(code:String,name:String,parent:String,unit:String,supplier:String=""){
  val e=currentEmployee.value?:return;if(e.role!="ADMIN"||code.isBlank()||name.isBlank()||parent !in ExpenseCategories.all)return
  viewModelScope.launch(Dispatchers.IO){dao.saveCostCode(CostCodeEntity(UUID.randomUUID().toString(),code.trim().uppercase(),name.trim(),parent,unit.ifBlank{"lần"},supplier.trim(),sortOrder=costCodes.value.size));audit("COST_CODE",code.trim().uppercase(),"SAVE","name=${name.trim()}");autoBackup()}
 }
 fun updatePurchaseFinancial(p:PurchaseEntity,line:PurchaseItemEntity,category:String,detailCategoryId:String,costCodeId:String?,paidByName:String,supplierName:String,note:String,at:Long,qty:Double,unit:String,unitPrice:Long){
  val e=currentEmployee.value?:return;if(!e.canPurchase&&e.role!="ADMIN")return;if(category !in ExpenseCategories.all||qty<=0||unitPrice<=0)return
  viewModelScope.launch(Dispatchers.IO){
   val supplierId=if(supplierName.isBlank())null else p.supplierId?.takeIf{sid->suppliers.value.any{it.id==sid&&it.name==supplierName.trim()}}?:UUID.randomUUID().toString().also{repo.saveSupplier(SupplierEntity(it,supplierName.trim()))}
   val amount=(qty*unitPrice).toLong();val now=System.currentTimeMillis()
   val linkedAsset=assets.value.firstOrNull{assetMatchesPurchaseSignature(it,p,line.name)}
   db.withTransaction{
    dao.updatePurchaseItem(line.copy(categoryId=detailCategoryId,qty=qty,unit=unit.ifBlank{"lần"},unitPrice=unitPrice,amount=amount))
    // Tổng phiếu = tổng mọi dòng (phiếu nhiều vật tư chỉ sửa 1 dòng không được làm tổng thành tiền của riêng dòng đó).
    val receiptTotal=dao.purchaseItemsSnapshot(p.id).sumOf{it.amount}
    dao.updatePurchase(p.copy(supplierId=supplierId,purchasedAt=at,total=receiptTotal,note=note.trim(),expenseCategory=category,paidByName=paidByName.trim(),costCodeId=costCodeId,updatedAt=now))
    linkedAsset?.let{a->
     val investmentClass=assetInvestmentClassForExpense(category)
     if(investmentClass==null) dao.setAssetStatus(a.id,"DELETED") else dao.saveAsset(a.copy(purchaseDate=at,purchasePrice=unitPrice,quantity=qty.toInt().coerceAtLeast(1),totalCost=amount,supplier=supplierName.trim(),note=note.trim(),investmentClass=investmentClass))
    }
   }
   queueExpenseReceiptSync(p.id)
   audit("PURCHASE",p.id,"UPDATE","amount=${p.total}->$amount,category=${p.expenseCategory}->$category,payer=${p.paidByName}->${paidByName.trim()},costCode=${p.costCodeId}->${costCodeId}");autoBackup()
  }
 }
 fun reimbursePayer(payer:String,amount:Long,method:String,note:String,at:Long=System.currentTimeMillis()){
  val e=currentEmployee.value?:return;if(e.role!="ADMIN"||payer.isBlank()||amount<=0)return
  viewModelScope.launch(Dispatchers.IO){val id=UUID.randomUUID().toString();dao.insertFinancialMovement(FinancialMovementEntity(id,"PAYER_REIMBURSEMENT",amount,at,method=method,note=note.trim(),counterpartyName=payer.trim()));audit("FINANCE",id,"PAYER_REIMBURSEMENT","payer=${payer.trim()},amount=$amount");autoBackup()}
 }
 fun updatePurchaseExpenseCategory(p:PurchaseEntity,category:String){
  val e=currentEmployee.value?:return;if(!e.canPurchase&&e.role!="ADMIN")return
  if(category !in vn.ecohome.pos0210.ExpenseCategories.all)return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   if(dao.updatePurchaseExpenseCategory(p.id,category)==1){queueExpenseReceiptSync(p.id);audit("PURCHASE",p.id,"CLASSIFY","${p.expenseCategory}->$category");autoBackup()}
  }
 }
 fun saveMonthlyAccounting(v:MonthlyAccountingEntity){
  val e=currentEmployee.value?:return;if(e.role!="ADMIN"&&!e.canViewReport)return
  if(v.reserveBasisPoints !in 0..10000)return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){dao.saveMonthlyAccounting(v);audit("ACCOUNTING",v.monthKey,"SAVE","cogs=${v.cogs},source=${v.cogsSource},reserveBp=${v.reserveBasisPoints}");autoBackup()}
 }
 fun saveOpeningCash(v:MonthlyAccountingEntity,previous:Long,note:String){
  val e=currentEmployee.value?:return;if(e.role!="ADMIN"||note.isBlank())return
  viewModelScope.launch(Dispatchers.IO){db.withTransaction{dao.saveMonthlyAccounting(v.copy(openingCashOverridden=true));dao.insertOpeningCashAdjustment(OpeningCashAdjustmentEntity(UUID.randomUUID().toString(),v.monthKey,previous,v.openingCash,note.trim(),System.currentTimeMillis()))};audit("ACCOUNTING",v.monthKey,"OPENING_CASH_OVERRIDE","$previous->${v.openingCash}");autoBackup()}
 }
 fun saveAsset(v:AssetEntity){
  val e=currentEmployee.value?:return;if(e.role!="ADMIN"||v.name.isBlank()||v.totalCost<=0||v.quantity<=0||v.usefulLifeMonths<=0)return
  viewModelScope.launch(Dispatchers.IO){dao.saveAsset(v);audit("ASSET",v.id,"SAVE","cost=${v.totalCost},life=${v.usefulLifeMonths}");autoBackup()}
 }
 fun updateAssetLiquidationValue(asset:AssetEntity,newValue:Long,note:String){
  val e=currentEmployee.value?:return;if(e.role!="ADMIN"||newValue<0||note.isBlank())return
  viewModelScope.launch(Dispatchers.IO){db.withTransaction{dao.saveAsset(asset.copy(estimatedLiquidationValue=newValue));dao.insertAssetValuation(AssetValuationEntity(UUID.randomUUID().toString(),asset.id,asset.estimatedLiquidationValue,newValue,System.currentTimeMillis(),note.trim()))};audit("ASSET",asset.id,"VALUATION","${asset.estimatedLiquidationValue}->$newValue");autoBackup()}
 }
 fun updateAssetStatus(asset:AssetEntity,status:String,disposalPrice:Long?,note:String){
  val e=currentEmployee.value?:return
  val allowed=setOf("ACTIVE","DAMAGED","SOLD","DISPOSED","TRANSFERRED")
  if(e.role!="ADMIN"||asset.status in setOf("SOLD","DISPOSED")||status !in allowed||note.isBlank()||(status=="SOLD"&&(disposalPrice?:0)<=0))return
  viewModelScope.launch(Dispatchers.IO){
   val at=System.currentTimeMillis();dao.saveAsset(asset.copy(status=status,disposalDate=if(status in setOf("SOLD","DISPOSED","TRANSFERRED"))at else null,disposalPrice=if(status=="SOLD")disposalPrice else null,note=listOf(asset.note,note.trim()).filter{it.isNotBlank()}.joinToString(" · ")))
   if(status=="SOLD"&&disposalPrice!=null)dao.insertFinancialMovement(FinancialMovementEntity(UUID.randomUUID().toString(),"ASSET_DISPOSAL_IN",disposalPrice,at,note=note.trim()))
   audit("ASSET",asset.id,"STATUS","${asset.status}->$status,price=${disposalPrice?:0}");autoBackup()
  }
 }
 fun addFinancialMovement(type:String,amount:Long,partnerId:String?=null,method:String="CASH",note:String="",at:Long=System.currentTimeMillis()){
  val e=currentEmployee.value?:return;if(e.role!="ADMIN"||amount<=0||type !in setOf("CAPITAL_CONTRIBUTION","WORKING_CAPITAL","OTHER_CASH_IN","OTHER_CASH_ADJUSTMENT","PROFIT_WITHDRAWAL","OWNER_WITHDRAWAL","RECOVERED_CAPITAL","ASSET_DISPOSAL_IN"))return
  viewModelScope.launch(Dispatchers.IO){
   if(type=="RECOVERED_CAPITAL"){
    val available=dao.cumulativeDistributableProfit()-dao.financialMovementTotal("RECOVERED_CAPITAL")
    if(amount>available.coerceAtLeast(0)){printerMessage.value="SỐ TIỀN HOÀN VỐN VƯỢT LỢI NHUẬN ĐÃ GHI NHẬN";return@launch}
   }
   val id=UUID.randomUUID().toString();dao.insertFinancialMovement(FinancialMovementEntity(id,type,amount,at,partnerId,method,note.trim()));audit("FINANCE",id,"CREATE","type=$type,amount=$amount");autoBackup()
  }
 }
 fun saveProfitPartners(rows:List<ProfitPartnerEntity>){
  val e=currentEmployee.value?:return;if(e.role!="ADMIN")return
  if(rows.any{it.name.isBlank()}||rows.map{it.name.trim().lowercase()}.distinct().size!=rows.size||!validProfitPeopleShares(rows.map{it.shareBasisPoints}))return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val previous=profitPartners.value.associateBy{it.id}
   db.withTransaction{
    rows.forEach{row->
     val oldName=previous[row.id]?.name?.trim().orEmpty();val newName=row.name.trim()
     if(oldName.isNotBlank()&&!oldName.equals(newName,true)){dao.renamePurchasePayerName(oldName,newName);dao.renameReimbursementCounterparty(oldName,newName)}
    }
    dao.deactivateProfitPartners();dao.saveProfitPartners(rows.map{it.copy(name=it.name.trim())})
   }
   audit("ACCOUNTING","PARTNERS","SAVE","count=${rows.size},totalBp=10000");autoBackup()
  }
 }
 fun mergePayerAlias(oldName:String,newName:String){
  val e=currentEmployee.value?:return;if(e.role!="ADMIN"||oldName.isBlank()||newName.isBlank()||oldName.trim().equals(newName.trim(),true))return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val purchasesChanged=dao.renamePurchasePayerName(oldName.trim(),newName.trim());val reimbursementsChanged=dao.renameReimbursementCounterparty(oldName.trim(),newName.trim())
   audit("ACCOUNTING","PAYER_ALIAS","MERGE","${oldName.trim()}->${newName.trim()},purchases=$purchasesChanged,reimbursements=$reimbursementsChanged");autoBackup()
  }
 }
 fun lookupVoucher(code:String){
  viewModelScope.launch(Dispatchers.IO){
   val normalized=code.trim().uppercase()
   verifiedVoucher.value=null
   if(!normalized.matches(Regex("(0210-)?[A-Z0-9]{6}"))){voucherMessage.value="NHẬP ĐÚNG MÃ VOUCHER 0210-XXXXXX";return@launch}
   val reward=dao.availableVoucherBySuffix(normalized.removePrefix("0210-"),System.currentTimeMillis())
   val cap=reward?.let{VoucherPolicy.cap(it.rewardSnapshot)}
   verifiedVoucher.value=if(cap!=null)reward else null
   voucherMessage.value=if(cap!=null)"VOUCHER HỢP LỆ · HẠN MỨC "+java.text.NumberFormat.getNumberInstance(Locale("vi","VN")).format(cap)+"đ · CHỌN 01 MÓN" else "MÃ KHÔNG TỒN TẠI, ĐÃ DÙNG HOẶC HẾT HẠN"
  }
 }
 fun resetVoucherLookup(){verifiedVoucher.value=null;voucherMessage.value=""}
 fun selectVoucher(code:String,menuItemId:String){
  voucherMessage.value="ĐỔI VOUCHER ĐÃ TẠM KHÓA"
 }

 // ===== CA LÀM (Phase 1): ca thuộc về máy, chỉ kết thúc bằng thao tác ra ca =====
 val activeShift=dao.activeShiftFlow().stateIn(viewModelScope,SharingStarted.Eagerly,null)
 val shifts=dao.recentShifts().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val shiftMessage=MutableStateFlow("")
 val shiftBlockers=MutableStateFlow<List<TableSessionEntity>>(emptyList())
 val shiftTotals=MutableStateFlow<Triple<Long,Long,Int>?>(null)
 /** Tạo ca mới cho [e] (gọi trong attendanceMutex). Nhận luôn các bàn đang chờ chuyển ca. */
 private suspend fun beginShift(e:EmployeeEntity,now:Long):ShiftEntity{
  var att:AttendanceSessionEntity?=null
  if(ShiftRules.attendanceRequired(setting(ShiftRules.attendanceSettingKey(e.id)),e.role)){
   att=dao.openAttendance(e.id)
   if(att==null){
    val defaultRate=PayrollSettings.hourlyRate(setting("hourly_rate_default"),0L)
    val rate=PayrollSettings.hourlyRate(setting("hourly_rate_"+e.id),defaultRate)
    val multiplier=HolidayMultiplier.basisPoints(setting(HolidayMultiplier.settingKey(ShiftRules.workDate(now))))
    att=AttendanceSessionEntity(UUID.randomUUID().toString(),e.id,now,hourlyRate=rate,multiplierBasisPoints=multiplier)
    dao.insertAttendanceSession(att)
   }
  }
  val shift=ShiftEntity(UUID.randomUUID().toString(),ShiftRules.workDate(now),e.id,e.name,e.role,now,lastActivityAt=now,attendanceId=att?.id,updatedAt=now)
  dao.saveShift(shift)
  dao.adoptPendingSessions(shift.id)
  if(att!=null){myAttendance.value=att;refreshPayroll()}
  audit("SHIFT",shift.id,"START","staff=${e.name}")
  dao.markCloudDirty()
  return shift
 }
 fun startShift(){
  val e=currentEmployee.value?:return
  viewModelScope.launch(Dispatchers.IO){
   attendanceMutex.withLock {
    if(dao.activeShift()==null)beginShift(e,System.currentTimeMillis())
    withContext(Dispatchers.Main){screen.value="TABLES"}
   }
  }
 }
 /** Đóng [sh] tại [cutoff]: tiền tính đến cutoff, bàn đang mở và bill sau cutoff chờ ca kế tiếp nhận. */
 private suspend fun settleShift(sh:ShiftEntity,cutoff:Long,source:String,status:String,counted:Long?,note:String,receiver:EmployeeEntity?,now:Long):ShiftEntity{
  val expected=dao.shiftPaymentTotalUntil(sh.id,"CASH",cutoff)
  val closed=sh.copy(checkOutClient=cutoff,checkOutSource=source,cashExpected=expected,cashCounted=counted,diff=counted?.let{ShiftRules.diff(it,expected)},diffNote=note.trim(),
   transferTotal=dao.shiftPaymentTotalUntil(sh.id,"TRANSFER",cutoff),orderCount=dao.shiftPaidBillCountUntil(sh.id,cutoff),
   status=status,receivedBy=receiver?.id,receivedAt=receiver?.let{now},updatedAt=now)
  dao.openSessionsOfShift(sh.id).forEach{dao.setSessionShift(it.id,ShiftRules.PENDING_NEXT)}
  dao.sessionIdsPaidAfter(sh.id,cutoff).forEach{dao.setSessionShift(it,ShiftRules.PENDING_NEXT)}
  dao.saveShift(closed)
  sh.attendanceId?.let{dao.closeAttendance(it,cutoff)}
  if(myAttendance.value?.id==sh.attendanceId)myAttendance.value=null
  refreshPayroll()
  dao.markCloudDirty()
  return closed
 }
 /** ADMIN tiếp quản ca của nhân viên đã về: giờ ra do ADMIN chọn (gợi ý = hoạt động cuối), tiền chỉ tính đến giờ đó, phần sau chuyển sang ca của ADMIN. */
 fun takeoverShift(cutoffText:String,counted:Long,note:String,pin:String,onDone:(Boolean)->Unit){
  val admin=currentEmployee.value
  viewModelScope.launch(Dispatchers.IO){
   fun fail(m:String){shiftMessage.value=m;viewModelScope.launch(Dispatchers.Main){onDone(false)}}
   attendanceMutex.withLock {
    val sh=dao.activeShift()
    if(admin==null||admin.role!="ADMIN"){fail("Chỉ ADMIN được tiếp quản ca");return@withLock}
    if(sh==null||sh.staffId==admin.id){fail("Không có ca của người khác để tiếp quản");return@withLock}
    val who=dao.employeeByPin(pin)
    if(who==null||who.id!=admin.id){fail("PIN QUẢN LÝ KHÔNG ĐÚNG");return@withLock}
    val now=System.currentTimeMillis()
    val cutoff=ShiftRules.parseLocalTime(cutoffText)
    ShiftRules.takeoverCutoffError(cutoff,sh.checkInClient,now)?.let{fail(it);return@withLock}
    val expected=dao.shiftPaymentTotalUntil(sh.id,"CASH",cutoff!!)
    if(!ShiftRules.canConfirm(ShiftRules.diff(counted,expected),note)){fail("CHÊNH LỆCH LỚN · CẦN GHI CHÚ");return@withLock}
    settleShift(sh,cutoff,"manager_takeover","received",counted,note,admin,now)
    audit("SHIFT",sh.id,"TAKEOVER","by=${admin.name},staff=${sh.staffName},cutoff=$cutoffText,expected=$expected,counted=$counted")
    beginShift(admin,now)
    shiftMessage.value="ĐÃ TIẾP QUẢN CA · BẠN ĐANG TRONG CA MỚI"
    withContext(Dispatchers.Main){onDone(true);screen.value="TABLES"}
   }
  }
 }
 /** Tự đóng ca sót (hôm trước, hoặc nhân viên quá giờ đóng cửa mà không còn hoạt động): giờ ra = hoạt động cuối, cần xem lại. */
 fun autoCloseIfStale(){
  viewModelScope.launch(Dispatchers.IO){
   attendanceMutex.withLock {
    val sh=dao.activeShift()?:return@withLock
    val now=System.currentTimeMillis()
    val closeTime=setting("shift_close_time").ifBlank{ShiftRules.DEFAULT_CLOSE_TIME}
    val snooze=setting("reminder_snooze_min").toIntOrNull()?:ShiftRules.DEFAULT_SNOOZE_MIN
    if(!ShiftRules.shouldAutoClose(now,sh.date,sh.role,sh.lastActivityAt,closeTime,snooze))return@withLock
    val cutoff=ShiftRules.defaultCutoff(sh.lastActivityAt,sh.checkInClient,now)
    settleShift(sh,cutoff,"auto_last_activity","pending_review",null,"",null,now)
    audit("SHIFT",sh.id,"AUTO_CLOSE","staff=${sh.staffName},cutoff=${ShiftRules.formatLocalTime(cutoff)}")
    shiftMessage.value="CA CỦA ${sh.staffName} ĐÃ TỰ ĐÓNG · CẦN XEM LẠI"
   }
  }
 }
 /** ADMIN nhập tiền thực tế cho ca tự đóng (hoặc để trống kèm ghi chú) và xác nhận. */
 fun reviewShift(shiftId:String,counted:Long?,note:String,pin:String,onDone:(String?)->Unit){
  viewModelScope.launch(Dispatchers.IO){
   fun fail(m:String){viewModelScope.launch(Dispatchers.Main){onDone(m)}}
   val who=dao.employeeByPin(pin);val sh=dao.shiftById(shiftId)
   if(who==null||who.role!="ADMIN"){fail("PIN ADMIN không đúng");return@launch}
   if(sh==null||sh.status!="pending_review"){fail("Ca không ở trạng thái cần xem lại");return@launch}
   val diff=counted?.let{ShiftRules.diff(it,sh.cashExpected?:0L)}
   if(counted==null&&note.isBlank()){fail("Không đếm được thì phải ghi chú");return@launch}
   if(diff!=null&&!ShiftRules.canConfirm(diff,note)){fail("Chênh lệch lớn · cần ghi chú");return@launch}
   val now=System.currentTimeMillis()
   dao.saveShift(sh.copy(cashCounted=counted,diff=diff,diffNote=note.trim(),status="received",receivedBy=who.id,receivedAt=now,updatedAt=now))
   audit("SHIFT",sh.id,"REVIEWED","by=${who.name},counted=$counted,diff=$diff")
   dao.markCloudDirty()
   withContext(Dispatchers.Main){onDone(null)}
  }
 }
 // ----- Nhắc ra ca -----
 val reminderDue=MutableStateFlow(false)
 @Volatile private var reminderSnoozeUntil=0L
 fun checkReminder(){
  val sh=activeShift.value
  val due=currentEmployee.value!=null&&!locked.value&&sh!=null&&ShiftRules.reminderDue(System.currentTimeMillis(),sh.checkInClient,sh.role,
   setting("staff_usual_end").ifBlank{ShiftRules.DEFAULT_STAFF_USUAL_END},reminderSnoozeUntil)
  if(reminderDue.value!=due)reminderDue.value=due
 }
 fun snoozeReminder(){
  val min=setting("reminder_snooze_min").toIntOrNull()?:ShiftRules.DEFAULT_SNOOZE_MIN
  reminderSnoozeUntil=System.currentTimeMillis()+min*60_000L
  reminderDue.value=false
 }
 fun loadShiftCheckout(until:Long=Long.MAX_VALUE){
  viewModelScope.launch(Dispatchers.IO){
   val sh=dao.activeShift()
   if(sh==null){shiftBlockers.value=emptyList();shiftTotals.value=null;return@launch}
   shiftBlockers.value=dao.openSessionsOfShift(sh.id)
   shiftTotals.value=Triple(dao.shiftPaymentTotalUntil(sh.id,"CASH",until),dao.shiftPaymentTotalUntil(sh.id,"TRANSFER",until),dao.shiftPaidBillCountUntil(sh.id,until))
  }
 }
 fun deferSessionToNextShift(sessionId:String){
  viewModelScope.launch(Dispatchers.IO){
   dao.setSessionShift(sessionId,ShiftRules.PENDING_NEXT)
   audit("SESSION",sessionId,"DEFER_TO_NEXT_SHIFT")
   loadShiftCheckout()
  }
 }
 /** Nhân viên (chủ ca) hoặc ADMIN nhập PIN để xác nhận ra ca. [receivePin] khác rỗng: ADMIN nhận tiền ngay. */
 fun closeShift(pin:String,counted:Long,note:String,receivePin:String,onDone:(Boolean)->Unit){
  viewModelScope.launch(Dispatchers.IO){
   attendanceMutex.withLock {
    val sh=dao.activeShift()
    if(sh==null){shiftMessage.value="KHÔNG CÓ CA ĐANG MỞ";withContext(Dispatchers.Main){onDone(false)};return@withLock}
    val who=dao.employeeByPin(pin)
    if(who==null||!ShiftRules.canCloseShift(sh.staffId,who.id,who.role)){shiftMessage.value="PIN KHÔNG ĐÚNG HOẶC KHÔNG PHẢI CHỦ CA";withContext(Dispatchers.Main){onDone(false)};return@withLock}
    val unpaid=dao.unpaidPrepaidCount()
    if(unpaid>0){shiftMessage.value="CÒN $unpaid ĐƠN CHƯA XÁC NHẬN THU TIỀN · thu tiền hoặc huỷ có lý do trước khi ra ca";withContext(Dispatchers.Main){onDone(false)};return@withLock}
    val cashExpected=dao.shiftPaymentTotalUntil(sh.id,"CASH",Long.MAX_VALUE)
    val diff=ShiftRules.diff(counted,cashExpected)
    if(!ShiftRules.canConfirm(diff,note)){shiftMessage.value="CHÊNH LỆCH LỚN · CẦN GHI CHÚ";withContext(Dispatchers.Main){onDone(false)};return@withLock}
    val receiver=if(receivePin.isNotBlank())dao.employeeByPin(receivePin)?.takeIf{ShiftRules.canReceive("closed",it.role)} else null
    if(receivePin.isNotBlank()&&receiver==null){shiftMessage.value="PIN NGƯỜI NHẬN TIỀN KHÔNG ĐÚNG";withContext(Dispatchers.Main){onDone(false)};return@withLock}
    val now=System.currentTimeMillis()
    val closed=sh.copy(checkOutClient=now,checkOutSource="self",cashExpected=cashExpected,cashCounted=counted,diff=diff,diffNote=note.trim(),
     transferTotal=dao.shiftPaymentTotalUntil(sh.id,"TRANSFER",Long.MAX_VALUE),orderCount=dao.shiftPaidBillCount(sh.id),
     status=if(receiver!=null)"received" else "closed",receivedBy=receiver?.id,receivedAt=receiver?.let{now},updatedAt=now)
    dao.openSessionsOfShift(sh.id).forEach{dao.setSessionShift(it.id,ShiftRules.PENDING_NEXT)}
    dao.saveShift(closed)
    sh.attendanceId?.let{dao.closeAttendance(it,now)}
    myAttendance.value=null;refreshPayroll()
    audit("SHIFT",sh.id,"CHECK_OUT","expected=$cashExpected,counted=$counted,diff=$diff,by=${who.name}")
    dao.markCloudDirty()
    shiftMessage.value="ĐÃ RA CA"
    withContext(Dispatchers.Main){onDone(true);logout()}
   }
  }
 }
 fun receiveShift(shiftId:String,pin:String,onDone:(Boolean)->Unit){
  viewModelScope.launch(Dispatchers.IO){
   val who=dao.employeeByPin(pin)
   val sh=dao.shiftById(shiftId)
   if(who==null||sh==null||!ShiftRules.canReceive(sh.status,who.role)){shiftMessage.value="PIN ADMIN KHÔNG ĐÚNG HOẶC CA CHƯA RA";withContext(Dispatchers.Main){onDone(false)};return@launch}
   val now=System.currentTimeMillis()
   dao.saveShift(sh.copy(status="received",receivedBy=who.id,receivedAt=now,updatedAt=now))
   audit("SHIFT",sh.id,"RECEIVED","by=${who.name}")
   dao.markCloudDirty()
   shiftMessage.value="ĐÃ NHẬN TIỀN"
   withContext(Dispatchers.Main){onDone(true)}
  }
 }

 // ===== SỬA CÔNG THỦ CÔNG (ADMIN) – cần PIN của chính nhân viên =====
 fun attendanceHistoryOf(employeeId:String)=dao.attendanceHistory(employeeId)
 fun manualAttendance(sessionId:String?,employeeId:String,checkInText:String,checkOutText:String,reason:String,pin:String,onResult:(String?)->Unit){
  val admin=currentEmployee.value
  viewModelScope.launch(Dispatchers.IO){
   fun fail(m:String){viewModelScope.launch(Dispatchers.Main){onResult(m)}}
   if(admin?.role!="ADMIN"){fail("Chỉ ADMIN được sửa công");return@launch}
   val target=dao.employeeById(employeeId)
   if(target==null||target.pin!=pin){fail("PIN của nhân viên không đúng");return@launch}
   val now=System.currentTimeMillis()
   val inAt=ShiftRules.parseLocalTime(checkInText);val outAt=ShiftRules.parseLocalTime(checkOutText)
   ShiftRules.manualAttendanceError(inAt,outAt,checkOutText,now,reason)?.let{fail(it);return@launch}
   attendanceMutex.withLock {
    val note="Sửa thủ công bởi ${admin.name}: ${reason.trim()}"
    if(sessionId==null){
     val defaultRate=PayrollSettings.hourlyRate(setting("hourly_rate_default"),0L)
     val rate=PayrollSettings.hourlyRate(setting("hourly_rate_"+employeeId),defaultRate)
     val multiplier=HolidayMultiplier.basisPoints(setting(HolidayMultiplier.settingKey(ShiftRules.workDate(inAt!!))))
     val s=AttendanceSessionEntity(UUID.randomUUID().toString(),employeeId,inAt!!,outAt,if(outAt==null)"OPEN" else "CLOSED",rate,multiplier,note,now,now)
     dao.insertAttendanceSession(s)
     audit("ATTENDANCE",s.id,"MANUAL_ADD","employee=${target.name},in=$checkInText,out=$checkOutText,reason=${reason.trim()}")
    }else{
     val old=dao.attendanceById(sessionId)
     if(old==null){fail("Không tìm thấy ca công");return@withLock}
     dao.correctAttendance(sessionId,inAt!!,outAt,if(outAt==null)"OPEN" else "CLOSED",note,now)
     audit("ATTENDANCE",sessionId,"MANUAL_EDIT","employee=${target.name},old=${ShiftRules.formatLocalTime(old.checkInAt)}→${ShiftRules.formatLocalTime(old.checkOutAt)},new=$checkInText→$checkOutText,reason=${reason.trim()}")
    }
    refreshPayroll()
    dao.markCloudDirty()
   }
   withContext(Dispatchers.Main){onResult(null)}
  }
 }

 // ===== KHOÁ MÁY KHI KHÔNG AI CHẠM: người khác cầm máy phải nhập PIN của chính mình =====
 val locked=MutableStateFlow(false)
 @Volatile private var lastTouchAt=System.currentTimeMillis()
 fun touch(){lastTouchAt=System.currentTimeMillis()}
 fun lockIfIdle(){
  if(currentEmployee.value!=null&&!locked.value&&ShiftRules.shouldLock(System.currentTimeMillis(),lastTouchAt))locked.value=true
 }
 /** PIN của người đang đăng nhập: mở khoá tiếp tục. PIN người khác: chuyển người (ca vẫn mở), về màn hình bàn. */
 fun unlock(pin:String){
  viewModelScope.launch{
   val e=dao.employeeByPin(pin)
   if(e==null){authError.value="PIN không đúng";return@launch}
   authError.value=""
   val cur=currentEmployee.value
   if(cur==null||e.id!=cur.id){
    audit("AUTH",e.id,"SWITCH_USER","from=${cur?.name}")
    currentEmployee.value=e;myAttendance.value=dao.openAttendance(e.id)
    cart.value=emptyMap();cartNotes.value=emptyMap();currentSession.value=null;currentTable.value=null
    screen.value=if(dao.activeShift()==null&&!businessTestMode.value)"SHIFT_START" else "TABLES"
   }
   touch();locked.value=false
  }
 }

 fun deleteAttendance(sessionId:String,employeeId:String,reason:String,pin:String,onResult:(String?)->Unit){
  val admin=currentEmployee.value
  viewModelScope.launch(Dispatchers.IO){
   fun fail(m:String){viewModelScope.launch(Dispatchers.Main){onResult(m)}}
   if(admin?.role!="ADMIN"){fail("Chỉ ADMIN được sửa công");return@launch}
   val target=dao.employeeById(employeeId)
   if(target==null||target.pin!=pin){fail("PIN của nhân viên không đúng");return@launch}
   if(reason.isBlank()){fail("Bắt buộc ghi lý do");return@launch}
   attendanceMutex.withLock {
    val old=dao.attendanceById(sessionId)
    if(old==null||old.employeeId!=employeeId){fail("Không tìm thấy ca công");return@withLock}
    dao.deleteAttendance(sessionId)
    audit("ATTENDANCE",sessionId,"MANUAL_DELETE","by=${admin.name},employee=${target.name},old=${ShiftRules.formatLocalTime(old.checkInAt)}→${ShiftRules.formatLocalTime(old.checkOutAt)},reason=${reason.trim()}")
    if(myAttendance.value?.id==sessionId)myAttendance.value=null
    refreshPayroll()
    withContext(Dispatchers.Main){onResult(null)}
   }
  }
 }

 // ===== GIAI ĐOẠN 3: đóng ngày, sửa giờ ra của ca =====
 val dayCloseDate=MutableStateFlow<String?>(null)
 @Volatile private var dayCloseSnoozeUntil=0L
 fun closedDays():Set<String> = settings.value.filter{it.key.startsWith("day_closed_")&&it.value.isNotBlank()}.map{it.key.removePrefix("day_closed_")}.toSet()
 fun openDay():String?=ShiftRules.earliestOpenDay(shifts.value.filter{it.dataScope=="LIVE"}.map{it.date},closedDays())
 fun checkDayClose(){
  val me=currentEmployee.value
  val d=if(me?.role=="ADMIN"&&!locked.value&&activeShift.value?.staffId.let{it==null||it==me.id}){
   val od=openDay()
   if(ShiftRules.dayCloseDue(System.currentTimeMillis(),setting("shift_close_time").ifBlank{ShiftRules.DEFAULT_CLOSE_TIME},od,dayCloseSnoozeUntil))od else null
  } else null
  if(dayCloseDate.value!=d)dayCloseDate.value=d
 }
 fun snoozeDayClose(){
  val min=setting("reminder_snooze_min").toIntOrNull()?:ShiftRules.DEFAULT_SNOOZE_MIN
  dayCloseSnoozeUntil=System.currentTimeMillis()+min*60_000L
  dayCloseDate.value=null
 }
 /** Đóng ngày: không còn bàn chưa thanh toán, không còn ca của người khác/ca cần xem lại; ADMIN chốt ca của mình (nếu có) và ghi ngày đã đóng. */
 fun closeDay(date:String,counted:Long?,note:String,pin:String,onDone:(String?)->Unit){
  viewModelScope.launch(Dispatchers.IO){
   fun fail(m:String){viewModelScope.launch(Dispatchers.Main){onDone(m)}}
   attendanceMutex.withLock {
    val who=dao.employeeByPin(pin)
    if(who==null||who.role!="ADMIN"){fail("PIN ADMIN không đúng");return@withLock}
    val unpaid=dao.openSessions().first().filter{it.dataScope=="LIVE"}
    if(unpaid.isNotEmpty()){fail("Còn ${unpaid.size} bàn chưa thanh toán · không đóng ngày được");return@withLock}
    val review=dao.shiftsSnapshot().count{it.date==date&&it.dataScope=="LIVE"&&it.status=="pending_review"}
    if(review>0){fail("Còn $review ca cần xem lại · xác nhận trong Ca làm & nhận tiền trước");return@withLock}
    val sh=dao.activeShift()
    val now=System.currentTimeMillis()
    if(sh!=null){
     if(sh.staffId!=who.id){fail("Còn ca của ${sh.staffName} đang mở · ra ca hoặc tiếp quản trước");return@withLock}
     val expected=dao.shiftPaymentTotalUntil(sh.id,"CASH",now)
     if(counted==null){fail("Nhập tiền mặt thực tế của ca bạn");return@withLock}
     if(!ShiftRules.canConfirm(ShiftRules.diff(counted,expected),note)){fail("Chênh lệch lớn · cần ghi chú");return@withLock}
     settleShift(sh,now,"self","received",counted,note,who,now)
    }
    dao.saveSetting(AppSettingEntity(ShiftRules.dayClosedKey(date),"${who.id}|$now|${note.trim().replace('|','/')}"))
    audit("DAY",date,"CLOSE","by=${who.name},counted=$counted")
    dao.markCloudDirty()
    dayCloseDate.value=null
    withContext(Dispatchers.Main){onDone(null);logout()}
   }
  }
 }
 /** Sửa giờ ra của một ca đã đóng: cần PIN ADMIN và lý do, ghi vào editLog, đồng bộ giờ công. Không tính lại tiền. */
 fun editShiftCheckout(shiftId:String,newOutText:String,reason:String,pin:String,onDone:(String?)->Unit){
  viewModelScope.launch(Dispatchers.IO){
   fun fail(m:String){viewModelScope.launch(Dispatchers.Main){onDone(m)}}
   val who=dao.employeeByPin(pin);val sh=dao.shiftById(shiftId)
   if(who==null||who.role!="ADMIN"){fail("PIN ADMIN không đúng");return@launch}
   if(sh==null||sh.status=="open"){fail("Chỉ sửa được ca đã ra");return@launch}
   val now=System.currentTimeMillis()
   val out=ShiftRules.parseLocalTime(newOutText)
   ShiftRules.takeoverCutoffError(out,sh.checkInClient,now)?.let{fail(it);return@launch}
   if(reason.isBlank()){fail("Bắt buộc ghi lý do");return@launch}
   val line=ShiftRules.editLogLine(now,who.name,"checkOut",ShiftRules.formatLocalTime(sh.checkOutClient),newOutText.trim(),reason.trim())
   dao.saveShift(sh.copy(checkOutClient=out,editLog=ShiftRules.appendEditLog(sh.editLog,line),updatedAt=now))
   sh.attendanceId?.let{id->dao.attendanceById(id)?.let{a->dao.correctAttendance(id,a.checkInAt,out,"CLOSED",(a.note+" | sửa giờ ra theo ca: "+reason.trim()).trim(' ','|'),now)}}
   refreshPayroll()
   audit("SHIFT",sh.id,"EDIT_CHECKOUT","by=${who.name},new=$newOutText,reason=${reason.trim()}")
   dao.markCloudDirty()
   withContext(Dispatchers.Main){onDone(null)}
  }
 }

 // ===== QUY TRÌNH THANH TOÁN: Trả sau (mặc định) / Trả trước =====
 fun paymentFlow():String=PaymentFlowRules.normalize(setting(PaymentFlowRules.SETTING_KEY))
 val prepaidTable=DiningTableEntity(PaymentFlowRules.PREPAID_TABLE_ID,"prepaid","Trả trước")
 val paymentFlowMessage=MutableStateFlow("")
 /** Ảnh bill vừa bấm IN (khoá theo đơn+tiền+nội dung CK) để hiện trên màn hình cho khách quét QR. */
 val checkoutBillImage=MutableStateFlow<Pair<String,android.graphics.Bitmap>?>(null)
 val waitingOrders=dao.waitingOrders().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 fun sessionItems(sessionId:String)=dao.sessionItems(sessionId)
 /** Phiếu bếp tách món: mỗi dòng món một phiếu, cùng bàn, cùng số thứ tự đơn. */
 /** false = một phiếu bếp gom cả bàn/đơn (như cũ). true = tách mỗi dòng món một phiếu. */
 private val KITCHEN_SPLIT_PER_ITEM=false
 private fun kitchenTicketBitmaps(tableName:String,b:OrderBatchEntity,orderer:String,flowTag:String,items:List<OrderItemEntity>,profile:vn.ecohome.pos0210.printing.PrinterProfile):List<android.graphics.Bitmap>{
  val lines=items.filter{it.qty>0}
  val at=b.sentAt?:b.createdAt
  if(!KITCHEN_SPLIT_PER_ITEM){
   if(lines.isEmpty())return emptyList()
   return listOf(ReceiptRenderer.kitchen(tableName,b.sequence,b.serviceNo,orderer,lines.map{Triple(it.itemNameSnapshot.removePrefix("🎁").trim(),it.qty,if(it.itemNameSnapshot.startsWith("🎁")&&it.note.isBlank())"QUÀ TẶNG" else it.note)},profile,flowTag,at))
  }
  return lines.mapIndexed{i,it->ReceiptRenderer.kitchenItem(tableName,b.serviceNo,i+1,lines.size,it.itemNameSnapshot.removePrefix("🎁").trim(),it.qty,if(it.itemNameSnapshot.startsWith("🎁")&&it.note.isBlank())"QUÀ TẶNG" else it.note,orderer,flowTag,at,profile)}
 }
 /** In lần lượt từng phiếu (mỗi phiếu một lệnh để xé từng tờ ngay). Lỗi giữa chừng báo đã in được bao nhiêu phiếu. */
 private suspend fun printKitchenTickets(mac:String,tableName:String,b:OrderBatchEntity,orderer:String,flowTag:String,profile:vn.ecohome.pos0210.printing.PrinterProfile,onProgress:(Int,Int)->Unit={_,_->}):Result<Unit>{
  val items=dao.batchItems(b.id).first()
  val tickets=kitchenTicketBitmaps(tableName,b,orderer,flowTag,items,profile)
  if(tickets.isEmpty())return Result.failure(IllegalStateException("Đơn không có món để in"))
  onProgress(0,tickets.size)
  tickets.forEachIndexed{i,bmp->
   val r=BluetoothPrinter.printBitmap(getApplication(),mac,bmp,profile,vn.ecohome.pos0210.printing.PrintJobType.KITCHEN)
   if(r.isFailure)return Result.failure(IllegalStateException("mới in ${i}/${tickets.size} phiếu · ${r.exceptionOrNull()?.message?:"lỗi"}"))
   onProgress(i+1,tickets.size)
  }
  return Result.success(Unit)
 }
 /** Số lần đã nhắc bếp + lần nhắc cuối, theo từng đơn (trong phiên chạy app). */
 val reminders=MutableStateFlow<Map<String,Pair<Int,Long>>>(emptyMap())
 /** In phiếu làm hàng của đơn trả trước sau khi đã thu tiền. Lỗi in không chặn bán: đơn vẫn nằm trong hàng chờ để in lại. */
 /** In phiếu bếp của đơn trả trước đã thu tiền. Trả về null nếu xong, hoặc nội dung lỗi (đơn vẫn đã ghi, nằm trong hàng chờ). */
 /** Chế độ TEST/không máy in: hiện đúng ảnh các phiếu bếp trên màn hình để kiểm tra, không in giấy. */
 val kitchenPreview=MutableStateFlow<Pair<String,List<android.graphics.Bitmap>>?>(null)
 fun closeKitchenPreview(){kitchenPreview.value=null}
 private suspend fun showKitchenPreview(b:OrderBatchEntity,tableName:String,orderer:String,flowTag:String){
  val items=dao.batchItems(b.id).first()
  val bmps=kitchenTicketBitmaps(tableName,b,orderer,flowTag,items,printerProfile())
  kitchenPreview.value="$tableName · ĐƠN #${b.serviceNo.toString().padStart(3,'0')}" to bmps
 }
 private suspend fun printPaidKitchenTicket(b:OrderBatchEntity,tableName:String,orderer:String,onProgress:(Int,Int)->Unit={_,_->}):String?{
  if(printerMode()!="BLUETOOTH"){printerMessage.value="TEST · Không in phiếu bếp";runCatching{showKitchenPreview(b,tableName,orderer,"ĐÃ THU TIỀN · LÀM NGAY")};return null}
  val mac=kitchenPrinterMac()
  if(mac.isBlank())return "Chưa chọn máy in bếp"
  val profile=printerProfile()
  val job=PrintJobEntity(UUID.randomUUID().toString(),b.id,null,"KITCHEN_PREPAID",createdAt=System.currentTimeMillis())
  dao.insertPrintJob(job)
  if(!repo.claimPrint(job.id,"ANDROID"))return null
  val result=printKitchenTickets(mac,tableName,b,orderer,"ĐÃ THU TIỀN · LÀM NGAY",profile,onProgress)
  return if(result.isSuccess){dao.markPrintSuccess(job.id,System.currentTimeMillis());audit("PRINT",b.id,"KITCHEN_PRINTED","prepaid,printer=${kitchenPrinterName()},job=${job.id}");printerMessage.value="ĐÃ IN PHIẾU BẾP #${b.serviceNo.toString().padStart(3,'0')}";null}
  else{val msg=result.exceptionOrNull()?.message?:"UNKNOWN";dao.markPrintFailed(job.id,msg);audit("PRINT",b.id,"KITCHEN_PRINT_FAILED","prepaid,job=${job.id}");msg}
 }
 val kitchenPrint=MutableStateFlow<KitchenPrintUi?>(null)
 /** Cảnh báo phiếu bếp in lỗi: không chặn order tiếp, nhân viên bấm đóng hoặc vào Đơn chờ giao để in lại. */
 val kitchenWarning=MutableStateFlow<String?>(null)
 @Volatile private var kitchenOverlayOn=false
 fun dismissKitchenWarning(){kitchenWarning.value=null}
 /** In phiếu bếp cho các món đã thu tiền và cập nhật màn "đang in". Trả về true nếu in xong. */
 private suspend fun runPaidKitchenPrint(sessionId:String,tableName:String,orderer:String):Boolean{
  val batches=dao.batches(sessionId).first().filter{it.status=="WAITING"}
  fun ui(v:KitchenPrintUi?){if(kitchenOverlayOn)kitchenPrint.value=v}
  ui(KitchenPrintUi("PRINTING",0,0,"",tableName))
  for(b in batches){
   val err=printPaidKitchenTicket(b,tableName,orderer){d,t->ui(KitchenPrintUi("PRINTING",d,t,"",tableName))}
   if(err!=null){
    kitchenWarning.value="⚠ PHIẾU BẾP CHƯA IN · $tableName ${PaymentFlowRules.orderNoLabel(b.serviceNo)} · $err. Vào Đơn chờ giao để IN LẠI hoặc NHẮC BẾP."
    return false
   }
  }
  kitchenWarning.value=null
  return true
 }
 private fun leavePaidOrder(){resetPrepaidEdit();resumedPrepaid.value=false;skipKitchenPrint.value=false;prepaidCartBackup=null;kitchenPrint.value=null;printedCheckoutKey.value=null;currentSession.value=null;currentTable.value=null;screen.value="TABLES"}
 /** Bấm "IN LẠI" khi phiếu bếp lỗi: in lại các phiếu của đơn vừa thu tiền. */
 fun retryPaidKitchenPrint(){
  val s=currentSession.value?:return
  val e=currentEmployee.value?:return
  val tName=currentTable.value?.name?:"Trả trước"
  viewModelScope.launch(Dispatchers.IO){ if(runPaidKitchenPrint(s.id,tName,e.name))withContext(Dispatchers.Main){leavePaidOrder()} }
 }
 /** Bỏ qua in phiếu: nhân viên tự báo bếp; đơn vẫn nằm trong hàng chờ để nhắc bếp / in lại. */
 fun skipPaidKitchenPrint(){
  printerMessage.value="ĐƠN CHƯA CÓ PHIẾU BẾP · vào Đơn chờ giao để IN LẠI hoặc NHẮC BẾP"
  leavePaidOrder()
 }
 /** Nhắc bếp: in phiếu nhắc (số thẻ, số đơn, món, đã chờ bao lâu). Chống bấm dồn trong 20 giây. */
 fun remindKitchen(o:WaitingOrderRow){
  val e=currentEmployee.value?:return
  viewModelScope.launch(Dispatchers.IO){
   val now=System.currentTimeMillis()
   val prev=reminders.value[o.batchId]
   if(prev!=null&&now-prev.second<20_000L){printerMessage.value="VỪA NHẮC XONG · chờ vài giây";return@launch}
   val count=(prev?.first?:0)+1
   val waited=((now-(o.sentAt?:o.createdAt))/60_000L).coerceAtLeast(0)
   if(printerMode()!="BLUETOOTH"||kitchenPrinterMac().isBlank()){
    reminders.value=reminders.value+(o.batchId to (count to now))
    printerMessage.value="ĐÃ GHI NHẮC LẦN $count · chưa có máy in bếp để in phiếu nhắc"
    return@launch
   }
   val items=dao.batchItems(o.batchId).first().map{Triple(it.itemNameSnapshot,it.qty,it.note)}
   val profile=printerProfile()
   val job=PrintJobEntity(UUID.randomUUID().toString(),o.batchId,null,"KITCHEN_REMIND",createdAt=now)
   dao.insertPrintJob(job)
   if(!repo.claimPrint(job.id,"ANDROID"))return@launch
   val result=BluetoothPrinter.printBitmap(getApplication(),kitchenPrinterMac(),ReceiptRenderer.kitchenReminder(o.tableName.ifBlank{"TRẢ TRƯỚC"},o.serviceNo,items,waited,count,profile),profile,vn.ecohome.pos0210.printing.PrintJobType.KITCHEN)
   if(result.isSuccess){
    dao.markPrintSuccess(job.id,System.currentTimeMillis())
    reminders.value=reminders.value+(o.batchId to (count to now))
    audit("BATCH",o.batchId,"KITCHEN_REMINDED","count=$count,waited=${waited}m,by=${e.name}")
    printerMessage.value="ĐÃ NHẮC BẾP #${o.serviceNo.toString().padStart(3,'0')} · lần $count"
   }else{dao.markPrintFailed(job.id,result.exceptionOrNull()?.message?:"UNKNOWN");printerMessage.value="NHẮC BẾP LỖI · ${result.exceptionOrNull()?.message?:"Thử lại"}"}
  }
 }
 val prepaidOrders=dao.prepaidOrdersSince(ShiftRulesTodayStart.todayStart()).stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 /** Đổi chế độ (ADMIN): chặn nếu còn bàn/đơn chưa thanh toán hoặc giỏ hàng đang soạn; ghi lịch sử local. */
 fun changePaymentFlow(target:String,onDone:(String?)->Unit){
  val e=currentEmployee.value
  viewModelScope.launch(Dispatchers.IO){
   fun fail(m:String){viewModelScope.launch(Dispatchers.Main){onDone(m)}}
   if(e==null||e.role!="ADMIN"){fail("Chỉ ADMIN được đổi chế độ thanh toán");return@launch}
   cleanupAbandonedPrepaid()
   val open=dao.openSessions().first()
   val tableNames=dao.tables().first().associate{it.id to it.name}
   val names=open.map{tableNames[it.tableId]?:"Đơn trả trước"}
   val old=paymentFlow()
   PaymentFlowRules.changeBlocker(old,target,names,cart.value.isEmpty())?.let{fail(it);return@launch}
   val now=System.currentTimeMillis()
   val history=PaymentFlowRules.appendHistory(setting(PaymentFlowRules.HISTORY_KEY),PaymentFlowRules.historyLine(now,e.name,old,target))
   db.withTransaction{
    dao.saveSetting(AppSettingEntity(PaymentFlowRules.HISTORY_KEY,history))
    dao.saveSetting(AppSettingEntity(PaymentFlowRules.SETTING_KEY,PaymentFlowRules.normalize(target)))
   }
   audit("SETTING",PaymentFlowRules.SETTING_KEY,"PAYMENT_FLOW_CHANGED","$old→$target")
   dao.markCloudDirty()
   withContext(Dispatchers.Main){onDone(null)}
  }
 }
 /** Bắt đầu đơn trả trước: bàn ảo, chưa có phiên; phiên chỉ được tạo khi gửi để thanh toán. */
 fun startPrepaidOrder(t:DiningTableEntity){
  val e=currentEmployee.value?:return
  if(!e.canOrder&&e.role!="ADMIN")return
  if(waitingOrders.value.any{it.tableId==t.id}){screen.value="DELIVERY";return}
  viewModelScope.launch{
   val shift=dao.activeShift()
   if(!ShiftRules.canCreateOrder(shift!=null,businessTestMode.value)){orderMessage.value="CHƯA VÀO CA · Bắt đầu ca trước";screen.value="SHIFT_START";return@launch}
   orderFlowOverride.value=null
   resetPrepaidEdit()
   cart.value=emptyMap();cartNotes.value=emptyMap();currentSession.value=null;currentTable.value=t
   restoreDraft(t.id)
   screen.value="ORDER"
  }
 }
 /** Đơn trả trước đang sửa: KHÔNG huỷ cho tới khi gửi lại thành công (thoát giữa chừng thì đơn cũ còn nguyên). */
 private var editingPrepaid:TableSessionEntity?=null
 /** Món đã phục vụ của đơn mở lại (bếp làm theo lời): khi gửi lại chỉ phần gọi thêm mới in phiếu bếp. */
 private var prepaidServed:Map<String,Int>?=null
 private var servedBatchIds:Set<String> = emptySet()
 /** Thông báo hiện ở màn Soát đơn khi đang sửa đơn chưa thu tiền. */
 val prepaidEditNote=MutableStateFlow<String?>(null)
 /** Hiện ở màn thanh toán sau khi sửa đơn mở lại: phần nào coi như đã giao, phần nào in bếp. */
 val prepaidSplitNote=MutableStateFlow<String?>(null)
 private fun resetPrepaidEdit(){editingPrepaid=null;prepaidServed=null;servedBatchIds=emptySet();prepaidEditNote.value=null;prepaidSplitNote.value=null}
 /** Giỏ hàng dựng lại từ các món đã lưu của đơn. */
 private suspend fun sessionCart(sessionId:String):Pair<Map<String,Int>,Map<String,String>>{
  val lines=dao.batches(sessionId).first().filter{it.status!="CANCELLED"}.flatMap{b->dao.batchItems(b.id).first()}
   .map{PrepaidEdit.Line(it.menuItemId,it.qty,it.note,it.buyGetPromotionId!=null||it.loyaltyRewardId!=null)}
  return PrepaidEdit.rebuild(lines)
 }
 /** Rời màn thanh toán mà chưa thu tiền: huỷ đơn nháp, không để lại đơn chưa thu. */
 private var prepaidCartBackup:Pair<Map<String,Int>,Map<String,String>>?=null
 /** Đơn trả trước chưa xác nhận thu tiền (đã hiện bill/QR rồi rời màn hình). */
 val unpaidPrepaid=dao.unpaidPrepaidSessions().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 /** Đang thu tiền một đơn mở lại từ danh sách chưa thu: cho phép bỏ in phiếu bếp vì bếp có thể đã làm theo lời. */
 val resumedPrepaid=MutableStateFlow(false)
 val skipKitchenPrint=MutableStateFlow(false)
 /** Rời màn thanh toán nhưng GIỮ đơn để xử lý sau (không huỷ). */
 fun parkPrepaid(){
  val s=currentSession.value
  viewModelScope.launch{
   if(s!=null)withContext(Dispatchers.IO){audit("SESSION",s.id,"PREPAID_PARKED","unpaid,by=${currentEmployee.value?.name.orEmpty()}")}
   prepaidCartBackup=null;printedCheckoutKey.value=null;checkoutBillImage.value=null
   resumedPrepaid.value=false;skipKitchenPrint.value=false;resetPrepaidEdit()
   currentSession.value=null;currentTable.value=null;cart.value=emptyMap();cartNotes.value=emptyMap()
   screen.value="TABLES"
  }
 }
 /** Mở lại đơn chưa thu tiền để xác nhận thanh toán. */
 fun resumePrepaid(s:TableSessionEntity){
  val e=currentEmployee.value?:return
  if(!e.canOrder&&e.role!="ADMIN")return
  viewModelScope.launch{
   val t=withContext(Dispatchers.IO){dao.allTablesSnapshot().firstOrNull{it.id==s.tableId}}?:prepaidTable
   prepaidCartBackup=null;printedCheckoutKey.value=null;checkoutBillImage.value=null;resetPrepaidEdit()
   cart.value=emptyMap();cartNotes.value=emptyMap()
   currentTable.value=t;currentSession.value=s
   resumedPrepaid.value=true;skipKitchenPrint.value=false
   screen.value="PAY"
  }
 }
 /**
  * Khách trả trước nhưng chưa trả, muốn chuyển sang TRẢ SAU: đổi phiên sang trả sau ở bàn thật (trống) rồi in phiếu bếp ngay.
  * Không đổi món, giá, số đơn; không tạo bill. Ghi nhật ký nhạy cảm. Đã thu tiền thì không cho đổi.
  */
 fun convertPrepaidToPostpaid(s:TableSessionEntity,tableId:String,onDone:(String?)->Unit){
  val e=currentEmployee.value
  viewModelScope.launch(Dispatchers.IO){
   fun done(m:String?){viewModelScope.launch(Dispatchers.Main){onDone(m)}}
   if(e==null||(!e.canOrder&&e.role!="ADMIN")){done("Không có quyền đổi đơn");return@launch}
   if(dao.billBySessionId(s.id)!=null){done("Đơn này đã thu tiền: không đổi sang trả sau được");return@launch}
   val table=dao.allTablesSnapshot().firstOrNull{it.id==tableId&&it.id!=PaymentFlowRules.PREPAID_TABLE_ID}?:run{done("Chọn bàn khách đang ngồi");return@launch}
   val other=dao.openSessionForTable(tableId)
   if(other!=null&&other.id!=s.id){done("${table.name} đang có khách khác · chọn bàn trống");return@launch}
   if(dao.convertPrepaidToPostpaid(s.id,tableId)!=1){done("Đơn vừa thay đổi hoặc đã thu tiền · thử lại");return@launch}
   dao.cancelPaymentSessions(s.id)
   audit("SESSION",s.id,"PREPAID_TO_POSTPAID","table=${table.name},by=${e.name}")
   val updated=dao.sessionSnapshotById(s.id)
   val drafts=dao.batches(s.id).first().filter{it.status=="DRAFT"}
   withContext(Dispatchers.Main){
    resetPrepaidEdit();prepaidCartBackup=null;printedCheckoutKey.value=null;checkoutBillImage.value=null
    resumedPrepaid.value=false;skipKitchenPrint.value=false
    cart.value=emptyMap();cartNotes.value=emptyMap()
    orderFlowOverride.value=PaymentFlowRules.POSTPAID
    currentTable.value=table;currentSession.value=updated
    screen.value="SENT"
   }
   drafts.forEach{markBatchSent(it)} // in phiếu bếp như đơn trả sau bình thường (không in lặp nếu đã in)
   autoBackup()
   done(null)
  }
 }
 /** Khách không lấy / không trả: huỷ đơn chưa thu tiền, bắt buộc lý do. */
 fun cancelUnpaidPrepaid(s:TableSessionEntity,reason:String,onDone:(String?)->Unit){
  val e=currentEmployee.value
  viewModelScope.launch(Dispatchers.IO){
   fun done(m:String?){viewModelScope.launch(Dispatchers.Main){onDone(m)}}
   if(e==null||!canCancelOrder()){done("Không có quyền huỷ đơn");return@launch}
   if(reason.isBlank()){done("Bắt buộc ghi lý do");return@launch}
   if(dao.billBySessionId(s.id)!=null){done("Đơn này đã thu tiền rồi");return@launch}
   audit("SESSION",s.id,"PREPAID_UNPAID_CANCELLED","reason=${reason.trim()},operator=${e.name}")
   cancelPrepaidSession(s,e.id,true)
   autoBackup()
   done(null)
  }
 }
 /** Bước soát đơn trước khi tạo đơn/in bill (chưa tạo đơn nên không tốn số thứ tự). */
 fun reviewPrepaid(){
  if(cart.value.isEmpty())return
  orderMessage.value=""
  screen.value="REVIEW"
 }
 /** Quay lại sửa đơn từ màn thanh toán. Đơn cũ KHÔNG bị huỷ ở bước này: chỉ thay khi gửi lại thành công.
  *  Giỏ để sửa lấy từ món đã lưu của đơn (đơn mở lại từ "Chưa thu tiền" không còn giỏ trong bộ nhớ). */
 fun editPrepaidOrder(){
  val s=currentSession.value
  val wasResumed=resumedPrepaid.value
  val memory=prepaidCartBackup
  viewModelScope.launch(Dispatchers.IO){
   var source=memory
   if(s!=null&&s.flow==PaymentFlowRules.PREPAID&&dao.billBySessionId(s.id)==null){
    val saved=sessionCart(s.id)
    if(source==null||source.first.isEmpty())source=saved
    if(source.first.isEmpty()){withContext(Dispatchers.Main){printerMessage.value="KHÔNG ĐỌC ĐƯỢC MÓN CỦA ĐƠN · Đơn giữ nguyên, chưa sửa"};return@launch}
    editingPrepaid=s
    if(wasResumed&&prepaidServed==null)prepaidServed=saved.first
    audit("SESSION",s.id,"PREPAID_EDIT_START",if(wasResumed)"resumed,items=${saved.first.values.sum()}" else "items=${saved.first.values.sum()}")
   }
   val note=if(editingPrepaid!=null)"ĐANG SỬA ĐƠN CHƯA THU TIỀN · thoát ra thì đơn cũ vẫn giữ nguyên"+(if(prepaidServed!=null)" · món cũ coi như đã phục vụ, chỉ món gọi thêm in phiếu bếp" else "") else null
   withContext(Dispatchers.Main){
    printedCheckoutKey.value=null;checkoutBillImage.value=null;resumedPrepaid.value=false;skipKitchenPrint.value=false
    currentSession.value=null
    cart.value=source?.first?:emptyMap();cartNotes.value=source?.second?:emptyMap()
    prepaidEditNote.value=note
    screen.value="REVIEW"
   }
  }
 }
 fun abandonPrepaid(){
  prepaidCartBackup=null;resetPrepaidEdit()
  val s=currentSession.value
  val e=currentEmployee.value
  viewModelScope.launch(Dispatchers.IO){
   if(s!=null&&s.flow==PaymentFlowRules.PREPAID&&e!=null&&dao.billBySessionId(s.id)==null)cancelPrepaidSession(s,e.id)
   withContext(Dispatchers.Main){currentSession.value=null;currentTable.value=null;cart.value=emptyMap();cartNotes.value=emptyMap();screen.value="TABLES"}
  }
 }
 private suspend fun cancelPrepaidSession(s:TableSessionEntity,actorId:String,billPrinted:Boolean=false){
  runCatching{
   dao.batches(s.id).first().forEach{dao.cancelBatch(it.id)}
   repo.closeCancelledSession(s,actorId)
   audit("SESSION",s.id,"PREPAID_ABANDONED",if(billPrinted)"bill_printed,unpaid" else "unpaid")
  }
 }
 /** Dọn các đơn trả trước còn dở (app bị tắt ở màn thanh toán): chưa có bill thì huỷ. */
 suspend fun cleanupAbandonedPrepaid(){
  val actor=currentEmployee.value?.id?:"system"
  // Không còn tự huỷ: đơn đã lên màn thanh toán có thể khách đã trả tiền (bếp làm theo lời, tiền đã vào TK).
  // Những đơn này nằm trong danh sách "Chưa xác nhận thu tiền" để người phụ trách thu tiền hoặc huỷ có lý do.
  if(actor.isBlank())return
 }
 /** Huỷ đơn trả trước đã thu: bắt buộc lý do, ghi khoản hoàn, không xoá đơn. */
 val refunds=dao.refundsFlow().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 /** Thông tin để quản lý nhìn ra khoản đóng băng này là của đơn nào. */
 data class FrozenRefundInfo(val orderNo:String,val tableName:String,val billNo:String,val items:String,val actor:String,val approver:String?,val paidAt:Long?,val reference:String?)
 suspend fun frozenRefundInfo(r:vn.ecohome.pos0210.data.RefundEntity):FrozenRefundInfo = withContext(Dispatchers.IO){
  val batch=r.batchId?.let{dao.orderBatchById(it)}
  val session=dao.sessionSnapshotById(r.sessionId)
  val table=session?.let{s->dao.allTablesSnapshot().firstOrNull{it.id==s.tableId}?.name}
  val bill=dao.billBySessionId(r.sessionId)
  val payment=bill?.let{dao.paymentByBillId(it.id)}
  val items=r.batchId?.let{dao.batchItems(it).first()}.orEmpty().filter{it.qty>0}.joinToString("\n"){"${it.qty} × ${it.itemNameSnapshot.removePrefix("🎁").trim()}"}
  val people=dao.allEmployeesSnapshot().associate{it.id to it.name}
  FrozenRefundInfo(batch?.let{PaymentFlowRules.orderNoLabel(it.serviceNo)}?:"—",table?:"Trả trước",bill?.billNo?:"—",items.ifBlank{"(không đọc được món)"},people[r.actorId]?:r.actorId,r.approvedBy?.let{people[it]?:it},payment?.paidAt,payment?.reference)
 }
 /** Sửa hình thức thanh toán ghi nhầm (tiền mặt ↔ chuyển khoản). Giữ nguyên bill, món, số tiền; ghi audit kèm lý do. */
 data class LastPaid(val billId:String,val billNo:String,val tableName:String,val method:String,val total:Long,val paidAt:Long,val cashierId:String)
 val lastPaid=MutableStateFlow<LastPaid?>(null)
 fun changePaymentMethod(bill:BillEntity,newMethod:String,reason:String,onDone:(String?)->Unit)=changeMethodCore(bill.id,bill.billNo,bill.total,newMethod,reason,onDone)
 /** Nút "ĐỔI HÌNH THỨC" ngay sau khi thu nhầm: người thu tiền sửa trong vài phút đầu, quản lý sửa bất kỳ lúc nào. Luôn ghi nhật ký. */
 fun quickChangeLastPaid(onDone:(String?)->Unit){
  val lp=lastPaid.value?:return
  val target=if(lp.method=="CASH")"TRANSFER" else "CASH"
  changeMethodCore(lp.billId,lp.billNo,lp.total,target,"Khách đổi ý hình thức thanh toán, sửa ngay sau khi xác nhận",onDone)
 }
 private fun changeMethodCore(billId:String,billNo:String,total:Long,newMethod:String,reason:String,onDone:(String?)->Unit){
  val e=currentEmployee.value
  viewModelScope.launch(Dispatchers.IO){
   fun done(m:String?){viewModelScope.launch(Dispatchers.Main){onDone(m)}}
   if(e==null){done("Chưa đăng nhập");return@launch}
   if(newMethod!="CASH"&&newMethod!="TRANSFER"){done("Hình thức không hợp lệ");return@launch}
   if(reason.isBlank()){done("Bắt buộc ghi lý do");return@launch}
   val pay=dao.paymentByBillId(billId)
   if(pay==null){done("Không tìm thấy thanh toán của bill");return@launch}
   if(!PaymentFixPolicy.canFix(e.role,e.id,pay.cashierId,pay.paidAt,System.currentTimeMillis())){done("Chỉ quản lý được sửa, hoặc người thu tiền trong ${PaymentFixPolicy.WINDOW_MINUTES} phút đầu");return@launch}
   val old=pay.method
   val n=db.withTransaction{
    val changed=dao.changePaymentMethod(billId,newMethod)
    if(changed==1)audit("PAYMENT",billId,"PAYMENT_METHOD_CHANGED","billNo=$billNo,from=$old,to=$newMethod,amount=$total,reason=${reason.trim()},operator=${e.name}")
    changed
   }
   if(n==1){
    lastPaid.value=lastPaid.value?.takeIf{it.billId==billId}?.copy(method=newMethod)
    dao.markCloudDirty();autoBackup();done(null)
   } else done("Không sửa được: bill chưa thanh toán, đã hoàn tiền hoặc đã đúng hình thức này")
  }
 }
 /** Lưu bản chốt số tháng (một dòng cài đặt riêng). Không đụng dữ liệu bán hàng hay chi phí. */
 fun closeShareholderMonth(c:ShareholderMonth.Close){
  if(currentEmployee.value?.role!="ADMIN")return
  viewModelScope.launch(Dispatchers.IO){
   dao.saveSetting(AppSettingEntity(ShareholderMonth.settingKey(c.monthKey),ShareholderMonth.encode(c)))
   audit("REPORT",c.monthKey,"MONTH_CLOSED","net=${c.net},revenue=${c.revenue},operating=${c.operating},additional=${c.additional}")
   autoBackup()
   runCatching{syncFirebase()} // đẩy tháng đã chốt lên cloud ngay để web biết
  }
 }
 fun settleFrozenRefund(id:String,note:String,onDone:(String?)->Unit){
  val e=currentEmployee.value
  viewModelScope.launch(Dispatchers.IO){
   if(e==null||(e.role!="ADMIN"&&e.role!="MANAGER")){withContext(Dispatchers.Main){onDone("Chỉ quản lý được xác nhận đã hoàn CK")};return@launch}
   if(note.isBlank()){withContext(Dispatchers.Main){onDone("Ghi cách hoàn (VD: CK lại 14h20)")};return@launch}
   val n=dao.settleRefund(id,System.currentTimeMillis(),note.trim())
   if(n==1){audit("REFUND",id,"SETTLE_TRANSFER",note.trim());dao.markCloudDirty();autoBackup()}
   withContext(Dispatchers.Main){onDone(if(n==1)null else "Khoản này đã xử lý rồi")}
  }
 }
 fun refundPrepaidOrder(sessionId:String,batchId:String,reason:String,managerPin:String,onDone:(String?)->Unit){
  val e=currentEmployee.value
  viewModelScope.launch(Dispatchers.IO){
   fun fail(m:String){viewModelScope.launch(Dispatchers.Main){onDone(m)}}
   if(e==null||!canCancelOrder()){fail("Không có quyền huỷ đơn");return@launch}
   if(reason.isBlank()){fail("Bắt buộc ghi lý do");return@launch}
   val approver:String?=if(e.role=="ADMIN"||e.role=="MANAGER")e.id else managerPin.takeIf{it.isNotBlank()}?.let{p->dao.employeeByPin(p)?.takeIf{it.role=="ADMIN"||it.role=="MANAGER"}?.id}
   if(managerPin.isNotBlank()&&approver==null){fail("PIN quản lý không đúng");return@launch}
   val result=runCatching{repo.refundPrepaidOrder(sessionId,batchId,reason,e.id,approver)}
   result.onFailure{fail(when(it.message){"MANAGER_APPROVAL_REQUIRED"->"Quá 90 giây · cần quản lý nhập PIN để xác nhận hoàn tiền";"ORDER_ALREADY_REFUNDED_OR_NOT_PAID"->"Đơn đã hoàn tiền rồi";else->"Không hoàn tiền được: ${it.message}"});return@launch}
   dao.markCloudDirty();autoBackup()
   withContext(Dispatchers.Main){onDone(null)}
  }
 }
 fun customerRewards(customerId:String)=dao.availableRewards(customerId)
 fun clearSelectedVoucher(){selectedVoucher.value=null;selectedVoucherItemId.value=null;verifiedVoucher.value=null;voucherMessage.value=""}
 fun sendBatch(){
  val e=currentEmployee.value?:return
  val t=currentTable.value?:return
  if(!e.canSendKitchen&&e.role!="ADMIN")return
  orderMessage.value=""
  val lines=cart.value
  if(selectedVoucher.value!=null){orderMessage.value="ĐỔI VOUCHER ĐÃ TẠM KHÓA";clearSelectedVoucher();return}
  if(lines.isEmpty()&&selectedVoucher.value==null)return
  if(!sending.compareAndSet(false,true))return
  sendingBatch.value=true
  viewModelScope.launch{ try {
   val runningShift=dao.activeShift()
   val sessionScope=currentSession.value?.dataScope?:if(businessTestMode.value)"TEST" else "LIVE"
   if(sessionScope=="LIVE"&&!ShiftRules.canPay(runningShift?.staffId,e.id)){orderMessage.value="ĐANG TRONG CA CỦA ${runningShift?.staffName} · CHỈ ${runningShift?.staffName} ĐƯỢC ORDER";return@launch}
   if(!ShiftRules.canCreateOrder(dao.activeShift()!=null,businessTestMode.value)){orderMessage.value="CHƯA VÀO CA · Bắt đầu ca trước khi gửi order";screen.value="SHIFT_START";return@launch}
   // Sửa đơn trả trước chưa thu: dùng lại đúng phiên cũ (giữ ngày mở bill, bàn), thay món cũ bằng giỏ mới.
   val reuse=editingPrepaid?.takeIf{it.tableId==t.id&&currentSession.value==null}?.let{r->
    withContext(Dispatchers.IO){dao.sessionSnapshotById(r.id)?.takeIf{it.status=="OPEN"&&dao.billBySessionId(it.id)==null}}
   }
   if(editingPrepaid!=null&&reuse==null&&currentSession.value==null){orderMessage.value="ĐƠN CŨ ĐÃ ĐƯỢC THU TIỀN / ĐÓNG Ở NƠI KHÁC · Kiểm tra lại trước khi gửi";resetPrepaidEdit();return@launch}
   val s=currentSession.value ?: reuse?.also{currentSession.value=it} ?: repo.openSession(t.id,e.id,if(businessTestMode.value)"TEST" else "LIVE",orderFlow()).also{currentSession.value=it}
   val bs=dao.batches(s.id).first()
   val replaced=if(reuse!=null)bs.filter{it.status!="CANCELLED"} else emptyList()
   val historical=if(reuse!=null)emptyList() else bs.filter{it.status!="CANCELLED"}.flatMap{dao.batchItems(it.id).first()}
   val its=mutableListOf<OrderItemEntity>()
   // Đơn mở lại: phần món đã phục vụ thành một phiếu riêng (không in bếp), phần gọi thêm in bếp như thường.
   val (servedPart,addedPart)=if(reuse!=null)PrepaidEdit.split(lines,prepaidServed) else (emptyMap<String,Int>() to lines)
   var seq=bs.size+1
   var servedBatch:OrderBatchEntity?=null
   if(servedPart.isNotEmpty()){
    val made=runCatching{repo.createBatch(s.id,seq,e.id,repo.prepareCart(servedPart,cartNotes.value))}
    if(made.isFailure){orderMessage.value="CHƯA GỬI · Menu đã thay đổi hoặc thiếu món. Đơn cũ giữ nguyên; kiểm tra giỏ rồi gửi lại.";return@launch}
    servedBatch=made.getOrThrow();seq+=1
   }
   if(addedPart.isNotEmpty()){
    val prepared=runCatching{repo.prepareCart(addedPart,cartNotes.value)}
    if(prepared.isFailure){servedBatch?.let{dao.cancelBatch(it.id)};orderMessage.value="CHƯA GỬI · Menu đã thay đổi hoặc thiếu món. Kiểm tra giỏ hàng; dữ liệu giỏ được giữ lại.";return@launch}
    its.addAll(prepared.getOrThrow())
   }
   val now=System.currentTimeMillis()
   val voucher=selectedVoucher.value
   val voucherItem=selectedVoucherItemId.value?.let{id->menu.value.firstOrNull{it.id==id&&it.active}}
   val voucherCap=voucher?.let{VoucherPolicy.cap(it.rewardSnapshot)}
   if(voucher!=null&&(voucherItem==null||voucherCap==null||!VoucherPolicy.canRedeem(voucherItem.price,voucherCap,false))){orderMessage.value="VOUCHER KHÔNG CÒN HỢP LỆ · CHỌN LẠI";clearSelectedVoucher();return@launch}
   val existingPromotionIds=historical.mapNotNull{it.buyGetPromotionId}.toSet()
   val candidates=dao.activeBuyGetPromotionsSnapshot()
    .filter{(it.startAt==null||now>=it.startAt)&&(it.endAt==null||now<=it.endAt)}
    .filter{existingPromotionIds.isEmpty()||it.id in existingPromotionIds}
    .mapNotNull { rule ->
     val paidBefore=historical.filter{it.buyGetPromotionId==null&&it.menuItemId==rule.buyMenuItemId}.sumOf{it.qty.coerceAtLeast(0)}
     val paidNow=lines[rule.buyMenuItemId]?:0
     val existingGift=historical.filter{it.buyGetPromotionId==rule.id}.sumOf{it.qty.coerceAtLeast(0)}
     val request=BuyGetPolicy.giftToAdd(BuyGetRule(rule.id,rule.buyMenuItemId,rule.buyQuantity,rule.giftMenuItemId,rule.giftQuantity,rule.repeat,rule.active),paidBefore+paidNow,existingGift)?:return@mapNotNull null
     val gift=menu.value.firstOrNull{it.id==request.menuItemId&&it.active}?:return@mapNotNull null
     Triple(rule,request,gift)
    }
   // A kitchen-issued gift locks the session to its first promotion.
   // Never stack a second campaign in later batches.
   val chosen=if(voucher==null)candidates
    .filter{existingPromotionIds.isEmpty()||it.first.id==existingPromotionIds.first()}
    .maxByOrNull{it.second.quantity.toLong()*it.third.price} else null
   if(chosen!=null){
    val(rule,request,gift)=chosen
    its.add(OrderItemEntity(id="",batchId="",menuItemId=gift.id,itemNameSnapshot="🎁 ${gift.name}",unitPriceSnapshot=gift.price,qty=request.quantity,note="QUÀ TẶNG · ${rule.name}",buyGetPromotionId=rule.id,buyGetLabel=rule.name))
   }
   if(voucher!=null&&voucherItem!=null){its.add(OrderItemEntity(id="",batchId="",menuItemId=voucherItem.id,itemNameSnapshot="🎁 "+voucherItem.name,unitPriceSnapshot=voucherItem.price,qty=1,note="VOUCHER "+VoucherPolicy.code(voucher.id),loyaltyRewardId=voucher.id,loyaltyLabel="Voucher 0210"))}
   val created=if(its.isEmpty())null else {
    val creation=runCatching{repo.createBatch(s.id,seq,e.id,its)}
    if(creation.isFailure){servedBatch?.let{dao.cancelBatch(it.id)};orderMessage.value="CHƯA GỬI · Phiên/menu đã thay đổi. Giữ nguyên giỏ; kiểm tra rồi gửi lại.";return@launch}
    creation.getOrThrow()
   }
   if(created==null&&servedBatch==null){orderMessage.value="GIỎ HÀNG TRỐNG";return@launch}
   if(voucher!=null&&created!=null&&dao.redeemReward(voucher.id,created.id,now)!=1){dao.cancelBatch(created.id);servedBatch?.let{dao.cancelBatch(it.id)};orderMessage.value="VOUCHER ĐÃ ĐƯỢC DÙNG Ở THIẾT BỊ KHÁC";clearSelectedVoucher();return@launch}
   if(voucher!=null&&created!=null)audit("LOYALTY",voucher.id,"VOUCHER_REDEEMED","batch="+created.id+",item="+voucherItem!!.id)
   // Món mới đã lưu xong mới huỷ món cũ: lỗi giữa chừng không bao giờ làm đơn trống.
   if(reuse!=null){
    val before=PrepaidEdit.rebuild(replaced.flatMap{b->dao.batchItems(b.id).first()}.map{PrepaidEdit.Line(it.menuItemId,it.qty,it.note,it.buyGetPromotionId!=null||it.loyaltyRewardId!=null)}).first
    replaced.forEach{dao.cancelBatch(it.id)}
    audit("SESSION",s.id,"PREPAID_EDITED","diff=${PrepaidEdit.diff(before,lines)},served=${servedPart.values.sum()},added=${addedPart.values.sum()},by=${e.name}")
    editingPrepaid=null;prepaidEditNote.value=null
    servedBatchIds=setOfNotNull(servedBatch?.id)
    if(prepaidServed!=null){
     resumedPrepaid.value=true
     prepaidSplitNote.value="Đã sửa đơn · ${servedPart.values.sum()} món cũ coi như đã giao (không in bếp) · ${addedPart.values.sum()} món gọi thêm sẽ in phiếu bếp khi xác nhận thu tiền"
    }
   }
   if(s.flow==PaymentFlowRules.PREPAID)prepaidCartBackup=lines to cartNotes.value
   cart.value=emptyMap();cartNotes.value=emptyMap();clearSelectedVoucher()
   autoBackup()
   screen.value=if(s.flow==PaymentFlowRules.PREPAID)"PAY" else "SENT"
   clearDraft(t.id)
  } finally { sending.set(false); sendingBatch.value=false }
  }
 }
 fun markBatchSent(b:OrderBatchEntity){
  val e=currentEmployee.value?:return
  if(!e.canSendKitchen&&e.role!="ADMIN")return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val job=repo.queueKitchenPrint(b)
   if(job.status=="PRINTED"){
    printerMessage.value="ĐƠN #${b.sequence} ĐÃ IN · Không in lặp"
    if(b.status=="DRAFT") dao.transitionBatch(b.id,"DRAFT","WAITING",job.printedAt ?: System.currentTimeMillis())
    return@launch
   }
   if(job.status=="CLAIMED"){
    printerMessage.value="ĐƠN #${b.sequence} ĐANG ĐƯỢC XỬ LÝ"
    return@launch
   }
   if(job.status=="REVIEW" && e.role!="ADMIN" && e.role!="MANAGER"){
    printerMessage.value="ĐƠN #${b.sequence}: TRẠNG THÁI IN CHƯA XÁC ĐỊNH · Nhờ Admin/Manager kiểm tra giấy trước khi in lại"
    return@launch
   }
   val expected=when(job.status){
    "FAILED" -> "FAILED"
    "REVIEW" -> "REVIEW"
    else -> "PENDING"
   }
   if(!repo.claimPrint(job.id,"ANDROID",expected)){
    printerMessage.value="ĐƠN #${b.sequence} ĐÃ ĐƯỢC THIẾT BỊ KHÁC NHẬN IN"
    return@launch
   }

   if(printerMode()!="BLUETOOTH"){
    val now=System.currentTimeMillis()
    if(repo.finalizeKitchenPrint(job.id,b.id,now)){
     audit("PRINT",b.id,"KITCHEN_TEST_CONFIRMED","operator=${e.name},job=${job.id}")
     printerMessage.value="TEST · Đã xác nhận phiếu bếp #${b.serviceNo.toString().padStart(3,'0')}"
     autoBackup()
    }
    return@launch
   }

   val mac=kitchenPrinterMac()
   if(mac.isBlank()){
    repo.failKitchenPrint(job.id,"NO_PRINTER_SELECTED")
    kitchenPrintFailed.value=kitchenPrintFailed.value+b.id
    audit("PRINT",b.id,"KITCHEN_PRINT_FAILED","reason=NO_PRINTER_SELECTED,operator=${e.name}")
    printerMessage.value="Chưa chọn máy in Bluetooth"
    return@launch
   }
   val table=currentTable.value?.name ?: "Bàn"
   printerMessage.value="Đang in #${b.serviceNo.toString().padStart(3,'0')} · Đơn #${b.sequence}..."
   val profile=printerProfile()
   val result=printKitchenTickets(mac,table,b,e.name,"",profile)
   if(result.isSuccess){
    val now=System.currentTimeMillis()
    if(repo.finalizeKitchenPrint(job.id,b.id,now)){
     kitchenPrintFailed.value=kitchenPrintFailed.value-b.id
     audit("PRINT",b.id,"KITCHEN_PRINTED","printer=${kitchenPrinterName()},operator=${e.name},job=${job.id}")
     printerMessage.value="ĐÃ IN #${b.serviceNo.toString().padStart(3,'0')} · Đơn #${b.sequence}"
     autoBackup()
    }else{
     printerMessage.value="Máy đã in nhưng không chốt được trạng thái PrintJob · Kiểm tra nhật ký"
    }
   }else{
    repo.failKitchenPrint(job.id,result.exceptionOrNull()?.message ?: "UNKNOWN")
    kitchenPrintFailed.value=kitchenPrintFailed.value+b.id
    audit("PRINT",b.id,"KITCHEN_PRINT_FAILED","printer=${kitchenPrinterName()},job=${job.id}")
    printerMessage.value="IN THẤT BẠI · Có thể bấm lại để retry"
   }
  }
 }
 fun reprintKitchenBatch(b:OrderBatchEntity){
  val e=currentEmployee.value?:return
  if(!e.canSendKitchen&&e.role!="ADMIN"&&e.role!="MANAGER"){printerMessage.value="KHÔNG CÓ QUYỀN IN LẠI PHIẾU BẾP";return}
  viewModelScope.launch(Dispatchers.IO){
   if(printerMode()!="BLUETOOTH"){
    val session0=dao.sessionSnapshotById(b.sessionId)
    val tn=session0?.let{s->dao.allTablesSnapshot().firstOrNull{it.id==s.tableId}?.name}?:"Bàn"
    runCatching{showKitchenPreview(b,tn,"${e.name} · IN LẠI","IN LẠI")}
    printerMessage.value="TEST · Không in phiếu bếp";return@launch
   }
   val mac=kitchenPrinterMac();if(mac.isBlank()){printerMessage.value="CHƯA CHỌN MÁY IN BẾP";return@launch}
   val session=dao.sessionSnapshotById(b.sessionId)
   val tableName=session?.let{s->dao.allTablesSnapshot().firstOrNull{it.id==s.tableId}?.name}?:"Bàn"
   val profile=printerProfile()
   val job=PrintJobEntity(UUID.randomUUID().toString(),b.id,null,"KITCHEN_REPRINT",createdAt=System.currentTimeMillis())
   dao.insertPrintJob(job)
   if(!repo.claimPrint(job.id,"ANDROID")){printerMessage.value="KHÔNG NHẬN ĐƯỢC LỆNH IN LẠI";return@launch}
   val result=printKitchenTickets(mac,tableName,b,"${e.name} · IN LẠI","IN LẠI",profile)
   if(result.isSuccess){dao.markPrintSuccess(job.id,System.currentTimeMillis());audit("PRINT",b.id,"KITCHEN_REPRINTED","printer=${kitchenPrinterName()},operator=${e.name},job=${job.id}");printerMessage.value="ĐÃ IN LẠI PHIẾU BẾP #${b.serviceNo}"}
   else{dao.markPrintFailed(job.id,result.exceptionOrNull()?.message?:"UNKNOWN");audit("PRINT",b.id,"KITCHEN_REPRINT_FAILED","job=${job.id}");printerMessage.value="IN LẠI PHIẾU BẾP LỖI · ${result.exceptionOrNull()?.message?:"Thử lại"}"}
  }
 }
 val kitchenPrintFailed=MutableStateFlow<Set<String>>(emptySet())
 val draftBatches=dao.draftBatches().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 /** Máy in lỗi: nhân viên được bỏ qua in phiếu bếp (báo bếp miệng). Đơn vẫn sang CHỜ GIAO, lần in lỗi và việc bỏ qua đều được ghi nhật ký. */
 fun skipKitchenPrintForBatch(b:OrderBatchEntity){
  val e=currentEmployee.value?:return
  if(!e.canSendKitchen&&e.role!="ADMIN"&&e.role!="MANAGER")return
  viewModelScope.launch(Dispatchers.IO){
   if(dao.transitionBatch(b.id,"DRAFT","WAITING",System.currentTimeMillis())==1){
    audit("PRINT",b.id,"KITCHEN_PRINT_SKIPPED","serviceNo=${b.serviceNo},operator=${e.name},printerMsg=${printerMessage.value.take(80)}")
    kitchenPrintFailed.value=kitchenPrintFailed.value-b.id
    printerMessage.value="ĐÃ BỎ QUA IN PHIẾU BẾP #${b.serviceNo.toString().padStart(3,'0')} · báo bếp trực tiếp, đã ghi nhật ký"
    autoBackup()
   }
  }
 }
 /** Đánh dấu giao từng món (cả phần số lượng). Đủ hết món thì đơn tự sang ĐÃ GIAO ĐỦ. */
 fun setItemDelivered(b:OrderBatchEntity,item:OrderItemEntity,qty:Int){
  val e=currentEmployee.value?:return
  viewModelScope.launch(Dispatchers.IO){
   val q=DeliveryRules.clamp(qty,item.qty)
   if(dao.setItemDelivered(item.id,q)!=1)return@launch
   audit("BATCH",b.id,"ITEM_DELIVERY","serviceNo=${b.serviceNo},item=${item.itemNameSnapshot.take(40)},delivered=$q/${item.qty},operator=${e.name}")
   val lines=dao.batchItemsOnce(b.id).map{DeliveryRules.Line(it.qty,it.deliveredQty,it.adjustmentOfItemId!=null)}
   if(b.status=="WAITING"&&DeliveryRules.allDelivered(lines)){
    if(repo.markDeliveredAudited(b,e.id,e.name,"DELIVERED")){printerMessage.value="ĐƠN #${b.serviceNo.toString().padStart(3,'0')} ĐÃ GIAO ĐỦ"}
   }
   autoBackup()
  }
 }
 private val lastDeliveryReminder=mutableMapOf<String,Long>()
 /** Gọi định kỳ: đơn CHỜ GIAO quá thời gian đặt → còi + rung + giọng tiếng Việt. Chỉ đọc dữ liệu trên máy. */
 fun checkDeliveryReminders(){
  if(setting("delivery_remind_on")=="false")return
  val first=setting("delivery_remind_min").toLongOrNull()?.coerceIn(2L,60L)?:8L
  val repeat=setting("delivery_remind_repeat_min").toLongOrNull()?.coerceIn(1L,60L)?:5L
  val speak=setting("delivery_remind_voice")!="false"
  if(currentEmployee.value==null)return
  viewModelScope.launch(Dispatchers.IO){
   val waitingNow=dao.waitingBatches().first()
   if(waitingNow.isEmpty())return@launch
   val now=System.currentTimeMillis()
   val sessionsById=repo.openSessions().first().associateBy{it.id}
   val tablesById=repo.tables().first().associateBy{it.id}
   val pending=waitingNow.mapNotNull{b->
    val s=sessionsById[b.sessionId]?:return@mapNotNull null
    val label=if(s.flow==PaymentFlowRules.PREPAID)"Đơn số ${b.serviceNo}" else (tablesById[s.tableId]?.name?:"Bàn")
    val remaining=DeliveryRules.remaining(dao.batchItemsOnce(b.id).map{DeliveryRules.Line(it.qty,it.deliveredQty,it.adjustmentOfItemId!=null)})
    DeliveryReminder.Pending(b.id,label,b.sentAt?:b.createdAt,remaining)
   }
   val due=DeliveryReminder.due(pending,now,first,repeat,lastDeliveryReminder)
   if(due.isEmpty())return@launch
   due.forEach{lastDeliveryReminder[it.key]=now}
   lastDeliveryReminder.keys.retainAll(waitingNow.map{it.id}.toSet())
   withContext(Dispatchers.Main){DeliveryAnnouncer.announce(getApplication(),DeliveryReminder.speech(due),speak)}
  }
 }
 fun markDelivered(b:OrderBatchEntity){
  val e=currentEmployee.value?:return
  viewModelScope.launch{
   val now=System.currentTimeMillis()
   if(repo.markDeliveredAudited(b,e.id,e.name,"DELIVERED")){
    autoBackup()
   }
  }
 } fun confirmAllDelivered(sessionId:String){
  val e=currentEmployee.value?:return
  viewModelScope.launch{
   val targets=waitingBatches.value.filter{it.sessionId==sessionId}.sortedBy{it.serviceNo}
   targets.forEach{b->
    val now=System.currentTimeMillis()
    repo.markDeliveredAudited(b,e.id,e.name,"DELIVERED_AT_CHECKOUT")
   }
   if(targets.isNotEmpty()){
    printerMessage.value="ĐÃ XÁC NHẬN GIAO ĐỦ ${targets.size} ĐƠN"
    autoBackup()
   }
  }
 }

 fun canCancelOrder():Boolean{val r=currentEmployee.value?.role?:return false;return r=="ADMIN"||r=="MANAGER"||r=="STAFF"}
 fun canDeleteDraft(b:OrderBatchEntity):Boolean{
  val e=currentEmployee.value?:return false
  return DraftOrderPolicy.canDelete(b.status,b.ordererId,e.id,e.role)
 }
 fun deleteDraft(b:OrderBatchEntity){
  val e=currentEmployee.value?:return
  if(!DraftOrderPolicy.canDelete(b.status,b.ordererId,e.id,e.role))return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   if(dao.cancelBatch(b.id)>0){
    audit("BATCH",b.id,"DRAFT_DELETED","operator=${e.name}")
    printerMessage.value="ĐÃ XÓA ĐƠN NHÁP #${b.sequence}"
    autoBackup()
   }
  }
 }
 fun cancelBatch(b:OrderBatchEntity,reason:String){
  val e=currentEmployee.value?:return
  if(!canCancelOrder())return
  if(reason.isBlank())return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   if(dao.cancelBatch(b.id)>0){
    audit("BATCH",b.id,"CANCELLED","reason=${reason.trim()},operator=${e.name}")
    autoBackup()
    if(printerMode()=="BLUETOOTH"&&kitchenPrinterMac().isNotBlank()){
     val table=currentTable.value?.name ?: "Bàn"
     val profile=printerProfile()
     val pr=BluetoothPrinter.printBitmap(getApplication(),kitchenPrinterMac(),ReceiptRenderer.cancel(table,b.sequence,e.name,reason.trim(),profile),profile,vn.ecohome.pos0210.printing.PrintJobType.CANCEL)
     printerMessage.value=if(pr.isSuccess)"ĐÃ IN PHIẾU HỦY · Đơn #${b.sequence}" else "ĐÃ HỦY ĐƠN · In phiếu hủy lỗi: ${pr.exceptionOrNull()?.message}"
    }
   }
  }
 }
 fun correctDeliveredItem(b:OrderBatchEntity,item:OrderItemEntity,removeQty:Int,reason:String){
  val e=currentEmployee.value?:return
  val session=currentSession.value?:return
  if(!canCancelOrder()||b.status!="DELIVERED"||item.qty<=0||item.adjustmentOfItemId!=null||reason.isBlank())return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val correction=runCatching{repo.correctDeliveredItem(session.id,item.id,removeQty,e.id,reason)}.getOrElse{err->
    printerMessage.value=when(err.message){
     "ITEM_NOT_DELIVERED_OR_ADJUSTABLE"->"MÓN KHÔNG CÒN ĐƯỢC PHÉP ĐIỀU CHỈNH"
     "ADJUSTMENT_EXCEEDS_QUANTITY"->"SỐ LƯỢNG ĐIỀU CHỈNH VƯỢT QUÁ MÓN ĐÃ GỌI"
     else->"ĐIỀU CHỈNH LỖI · ${err.message?:"UNKNOWN"}"
    };return@launch
   }
   audit("BATCH",correction.id,"ITEM_CORRECTION_REQUESTED","sourceBatch=${b.id},sourceItem=${item.id},removed=$removeQty,reason=${reason.trim()},operator=${e.name}")
   autoBackup()
   if(printerMode()=="BLUETOOTH"&&kitchenPrinterMac().isNotBlank()){
    val job=repo.queueKitchenPrint(correction)
    if(repo.claimPrint(job.id,"ANDROID",if(job.status=="FAILED")"FAILED" else "PENDING")){
     val table=currentTable.value?.name?:"Bàn"
     val profile=printerProfile()
     val pr=BluetoothPrinter.printBitmap(getApplication(),kitchenPrinterMac(),ReceiptRenderer.kitchen(table,correction.sequence,correction.serviceNo,"${e.name} · ĐIỀU CHỈNH",listOf(Triple(item.itemNameSnapshot,-removeQty,"HỦY/GIẢM MÓN · ${reason.trim()}")),profile),profile,vn.ecohome.pos0210.printing.PrintJobType.KITCHEN)
     if(pr.isSuccess){dao.markPrintSuccess(job.id,System.currentTimeMillis());audit("PRINT",correction.id,"ITEM_CORRECTION_PRINTED","job=${job.id}");printerMessage.value="ĐÃ ĐIỀU CHỈNH ${item.itemNameSnapshot} · ĐÃ IN PHIẾU BẾP"}
     else{dao.markPrintFailed(job.id,pr.exceptionOrNull()?.message?:"UNKNOWN");printerMessage.value="ĐÃ ĐIỀU CHỈNH ${item.itemNameSnapshot} · IN PHIẾU BẾP LỖI"}
    }
   }else printerMessage.value="ĐÃ ĐIỀU CHỈNH ${item.itemNameSnapshot} · Không cấu hình máy in bếp"
  }
 }
 fun releaseCancelledTable(){
  val s=currentSession.value?:return
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"&&e.role!="MANAGER")return
  viewModelScope.launch{
   val bs=dao.batches(s.id).first()
   val remaining=dao.sessionTotal(s.id).first()
   if(bs.isNotEmpty()&&bs.all{it.status=="CANCELLED"}&&remaining==0L){
    repo.closeCancelledSession(s,e.id)
    currentSession.value=null
    currentTable.value=null
    cart.value=emptyMap()
    screen.value="TABLES"
    autoBackup()
   }
  }
 }
 fun batches(id:String)=dao.batches(id)
 fun items(id:String)=dao.batchItems(id)
 fun correctedQty(sourceItemId:String)=dao.sourceCorrectionQtyFlow(sourceItemId)
 fun total(id:String)=dao.sessionTotal(id)
 fun buyGetDiscount(id:String)=dao.sessionBuyGetDiscount(id)
 fun voucherDiscount(id:String)=dao.sessionVoucherDiscount(id)
 fun session(id:String)=dao.sessionById(id)
 fun setCustomerTier(customer:CustomerEntity,tier:String){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"||tier !in listOf("MEMBER","VIP","VVIP"))return
  viewModelScope.launch{
   repo.updateCustomerTierAudited(customer.id,tier,true,e.id,"TIER_MANUAL")
   autoBackup()
  }
 }
 fun setCustomerTierAutomatic(customer:CustomerEntity){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN")return
  viewModelScope.launch{
   val fresh=dao.customerById(customer.id) ?: return@launch
   val auto=setting("loyalty_auto_tier").ifBlank{"true"}.toBoolean()
   val tier=if(auto)autoTierFor(fresh.points) else fresh.tier
   repo.updateCustomerTierAudited(fresh.id,tier,false,e.id,"TIER_AUTO")
   autoBackup()
  }
 }
 private fun autoTierFor(points:Int):String{
  val vip=setting("vip_min_points").toIntOrNull() ?: 200
  val vvip=setting("vvip_min_points").toIntOrNull() ?: 500
  return when{
   points>=vvip -> "VVIP"
   points>=vip -> "VIP"
   else -> "MEMBER"
  }
 }
 fun updateCustomerProfile(customer:CustomerEntity,name:String,phone:String,address:String){
  val e=currentEmployee.value?:return
  viewModelScope.launch{
   val normalized=phone.filter(Char::isDigit).take(15)
   if(normalized.length<9){customerUpdateMessage.value="Số điện thoại không hợp lệ";return@launch}
   val other=dao.customerByPhone(normalized)
   if(other!=null&&other.id!=customer.id){customerUpdateMessage.value="Số điện thoại đã thuộc khách khác";return@launch}
   val changed=runCatching {
    repo.updateCustomerProfileAudited(customer.id,name.trim(),normalized,address.trim(),e.id)
   }.getOrElse {
    customerUpdateMessage.value="Không cập nhật được hồ sơ: ${it.message ?: "UNKNOWN"}"
    return@launch
   }
   if(!changed){customerUpdateMessage.value="Không tìm thấy hồ sơ khách để cập nhật";return@launch}
   customerUpdateMessage.value="Đã cập nhật thông tin khách"
   autoBackup()
  }
 }
 fun softDeleteCustomer(customer:CustomerEntity){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"){customerUpdateMessage.value="Chỉ Admin được ẩn hồ sơ khách";return}
  viewModelScope.launch{
   val changed=repo.softDeleteCustomerAudited(customer.id,e.id)
   customerUpdateMessage.value=if(changed)"Đã ẩn khách khỏi danh sách; lịch sử bill được giữ nguyên" else "Không thể ẩn khách"
   if(changed){autoBackup();syncFirebase()}
  }
 }
 fun clearCustomerUpdateMessage(){customerUpdateMessage.value=""}
 fun customerPoints(id:String)=dao.customerPoints(id)
 fun purchaseItems(id:String)=dao.purchaseItems(id)
 fun comboItems(id:String)=dao.comboItems(id)
 fun deleteBill(bill:BillEntity,reason:String){
  deleteBills(listOf(bill),reason)
 }
 fun deletePurchase(p:PurchaseEntity,reason:String){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"||reason.isBlank())return
  viewModelScope.launch{
   val line=dao.purchaseItemsSnapshot(p.id).firstOrNull()
   val linkedAssetId=line?.let{l->assets.value.firstOrNull{assetMatchesPurchaseSignature(it,p,l.name)}?.id}
   if(repo.deletePurchaseAudited(p,reason,e.id,linkedAssetId)){
    queueExpenseReceiptSync(p.id)
    autoBackup()
   }
  }
 }
 fun deleteBills(targets:List<BillEntity>,reason:String){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"||reason.isBlank()||targets.isEmpty())return
  viewModelScope.launch{
   val changed=repo.deleteBillsAtomic(
    targets=targets,
    reason=reason,
    actorId=e.id,
    autoTier=setting("loyalty_auto_tier").ifBlank{"true"}.toBoolean(),
    vipMinPoints=setting("vip_min_points").toIntOrNull() ?: 200,
    vvipMinPoints=setting("vvip_min_points").toIntOrNull() ?: 500
   )
   if(changed>0) autoBackup()
  }
 }
 fun exportTransactionExcel(from:Long?,toExclusive:Long?,payer:String?,cashier:String?,onReady:(android.net.Uri,String)->Unit,onError:(String)->Unit){
 val e=currentEmployee.value
 if(e==null){onError("Chưa đăng nhập tài khoản");return}
 if(e.role!="ADMIN"&&!e.canViewReport){onError("Tài khoản không có quyền xem/xuất báo cáo");return}
 viewModelScope.launch(Dispatchers.IO){
  val result=runCatching{
   val file=vn.ecohome.pos0210.data.TransactionExcelExport.create(getApplication(),dao,vn.ecohome.pos0210.data.TransactionExcelExport.Filter(from,toExclusive,payer,cashier))
   vn.ecohome.pos0210.data.TransactionExcelExport.uri(getApplication(),file) to file.name
  }
  kotlinx.coroutines.withContext(Dispatchers.Main){
   result.onSuccess{(uri,name)->onReady(uri,name)}
    .onFailure{onError("Xuất Excel lỗi: "+(it.message?:"không xác định"))}
  }
 }
}
fun exportAiBusinessData(onReady:(android.net.Uri,String)->Unit){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"&&!e.canViewReport){printerMessage.value="KHÔNG CÓ QUYỀN XUẤT DỮ LIỆU";return}
  viewModelScope.launch(Dispatchers.IO){
   runCatching{
    val file=AiBusinessExport.create(getApplication(),dao)
    AiBusinessExport.uri(getApplication(),file) to file.name
   }.onSuccess{(uri,name)->
    printerMessage.value="ĐÃ TẠO $name"
    kotlinx.coroutines.withContext(Dispatchers.Main){onReady(uri,name)}
   }.onFailure{printerMessage.value="XUẤT DỮ LIỆU LỖI · ${it.message?:"UNKNOWN"}"}
  }
 }
 fun resetPreOpeningData(){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"){printerMessage.value="CHỈ ADMIN ĐƯỢC XÓA DỮ LIỆU BÁN THỬ";return}
  viewModelScope.launch(Dispatchers.IO){
   // Require a verified backup before touching sales and attendance records.
   val backupRoot=setting("storage_root_uri")
   if(backupRoot.isBlank() || setting("storage_write_enabled")=="false"){
    printerMessage.value="CHƯA DỌN DỮ LIỆU · Hãy chọn thư mục backup và bật quyền ghi trước."
    return@launch
   }
   val backupResult=DataBackup.backupLatest(getApplication(),backupRoot,includeMedia=false)
   if(backupResult.isFailure){
    printerMessage.value="CHƯA DỌN DỮ LIỆU · Backup thất bại: ${backupResult.exceptionOrNull()?.message}"
    return@launch
   }
   val result=repo.resetPreOpeningData(
    actorId=e.id,
    autoTier=setting("loyalty_auto_tier").ifBlank{"true"}.toBoolean(),
    vipMinPoints=setting("vip_min_points").toIntOrNull() ?: 200,
    vvipMinPoints=setting("vvip_min_points").toIntOrNull() ?: 500
   )
   myAttendance.value=null
   refreshPayroll()
   audit("SYSTEM","PREOPENING_DATA","RESET_PREOPENING_DATA","bills=${result.bills},attendance=${result.attendance},operator=${e.name}")
   autoBackup()
   syncFirebase()
   printerMessage.value="ĐÃ DỌN DỮ LIỆU TRƯỚC KHAI TRƯƠNG · ${result.bills} BILL · ${result.attendance} CA CÔNG"
  }
 }
 fun setCheckoutPrintTestMode(enabled:Boolean){
  val employee=currentEmployee.value
  if(employee?.role!="ADMIN"){checkoutPrintTestMode.value=false;return}
  checkoutPrintTestMode.value=enabled
  if(!enabled)printedCheckoutKey.value=null
 }
 fun confirmCheckoutBillTest(preview:PricingPreview,qrInfo:String){
  val session=currentSession.value?:return
  val employee=currentEmployee.value?:return
  if(employee.role!="ADMIN"){printerMessage.value="CHỈ ADMIN ĐƯỢC DÙNG BILL TEST";return}
  if(!checkoutPrintTestMode.value){printerMessage.value="CHẾ ĐỘ BILL TEST CHƯA BẬT";return}
  printedCheckoutKey.value=CheckoutPrintPolicy.key(session.id,preview.total,qrInfo)
  viewModelScope.launch(Dispatchers.IO){
   audit("PRINT",session.id,"PREPAY_BILL_TEST_BYPASS","operator=${employee.name},amount=${preview.total}")
  }
  printerMessage.value="BILL TEST · KHÔNG IN THẬT · Có thể kiểm thử bước xác nhận thanh toán"
 }

 fun printCheckoutBill(preview:PricingPreview,qrInfo:String,customerName:String="",print:Boolean=true){
  val session=currentSession.value?:return
  val table=currentTable.value?:return
  val printKey=CheckoutPrintPolicy.key(session.id,preview.total,qrInfo)
  if(print){printedCheckoutKey.value=null;checkoutPrintAttemptedKey.value=printKey;checkoutPrinting.value=true;viewModelScope.launch(Dispatchers.IO){audit("PRINT",session.id,"CHECKOUT_BILL_PRINT_PRESSED","amount=${preview.total},operator=${currentEmployee.value?.name.orEmpty()}")}}
  viewModelScope.launch(Dispatchers.IO){
   try {
   val batches=dao.batches(session.id).first().filter{it.status!="CANCELLED"}
   val lines=mutableListOf<Triple<String,Int,Long>>()
   batches.forEach{batch->dao.batchItems(batch.id).first().forEach{item->lines.add(Triple(item.itemNameSnapshot,item.qty,item.unitPriceSnapshot))}}
   val qrConfigured=isQrConfigured()
   val qr=if(qrConfigured)qrBitmap(preview.total,qrInfo) else null
   if(qrConfigured&&qr==null)printerMessage.value="VIETQR LỖI · Bill vẫn được in để thanh toán tiền mặt"
   val now=System.currentTimeMillis()
   val period="${java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(java.util.Date(session.openedAt))}–${java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(java.util.Date(now))}"
   val adjustments=buildList{
    preview.surchargeRules.forEach{rule->add("PHỤ THU ${rule.name}  +${rule.percent}%")}
    preview.discountRule?.let{rule->add("ƯU ĐÃI ${rule.name}${if(rule.code.isNotBlank()) " · ${rule.code}" else ""}  -${rule.percent}%")}
    preview.buyGetLabel?.let{label->add("ƯU ĐÃI $label  · quà tặng -${java.text.NumberFormat.getNumberInstance(java.util.Locale("vi","VN")).format(preview.buyGetDiscount)+"đ"}")}
   }
   val profile=printerProfile()
   val orderTag=if(session.flow==PaymentFlowRules.PREPAID)batches.firstOrNull()?.let{"ĐƠN "+PaymentFlowRules.orderNoLabel(it.serviceNo)} else null
   val bitmap=ReceiptRenderer.bill(table.name,period,lines,preview.subtotal,preview.surcharge,preview.discount,preview.total,adjustments,customerName.ifBlank{"KHÁCH LẠ"},null,0,0,0,"CHƯA XÁC NHẬN",qr,profile,orderTag)
   checkoutBillImage.value=printKey to bitmap
   if(!print){if(session.flow==PaymentFlowRules.PREPAID)checkoutPrintAttemptedKey.value=printKey;return@launch}
   if(printerMode()!="BLUETOOTH"||receiptPrinterMac().isBlank()){printerMessage.value="IN BILL LỖI · Chưa cấu hình máy in. Bill vẫn hiện trên màn hình để khách quét QR";audit("PRINT",session.id,"CHECKOUT_BILL_PRINT_FAILED","reason=NO_PRINTER,amount=${preview.total},operator=${currentEmployee.value?.name.orEmpty()}");return@launch}
   val job=PrintJobEntity(UUID.randomUUID().toString(),null,null,"BILL_PREPAY",createdAt=now)
   dao.insertPrintJob(job)
   if(repo.claimPrint(job.id,"ANDROID")){
    val result=BluetoothPrinter.printBitmap(getApplication(),receiptPrinterMac(),bitmap,profile,vn.ecohome.pos0210.printing.PrintJobType.PAYMENT)
    if(result.isSuccess){
     dao.markPrintSuccess(job.id,System.currentTimeMillis());printedCheckoutKey.value=printKey
     audit("PRINT",session.id,"PREPAY_BILL_PRINTED","printer=${receiptPrinterName()},job=${job.id},amount=${preview.total}")
     printerMessage.value="ĐÃ IN BILL · Chờ khách kiểm tra và thanh toán"
    }else{dao.markPrintFailed(job.id,result.exceptionOrNull()?.message?:"UNKNOWN");audit("PRINT",session.id,"CHECKOUT_BILL_PRINT_FAILED","job=${job.id},reason=${result.exceptionOrNull()?.message.orEmpty().take(80)},amount=${preview.total},operator=${currentEmployee.value?.name.orEmpty()}");printerMessage.value="IN BILL LỖI · ${result.exceptionOrNull()?.message?:"Thử in lại"} · vẫn xác nhận thu tiền được, hệ thống đã ghi lại lần in lỗi"}
   }
   } finally { if(print)checkoutPrinting.value=false }
  }
 }
 fun reprintPaidBill(billId:String){
  val employee=currentEmployee.value?:return
  if(!employee.canCheckout&&employee.role!="ADMIN"){printerMessage.value="KHÔNG CÓ QUYỀN IN LẠI BILL";return}
  viewModelScope.launch(Dispatchers.IO){
   if(printerMode()!="BLUETOOTH"||receiptPrinterMac().isBlank()){printerMessage.value="CHƯA CẤU HÌNH MÁY IN BILL";return@launch}
   val bill=dao.billById(billId)?:run{printerMessage.value="KHÔNG TÌM THẤY BILL";return@launch}
   if(bill.status!="PAID"){printerMessage.value="CHỈ IN LẠI BILL ĐÃ THANH TOÁN";return@launch}
   val session=dao.sessionSnapshotById(bill.sessionId)?:run{printerMessage.value="THIẾU DỮ LIỆU PHIÊN BÁN";return@launch}
   val tableName=dao.allTablesSnapshot().firstOrNull{it.id==session.tableId}?.name?:"Bàn"
   val batches=dao.batches(session.id).first().filter{it.status!="CANCELLED"}
   val lines=mutableListOf<Triple<String,Int,Long>>()
   batches.forEach{batch->dao.batchItems(batch.id).first().forEach{item->lines.add(Triple(item.itemNameSnapshot,item.qty,item.unitPriceSnapshot))}}
   val adjustments=dao.adjustmentsByBillId(bill.id)
   val surcharge=adjustments.filter{it.kind=="SURCHARGE"}.sumOf{it.amount}
   val discount=adjustments.filter{it.kind=="DISCOUNT"}.sumOf{kotlin.math.abs(it.amount)}
   val adjustmentLines=mutableListOf("BẢN IN LẠI · ${bill.billNo}")
   adjustments.forEach{a->adjustmentLines.add(when(a.kind){"SURCHARGE"->"PHỤ THU ${a.name}  +${a.percent}%";"DISCOUNT"->"ƯU ĐÃI ${a.name}  -${a.percent}%";else->a.name})}
   val payment=dao.paymentByBillId(bill.id)
   val method=when(payment?.method){"CASH"->"TIỀN MẶT";"TRANSFER"->"CHUYỂN KHOẢN";null->"ĐÃ THANH TOÁN";else->payment.method}
   val customer=bill.customerId?.let{dao.customerById(it)}
   val period="${java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(java.util.Date(bill.openedAt))}–${java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(java.util.Date(bill.closedAt?:bill.openedAt))}"
   val profile=printerProfile()
   val bitmap=ReceiptRenderer.bill(tableName,period,lines,bill.subtotal,surcharge,discount,bill.total,adjustmentLines,customer?.name?.ifBlank{"KHÁCH THÀNH VIÊN"}?:"KHÁCH LẠ",customer?.tier,0,0,customer?.points?:0,method,null,profile)
   val now=System.currentTimeMillis()
   val job=PrintJobEntity(UUID.randomUUID().toString(),null,bill.id,"BILL_REPRINT",createdAt=now)
   dao.insertPrintJob(job)
   if(repo.claimPrint(job.id,"ANDROID")){
    val result=BluetoothPrinter.printBitmap(getApplication(),receiptPrinterMac(),bitmap,profile,vn.ecohome.pos0210.printing.PrintJobType.PAYMENT)
    if(result.isSuccess){dao.markPrintSuccess(job.id,System.currentTimeMillis());audit("PRINT",bill.id,"BILL_REPRINTED","printer=${receiptPrinterName()},job=${job.id},operator=${employee.id}");printerMessage.value="ĐÃ IN LẠI · ${bill.billNo}"}
    else{dao.markPrintFailed(job.id,result.exceptionOrNull()?.message?:"UNKNOWN");audit("PRINT",bill.id,"BILL_REPRINT_FAILED","job=${job.id}");printerMessage.value="IN LẠI LỖI · ${result.exceptionOrNull()?.message?:"Thử lại"}"}
   }
  }
 }
 private suspend fun printLoyaltyVoucher(reward:CustomerRewardEntity,customer:CustomerEntity?){
  val cap=VoucherPolicy.cap(reward.rewardSnapshot)?:return
  if(printerMode()!="BLUETOOTH"||receiptPrinterMac().isBlank()){printerMessage.value="VOUCHER ĐÃ LƯU · CẦN CẤU HÌNH MÁY IN ĐỂ IN PHIẾU";return}
  if(dao.voucherPrintJob(reward.id)!=null)return
  val code=VoucherPolicy.code(reward.id)
  val expiry=reward.expiresAt?.let{SimpleDateFormat("dd/MM/yyyy",Locale("vi","VN")).format(Date(it))}?:"KHÔNG HẠN"
  val lines=listOf(Triple("VOUCHER "+code,1,cap))
  val notes=listOf("ĐỔI 01 MÓN TỐI ĐA "+java.text.NumberFormat.getNumberInstance(Locale("vi","VN")).format(cap)+"đ","KHÔNG QUY ĐỔI TIỀN MẶT · KHÔNG TIỀN THỪA","HẠN DÙNG: "+expiry,"ĐƯA PHIẾU HOẶC ĐỌC MÃ KHI ĐỔI QUÀ")
  val profile=printerProfile()
  val bitmap=ReceiptRenderer.bill("PHIẾU VOUCHER",SimpleDateFormat("HH:mm dd/MM",Locale("vi","VN")).format(Date(reward.earnedAt)),lines,cap,0L,cap,0L,notes,customer?.name?.ifBlank{"KHÁCH THÂN THIẾT"}?:"KHÁCH THÂN THIẾT",null,0,0,0,"VOUCHER 0210",null,profile)
  val job=PrintJobEntity(UUID.randomUUID().toString(),reward.id,reward.sourceBillId,"VOUCHER",createdAt=System.currentTimeMillis())
  dao.insertPrintJob(job)
  if(repo.claimPrint(job.id,"ANDROID")){
   val result=BluetoothPrinter.printBitmap(getApplication(),receiptPrinterMac(),bitmap,profile,vn.ecohome.pos0210.printing.PrintJobType.PAYMENT)
   if(result.isSuccess){dao.markPrintSuccess(job.id,System.currentTimeMillis());audit("LOYALTY",reward.id,"VOUCHER_PRINTED","code="+code)}
   else{dao.markPrintFailed(job.id,result.exceptionOrNull()?.message?:"UNKNOWN");printerMessage.value="VOUCHER ĐÃ LƯU NHƯNG IN LỖI · CÓ THỂ IN LẠI"}
  }
 }
 fun close(method:String,preview:PricingPreview,qrInfo:String,customerPhone:String="",customerName:String="",loyaltyRewardId:String?=null,cashReceived:Long?=null){
  val session=currentSession.value?:return
  val employee=currentEmployee.value?:return
  val table=currentTable.value
  if(!employee.canCheckout&&employee.role!="ADMIN")return
  val runningShift=activeShift.value
  if(session.dataScope=="LIVE"&&!ShiftRules.canPay(runningShift?.staffId,employee.id)){printerMessage.value="ĐANG TRONG CA CỦA ${runningShift?.staffName} · CHỈ ${runningShift?.staffName} ĐƯỢC THANH TOÁN (hoặc chờ ra ca)";return}
  val prepaidCash=session.flow==PaymentFlowRules.PREPAID&&method=="CASH"
  if(method=="CASH"&&!PaymentFlowRules.canConfirmCash(session.flow,preview.total,cashReceived)){printerMessage.value="KHÁCH ĐƯA CHƯA ĐỦ TIỀN";return}
  val skipKitchen=resumedPrepaid.value&&skipKitchenPrint.value
  val checkoutKey=CheckoutPrintPolicy.key(session.id,preview.total,qrInfo)
  if(!CheckoutPrintPolicy.canConfirm(checkoutKey,printedCheckoutKey.value,checkoutPrintAttemptedKey.value)){printerMessage.value="BILL/QR ĐÃ THAY ĐỔI · VUI LÒNG IN LẠI TRƯỚC KHI XÁC NHẬN";return}
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val pendingPaymentSession=dao.activePaymentSessionSnapshot(session.id)
   val commit=runCatching {
    repo.completePayment(
     session=session,
     preview=preview,
     method=method,
     cashierId=employee.id,
     billNo="0210-${System.currentTimeMillis().toString().takeLast(6)}",
     customerPhone=customerPhone,
     customerName=customerName,
     autoTier=setting("loyalty_auto_tier").ifBlank{"true"}.toBoolean(),
     vipMinPoints=setting("vip_min_points").toIntOrNull() ?: 200,
     vvipMinPoints=setting("vvip_min_points").toIntOrNull() ?: 500,
     loyaltyRewardId=loyaltyRewardId,
     pointUnitVnd=setting("loyalty_vnd_per_point").toLongOrNull() ?: 10000L,
     // Lưu tiền khách đưa / tiền thối cho mọi bill tiền mặt có nhập (trả sau không bắt buộc nhập): đối soát tiền mặt chính xác hơn.
     cashReceived=if(method=="CASH")cashReceived else null,
     change=if(method=="CASH")cashReceived?.let{PaymentFlowRules.change(preview.total,it)} else null
    )
   }.getOrElse { err ->
    printerMessage.value=when(err.message){
     "SESSION_ALREADY_CLOSED_OR_CHANGED" -> "BILL ĐÃ ĐƯỢC THANH TOÁN / BÀN ĐÃ ĐÓNG · Không ghi bill lần 2"
     "PENDING_ORDER_NOT_COMPLETED" -> "CÒN ĐƠN CHƯA HOÀN TẤT · Gửi bếp và xác nhận giao đủ trước khi thanh toán"
     "ORDER_TOTAL_CHANGED" -> "ĐƠN VỪA THAY ĐỔI · Quay lại kiểm tra món trước khi thanh toán"
     else -> "THANH TOÁN LỖI · ${err.message ?: "UNKNOWN"}"
    }
    return@launch
   }
   val bill=commit.bill
   // Nhật ký nhạy cảm: bill có giảm giá (chương trình, voucher, mua X tặng Y) ghi ai thu, giảm bao nhiêu. Chỉ ghi thêm, không đổi bill.
   if(preview.discount>0L&&session.dataScope=="LIVE")runCatching{audit("BILL",bill.id,"DISCOUNT_APPLIED","bill=${bill.billNo},subtotal=${preview.subtotal},discount=${preview.discount},total=${preview.total},rule=${preview.discountRule?.name.orEmpty()},auto=${preview.discountRule?.autoApply==true&&preview.buyGetDiscount==0L},method=$method")}
   if(session.flow==PaymentFlowRules.PREPAID){val t0=System.currentTimeMillis();dao.batches(session.id).first().filter{it.status=="DRAFT"}.forEach{dao.transitionBatch(it.id,"DRAFT","WAITING",t0)}}
   if(method=="TRANSFER"&&pendingPaymentSession!=null)dao.confirmPaymentSession(pendingPaymentSession.id,bill.id)
   else dao.cancelPaymentSessions(session.id)
   val customer=commit.customer
   val pointsBefore=commit.pointsBefore
   val pointsEarned=commit.pointsEarned
   val pointsAfter=commit.pointsAfter
   val receiptTier=commit.tier
   val issuedRewards=if(session.dataScope=="LIVE"&&bill.customerId!=null)repo.evaluateLoyalty(bill.customerId,bill.id) else emptyList()
   if(issuedRewards.isNotEmpty()){audit("LOYALTY",bill.id,"REWARD_ISSUED","count=${issuedRewards.size},customer=${bill.customerId}");issuedRewards.forEach{printLoyaltyVoucher(it,customer)};printerMessage.value="ĐÃ PHÁT HÀNH "+issuedRewards.size+" VOUCHER · "+issuedRewards.joinToString(", "){VoucherPolicy.code(it.id)}+" · KIỂM TRA PHIẾU IN"}
   autoBackup()
   if(false&&printerMode()=="BLUETOOTH"&&printerMac().isNotBlank()){
    val bs=dao.batches(session.id).first().filter{it.status!="CANCELLED"}
    val lines=mutableListOf<Triple<String,Int,Long>>()
    bs.forEach{b->dao.batchItems(b.id).first().forEach{it2->lines.add(Triple(it2.itemNameSnapshot,it2.qty,it2.unitPriceSnapshot))}}
    val info="0210 ${table?.name ?: bill.billNo}"
    val qr:android.graphics.Bitmap?=null
    val period="${java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(java.util.Date(session.openedAt))}–${java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(java.util.Date(bill.closedAt ?: System.currentTimeMillis()))}"
    val receiptAdjustments=buildList {
     preview.surchargeRules.forEach{rule->add("PHỤ THU ${rule.name}  +${rule.percent}%")}
     preview.discountRule?.let{rule->
      add("ƯU ĐÃI ${rule.name}${if(rule.code.isNotBlank()) " · ${rule.code}" else ""}  -${rule.percent}%")
     }
     preview.buyGetLabel?.let{label->add("ƯU ĐÃI $label  · quà tặng -${java.text.NumberFormat.getNumberInstance(java.util.Locale("vi","VN")).format(preview.buyGetDiscount)+"đ"}")}
    }
    val profile=printerProfile()
    val bmp=ReceiptRenderer.bill(
     table=table?.name ?: "Bàn",
     period=period,
     items=lines,
     subtotal=preview.subtotal,
     surcharge=preview.surcharge,
     discount=preview.discount,
     total=preview.total,
     adjustmentLines=receiptAdjustments,
     customerName=customer?.name?.ifBlank{"KHÁCH THÀNH VIÊN"} ?: "KHÁCH LẠ",
     customerTier=receiptTier,
     pointsBefore=pointsBefore,
     pointsEarned=pointsEarned,
     pointsAfter=pointsAfter,
     method=if(method=="CASH")"TIỀN MẶT"+(cashReceived?.let{" · đưa ${java.text.NumberFormat.getNumberInstance(java.util.Locale("vi","VN")).format(it)}đ · thối ${java.text.NumberFormat.getNumberInstance(java.util.Locale("vi","VN")).format(PaymentFlowRules.change(preview.total,it)?:0L)}đ"}?:"") else "CHUYỂN KHOẢN · ĐÃ NHẬN",
     qr=qr,
     profile=profile,
     orderTag=bs.firstOrNull()?.let{"ĐƠN "+PaymentFlowRules.orderNoLabel(it.serviceNo)}
    )
    val job=PrintJobEntity(java.util.UUID.randomUUID().toString(),null,bill.id,"BILL",createdAt=System.currentTimeMillis())
    dao.insertPrintJob(job)
    if(repo.claimPrint(job.id,"ANDROID")){
     val pr=BluetoothPrinter.printBitmap(getApplication(),receiptPrinterMac(),bmp,profile,vn.ecohome.pos0210.printing.PrintJobType.PAYMENT)
     if(pr.isSuccess){
      dao.markPrintSuccess(job.id,System.currentTimeMillis())
      audit("PRINT",bill.id,"BILL_PRINTED","printer=${receiptPrinterName()},job=${job.id}")
      printerMessage.value="ĐÃ IN BILL · ${bill.billNo}"
     }else{
      dao.markPrintFailed(job.id,pr.exceptionOrNull()?.message ?: "UNKNOWN")
      audit("PRINT",bill.id,"BILL_PRINT_FAILED","printer=${printerName()},job=${job.id}")
      printerMessage.value="ĐÃ THANH TOÁN · IN BILL LỖI: ${pr.exceptionOrNull()?.message ?: "Thử in lại"}"
     }
    }
   }
   if(session.flow==PaymentFlowRules.PREPAID&&skipKitchen){
    // Đơn mở lại từ danh sách chưa thu tiền và bếp đã làm theo lời: không in phiếu bếp, đánh dấu đã giao.
    dao.batches(session.id).first().filter{it.status=="WAITING"}.forEach{repo.markDeliveredAudited(it,employee.id,employee.name,"DELIVERED")}
    audit("SESSION",session.id,"KITCHEN_SKIPPED_VERBAL","operator=${employee.name}")
   } else if(session.flow==PaymentFlowRules.PREPAID){
    // Đơn mở lại đã sửa: phần món cũ bếp đã làm theo lời → đánh dấu đã giao, chỉ in phiếu bếp phần gọi thêm.
    val served=servedBatchIds
    if(served.isNotEmpty()){
     dao.batches(session.id).first().filter{it.id in served&&it.status=="WAITING"}.forEach{repo.markDeliveredAudited(it,employee.id,employee.name,"DELIVERED")}
     audit("SESSION",session.id,"KITCHEN_SKIPPED_SERVED","batches=${served.size},operator=${employee.name}")
    }
    // Đơn đã ghi. Giữ màn hình ở lại cho tới khi in xong; lỗi thì để nhân viên chọn in lại hoặc tự báo bếp.
    // Chỉ chặn màn hình tối đa 5 giây. Máy in chậm hoặc lỗi thì đơn vẫn xong, app báo cảnh báo và cho order khách tiếp theo.
    kitchenOverlayOn=true
    val kitchenJob=kotlinx.coroutines.CoroutineScope(Dispatchers.IO).async(Dispatchers.IO){runPaidKitchenPrint(session.id,table?.name?:"Trả trước",employee.name)}
    kotlinx.coroutines.withTimeoutOrNull(5000L){kitchenJob.await()}
    kitchenOverlayOn=false
   }
   lastPaid.value=LastPaid(bill.id,bill.billNo,table?.name?:"Trả trước",method,preview.total,System.currentTimeMillis(),employee.id)
   withContext(Dispatchers.Main){leavePaidOrder()}
  }
 }
}
