package vn.ecohome.pos0210
import android.app.Application
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.room.withTransaction
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.Job
import vn.ecohome.pos0210.cloud.*
import vn.ecohome.pos0210.data.*
import vn.ecohome.pos0210.printing.PrinterText
import vn.ecohome.pos0210.printing.BluetoothPrinter
import vn.ecohome.pos0210.printing.ReceiptRenderer
import vn.ecohome.pos0210.payment.VietQrOffline
import java.util.UUID
import java.security.SecureRandom
class PosViewModel(app:Application):AndroidViewModel(app){
 private val db=PosDatabase.get(app);private val repo=PosRepository(db);private val dao=db.dao();private val masterMutex=Mutex()
 val monthlyAccounting=dao.monthlyAccounting().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val profitPartners=dao.profitPartners().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val tableServiceTimings=dao.tableServiceTimings().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val areas=repo.areas().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val tables=repo.tables().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val waitingBatches=dao.waitingBatches().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val categories=repo.categories().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val menu=repo.menuItems().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val combos=dao.combos().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val employees=repo.employees().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val sessions=repo.openSessions().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val bills=repo.paidBills().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val suppliers=dao.suppliers().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val purchases=dao.purchases().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val purchaseCosts=dao.purchaseCosts().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val purchaseCategories=dao.purchaseCategories().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val costCodes=dao.costCodes().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val purchaseItemsAll=dao.allPurchaseItems().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val payments=dao.payments().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val customers=dao.customers().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val customerItemStats=dao.customerItemStats().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val pricingRules=dao.pricingRules().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val billAdjustments=dao.billAdjustments().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val settings=dao.settings().stateIn(viewModelScope,SharingStarted.Eagerly,emptyList());val printJobs=dao.printJobs().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val audits=dao.audits().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val itemSales=dao.paidItemSales().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val healthIssues=MutableStateFlow<List<String>>(emptyList());val healthMessage=MutableStateFlow("Chưa kiểm tra");val customerUpdateMessage=MutableStateFlow("");val cartNotes=MutableStateFlow<Map<String,String>>(emptyMap());val cart=MutableStateFlow<Map<String,Int>>(emptyMap());val currentTable=MutableStateFlow<DiningTableEntity?>(null);val currentSession=MutableStateFlow<TableSessionEntity?>(null);val currentEmployee=MutableStateFlow<EmployeeEntity?>(null);val authError=MutableStateFlow("");val screen=MutableStateFlow("LOGIN");val printerPreview=MutableStateFlow("");val printerMessage=MutableStateFlow("");val printedCheckoutKey=MutableStateFlow<String?>(null)
 val recentBankNotifications=dao.recentBankNotifications().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val assetCategories=dao.assetCategories().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val assets=dao.assets().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val assetValuations=dao.assetValuations().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val financialMovements=dao.financialMovements().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val openingCashAdjustments=dao.openingCashAdjustments().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList())
 val cloudSyncState=dao.cloudSyncState().stateIn(viewModelScope,SharingStarted.Eagerly,null)
 val cloudMessage=MutableStateFlow("");val cloudDashboard=MutableStateFlow(CloudDashboard());private var cloudDashboardJob:Job?=null
 init{viewModelScope.launch{bootstrap()}}
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
 fun login(pin:String){viewModelScope.launch{val e=dao.employeeByPin(pin);if(e==null)authError.value="PIN không đúng" else{currentEmployee.value=e;authError.value="";screen.value="TABLES";audit("AUTH",e.id,"LOGIN")}}};fun logout(){val e=currentEmployee.value;viewModelScope.launch{if(e!=null)audit("AUTH",e.id,"LOGOUT")};currentEmployee.value=null;screen.value="LOGIN"}
 private suspend fun audit(type:String,id:String,action:String,payload:String=""){dao.audit(AuditEventEntity(UUID.randomUUID().toString(),type,id,action,currentEmployee.value?.id,"ANDROID",System.currentTimeMillis(),payload))}
 private fun autoBackup(){
  val root=setting("storage_root_uri")
  if(root.isNotBlank()&&setting("storage_write_enabled")!="false") DataBackup.backupLatest(getApplication(),root,includeMedia=false)
 }
 private fun autoBackupMedia(){
  val root=setting("storage_root_uri")
  if(root.isNotBlank()&&setting("storage_write_enabled")!="false") DataBackup.backupMediaLatest(getApplication(),root)
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

 fun previewKitchen(){printerPreview.value="KITCHEN"}
 fun previewBill(){printerPreview.value="BILL"}
 fun previewCancel(){printerPreview.value="CANCEL"}
 fun clearPrinterPreview(){printerPreview.value=""}
 private fun printerMode()=setting("printer_mode").ifBlank{"TEST"}
 private fun printerMac()=setting("printer_mac")
 private fun printerName()=setting("printer_name").ifBlank{BluetoothPrinter.PROFILE_NAME}
 private fun printerProfile()=vn.ecohome.pos0210.printing.PrinterProfile.fromSetting(setting("printer_paper_mm"))
 private fun qrBitmap(amount:Long,info:String)=
  VietQrOffline.bitmap(setting("bank_name"),setting("bank_account"),setting("bank_holder"),amount,info).getOrNull()
 fun testBluetoothPrint(){
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   if(printerMode()!="BLUETOOTH"){printerMessage.value="Hãy chọn chế độ BLUETOOTH trước";return@launch}
   if(printerMac().isBlank()){printerMessage.value="Chưa chọn máy in Bluetooth";return@launch}
   printerMessage.value="Đang in thử..."
   val qr=qrBitmap(135000,"0210 TEST")
   val profile=printerProfile()
   val result=BluetoothPrinter.printBitmap(getApplication(),printerMac(),ReceiptRenderer.sampleBill(qr,profile),profile,vn.ecohome.pos0210.printing.PrintJobType.TEST)
   printerMessage.value=if(result.isSuccess)"IN THỬ THÀNH CÔNG · ${printerName()}" else "IN THỬ LỖI: ${result.exceptionOrNull()?.message}"
  }
 }
 fun setCartNote(key:String,note:String){cartNotes.value=cartNotes.value.toMutableMap().apply{if(note.isBlank())remove(key) else put(key,note.take(120))}}
 fun add(i:MenuItemEntity){cart.value=cart.value.toMutableMap().apply{put(i.id,(get(i.id)?:0)+1)}};fun sub(i:MenuItemEntity){cart.value=cart.value.toMutableMap().apply{val q=get(i.id)?:0;if(q<=1){remove(i.id);setCartNote(i.id,"")}else put(i.id,q-1)}};fun addCombo(i:ComboEntity){val k="combo:"+i.id;cart.value=cart.value.toMutableMap().apply{put(k,(get(k)?:0)+1)}};fun subCombo(i:ComboEntity){val k="combo:"+i.id;cart.value=cart.value.toMutableMap().apply{val q=get(k)?:0;if(q<=1){remove(k);setCartNote(k,"")}else put(k,q-1)}}
 fun selectTable(t:DiningTableEntity){
  val e=currentEmployee.value?:return
  if(!e.canOrder&&e.role!="ADMIN")return
  viewModelScope.launch{
   currentTable.value=t
   val existing=dao.openSessionForTable(t.id)
   cart.value=emptyMap();cartNotes.value=emptyMap()
   if(existing!=null){
    currentSession.value=existing
    screen.value="SENT"
   }else{
    currentSession.value=null
    screen.value="ORDER"
   }
  }
 }
 fun addMore(){val e=currentEmployee.value?:return;if(!e.canOrder&&e.role!="ADMIN")return;if(currentSession.value==null||currentTable.value==null)return;cart.value=emptyMap();cartNotes.value=emptyMap();screen.value="ORDER"}
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
   audit("MENU",id,"CREATE","$code | ${name.trim()} | price=$price | category=$categoryName");autoBackup();autoBackupMedia();autoMasterConfig()
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
   autoBackup();autoBackupMedia();autoMasterConfig()
  }
 }
 fun setMenuImage(i:MenuItemEntity,uri:String?){
  if(!canManageMenu())return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   val managed=runCatching{ManagedMedia.importImage(getApplication(),uri,"menu_"+i.id)}.getOrNull()
   repo.saveMenuItem(i.copy(imageUri=managed))
   audit("MENU",i.id,"IMAGE");autoBackup();autoBackupMedia();autoMasterConfig()
  }
 }
 fun toggleMenu(i:MenuItemEntity){if(!canManageMenu())return;viewModelScope.launch{dao.setMenuActive(i.id,!i.active);audit("MENU",i.id,"ACTIVE",(!i.active).toString());autoBackup();autoMasterConfig()}}
 fun deleteMenu(i:MenuItemEntity){if(!canManageMenu())return;viewModelScope.launch{dao.setMenuActive(i.id,false);audit("MENU",i.id,"DELETE_SOFT",i.name);autoBackup();autoMasterConfig()}}
 fun addCategory(name:String){if(!canManageMenu()||name.isBlank())return;viewModelScope.launch{val id=UUID.randomUUID().toString();repo.saveCategory(MenuCategoryEntity(id,name.trim(),categories.value.size+1,true));audit("CATEGORY",id,"CREATE",name.trim());autoBackup();autoMasterConfig()}}
 fun deleteCategory(c:MenuCategoryEntity){
  if(!canManageMenu())return
  viewModelScope.launch{
   if(menu.value.any{it.active&&it.categoryId==c.id})return@launch
   dao.setCategoryActive(c.id,false)
   audit("CATEGORY",c.id,"DELETE_SOFT",c.name)
   autoBackup();autoMasterConfig()
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
    if(initial!=null)dao.deleteComboItems(id)
    cleanItems.forEach{(menuItemId,qty)->
     dao.saveComboItem(ComboItemEntity(UUID.randomUUID().toString(),id,menuItemId,qty))
    }
   }
   val action=if(initial==null)"CREATE" else "UPDATE"
   val before=initial?.let{"name=${it.name},price=${it.price},description=${it.description}"}.orEmpty()
   audit("COMBO",id,action,"$before -> name=${name.trim()},price=$price,description=${description.trim()},items=${cleanItems.size}")
   autoBackup();autoBackupMedia();autoMasterConfig()
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
 fun togglePricingRule(rule:PricingRuleEntity){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN")return
  viewModelScope.launch{dao.setPricingRuleActive(rule.id,!rule.active);audit("PRICING",rule.id,"ACTIVE",(!rule.active).toString());autoBackup();autoMasterConfig()}
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
fun saveSetting(key:String,value:String){
 val e=currentEmployee.value?:return
 val allowed=when(key){
  "storage_root_uri","master_config_uri","autoback_tree_uri" -> e.role=="ADMIN"||e.canManageSystem
  "bank_name","bank_account","bank_holder","qr_prefix","printer_mode","printer_mac","printer_name","printer_paper_mm","bank_notification_enabled","bank_notification_vibrate","bank_notification_tts" -> e.role=="ADMIN"||e.role=="MANAGER"
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
 viewModelScope.launch(Dispatchers.IO){runCatching{FirebaseCloudSync.signIn(getApplication(),email,password)}.onSuccess{uid->dao.saveSetting(AppSettingEntity("firebase_email",email.trim()));dao.saveCloudSyncState((dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity()).copy(enabled=true,dirty=true,lastError=null,syncedUid=uid));FirebaseCloudSync.schedule(getApplication());cloudMessage.value="Đăng nhập Firebase thành công";syncFirebase();observeCloudDashboard()}.onFailure{cloudMessage.value="Đăng nhập lỗi: ${it.message}"}}
}
fun firebaseSignOut(){FirebaseCloudSync.signOut(getApplication());viewModelScope.launch(Dispatchers.IO){dao.saveCloudSyncState((dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity()).copy(enabled=false,syncedUid=null));cloudMessage.value="Đã đăng xuất Firebase"};cloudDashboardJob?.cancel()}
fun syncFirebase(){viewModelScope.launch(Dispatchers.IO){cloudMessage.value="Đang đồng bộ…";FirebaseCloudSync.syncNow(getApplication()).onSuccess{cloudMessage.value="Đồng bộ Firebase thành công"}.onFailure{e->if(FirebaseCloudSync.currentUid(getApplication())==null){dao.saveCloudSyncState((dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity()).copy(enabled=false,syncedUid=null,lastError="Chưa đăng nhập Firebase"))};cloudMessage.value="Đồng bộ lỗi: ${e.message}"}}}
fun reconcileFirebaseSession(){
 viewModelScope.launch(Dispatchers.IO){
  val actualUid=FirebaseCloudSync.currentUid(getApplication())
  val saved=dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity()
  when{
   actualUid==null&&saved.syncedUid!=null->dao.saveCloudSyncState(saved.copy(enabled=false,syncedUid=null,lastError="Phiên Firebase đã hết · cần đăng nhập lại"))
   actualUid!=null&&saved.syncedUid!=actualUid->dao.saveCloudSyncState(saved.copy(enabled=true,syncedUid=actualUid,lastError=null))
  }
  if(actualUid!=null)FirebaseCloudSync.schedule(getApplication())
 }
}
fun createFirebaseBackup(){
 val e=currentEmployee.value?:return;if(e.role!="ADMIN")return
 viewModelScope.launch(Dispatchers.IO){
  cloudMessage.value="Đang tạo cloud backup…"
  FirebaseCloudSync.backupNow(getApplication()).onSuccess{info->
   val old=dao.cloudSyncStateSnapshot()?:CloudSyncStateEntity()
   dao.saveCloudSyncState(old.copy(lastError=null))
   cloudMessage.value="Cloud backup thành công · slot ${info.slot} · ${info.chunks} mảnh · ${info.bytes/1024} KB"
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
   audit("PURCHASE",id,"CREATE","${name.trim()}:$qty:$unit:$unitPrice:$amount:payer=${paidByName.trim()}");autoBackup();autoBackupMedia()
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
    dao.updatePurchase(p.copy(supplierId=supplierId,purchasedAt=at,total=amount,note=note.trim(),expenseCategory=category,paidByName=paidByName.trim(),costCodeId=costCodeId,updatedAt=now))
    dao.updatePurchaseItem(line.copy(categoryId=detailCategoryId,qty=qty,unit=unit.ifBlank{"lần"},unitPrice=unitPrice,amount=amount))
    linkedAsset?.let{a->
     val investmentClass=assetInvestmentClassForExpense(category)
     if(investmentClass==null) dao.setAssetStatus(a.id,"DELETED") else dao.saveAsset(a.copy(purchaseDate=at,purchasePrice=unitPrice,quantity=qty.toInt().coerceAtLeast(1),totalCost=amount,supplier=supplierName.trim(),note=note.trim(),investmentClass=investmentClass))
    }
   }
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
   if(dao.updatePurchaseExpenseCategory(p.id,category)==1){audit("PURCHASE",p.id,"CLASSIFY","${p.expenseCategory}->$category");autoBackup()}
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
 fun sendBatch(){
  val e=currentEmployee.value?:return
  val t=currentTable.value?:return
  if(!e.canSendKitchen&&e.role!="ADMIN")return
  val lines=cart.value
  if(lines.isEmpty())return
  viewModelScope.launch{
   val s=currentSession.value ?: repo.openSession(t.id,e.id).also{currentSession.value=it}
   val bs=dao.batches(s.id).first()
   val its=mutableListOf<OrderItemEntity>()
   lines.forEach{(id,q)->
    if(id.startsWith("combo:")){
     val comboId=id.removePrefix("combo:")
     val combo=combos.value.firstOrNull{it.id==comboId}
     if(combo!=null){
      val parts=dao.comboItems(comboId).first().mapNotNull{ci->
       menu.value.firstOrNull{it.id==ci.menuItemId}?.let{m->"${ci.qty}×${m.name}"}
      }
      its.add(OrderItemEntity("","","combo:"+combo.id,"COMBO · ${combo.name} [${parts.joinToString(" + ")}]",combo.price,q,(cartNotes.value[id] ?: "").trim()))
     }
    }else{
     menu.value.firstOrNull{it.id==id}?.let{its.add(OrderItemEntity("","",it.id,it.name,it.price,q,(cartNotes.value[id] ?: "").trim()))}
    }
   }
   repo.createBatch(s.id,bs.size+1,e.id,its)
   cart.value=emptyMap();cartNotes.value=emptyMap()
   autoBackup()
   screen.value="SENT"
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

   val mac=printerMac()
   if(mac.isBlank()){
    repo.failKitchenPrint(job.id,"NO_PRINTER_SELECTED")
    printerMessage.value="Chưa chọn máy in Bluetooth"
    return@launch
   }
   val table=currentTable.value?.name ?: "Bàn"
   val items=dao.batchItems(b.id).first().map{Triple(it.itemNameSnapshot,it.qty,it.note)}
   printerMessage.value="Đang in #${b.serviceNo.toString().padStart(3,'0')} · Đơn #${b.sequence}..."
   val profile=printerProfile()
   val result=BluetoothPrinter.printBitmap(getApplication(),mac,ReceiptRenderer.kitchen(table,b.sequence,b.serviceNo,e.name,items,profile),profile,vn.ecohome.pos0210.printing.PrintJobType.KITCHEN)
   if(result.isSuccess){
    val now=System.currentTimeMillis()
    if(repo.finalizeKitchenPrint(job.id,b.id,now)){
     audit("PRINT",b.id,"KITCHEN_PRINTED","printer=${printerName()},operator=${e.name},job=${job.id}")
     printerMessage.value="ĐÃ IN #${b.serviceNo.toString().padStart(3,'0')} · Đơn #${b.sequence}"
     autoBackup()
    }else{
     printerMessage.value="Máy đã in nhưng không chốt được trạng thái PrintJob · Kiểm tra nhật ký"
    }
   }else{
    repo.failKitchenPrint(job.id,result.exceptionOrNull()?.message ?: "UNKNOWN")
    audit("PRINT",b.id,"KITCHEN_PRINT_FAILED","printer=${printerName()},job=${job.id}")
    printerMessage.value="IN THẤT BẠI · Có thể bấm lại để retry"
   }
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

 fun canCancelOrder():Boolean{val r=currentEmployee.value?.role?:return false;return r=="ADMIN"||r=="MANAGER"}
 fun cancelBatch(b:OrderBatchEntity,reason:String){
  val e=currentEmployee.value?:return
  if(e.role!="ADMIN"&&e.role!="MANAGER")return
  if(reason.isBlank())return
  viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO){
   if(dao.cancelBatch(b.id)>0){
    audit("BATCH",b.id,"CANCELLED","reason=${reason.trim()},operator=${e.name}")
    autoBackup()
    if(printerMode()=="BLUETOOTH"&&printerMac().isNotBlank()){
     val table=currentTable.value?.name ?: "Bàn"
     val profile=printerProfile()
     val pr=BluetoothPrinter.printBitmap(getApplication(),printerMac(),ReceiptRenderer.cancel(table,b.sequence,e.name,reason.trim(),profile),profile,vn.ecohome.pos0210.printing.PrintJobType.CANCEL)
     printerMessage.value=if(pr.isSuccess)"ĐÃ IN PHIẾU HỦY · Đơn #${b.sequence}" else "ĐÃ HỦY ĐƠN · In phiếu hủy lỗi: ${pr.exceptionOrNull()?.message}"
    }
   }
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
 fun total(id:String)=dao.sessionTotal(id)
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
 fun confirmCheckoutBillTest(preview:PricingPreview,qrInfo:String){
  val session=currentSession.value?:return
  val employee=currentEmployee.value?:return
  if(employee.role!="ADMIN"){printerMessage.value="CHỈ ADMIN ĐƯỢC DÙNG BILL TEST";return}
  if(setting("checkout_print_test_mode")!="true"){printerMessage.value="CHẾ ĐỘ BILL TEST CHƯA BẬT";return}
  printedCheckoutKey.value="${session.id}:${preview.total}:$qrInfo"
  viewModelScope.launch(Dispatchers.IO){
   audit("PRINT",session.id,"PREPAY_BILL_TEST_BYPASS","operator=${employee.name},amount=${preview.total}")
  }
  printerMessage.value="BILL TEST · KHÔNG IN THẬT · Có thể kiểm thử bước xác nhận thanh toán"
 }

 fun printCheckoutBill(preview:PricingPreview,qrInfo:String,customerName:String=""){
  val session=currentSession.value?:return
  val table=currentTable.value?:return
  val printKey="${session.id}:${preview.total}:$qrInfo"
  printedCheckoutKey.value=null
  viewModelScope.launch(Dispatchers.IO){
   if(printerMode()!="BLUETOOTH"||printerMac().isBlank()){printerMessage.value="CHƯA CẤU HÌNH MÁY IN · Không thể xác nhận trước khi in bill";return@launch}
   val batches=dao.batches(session.id).first().filter{it.status!="CANCELLED"}
   val lines=mutableListOf<Triple<String,Int,Long>>()
   batches.forEach{batch->dao.batchItems(batch.id).first().forEach{item->lines.add(Triple(item.itemNameSnapshot,item.qty,item.unitPriceSnapshot))}}
   val qr=qrBitmap(preview.total,qrInfo)
   if(qr==null){printerMessage.value="KHÔNG TẠO ĐƯỢC QR · Kiểm tra cấu hình tài khoản";return@launch}
   val now=System.currentTimeMillis()
   val period="${java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(java.util.Date(session.openedAt))}–${java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(java.util.Date(now))}"
   val adjustments=buildList{
    preview.surchargeRules.forEach{rule->add("PHỤ THU ${rule.name}  +${rule.percent}%")}
    preview.discountRule?.let{rule->add("ƯU ĐÃI ${rule.name}${if(rule.code.isNotBlank()) " · ${rule.code}" else ""}  -${rule.percent}%")}
   }
   val profile=printerProfile()
   val bitmap=ReceiptRenderer.bill(table.name,period,lines,preview.subtotal,preview.surcharge,preview.discount,preview.total,adjustments,customerName.ifBlank{"KHÁCH LẠ"},null,0,0,0,"CHƯA XÁC NHẬN",qr,profile)
   val job=PrintJobEntity(UUID.randomUUID().toString(),null,null,"BILL_PREPAY",createdAt=now)
   dao.insertPrintJob(job)
   if(repo.claimPrint(job.id,"ANDROID")){
    val result=BluetoothPrinter.printBitmap(getApplication(),printerMac(),bitmap,profile,vn.ecohome.pos0210.printing.PrintJobType.PAYMENT)
    if(result.isSuccess){
     dao.markPrintSuccess(job.id,System.currentTimeMillis());printedCheckoutKey.value=printKey
     audit("PRINT",session.id,"PREPAY_BILL_PRINTED","printer=${printerName()},job=${job.id},amount=${preview.total}")
     printerMessage.value="ĐÃ IN BILL · Chờ khách kiểm tra và thanh toán"
    }else{dao.markPrintFailed(job.id,result.exceptionOrNull()?.message?:"UNKNOWN");printerMessage.value="IN BILL LỖI · ${result.exceptionOrNull()?.message?:"Thử in lại"}"}
   }
  }
 }
 fun close(method:String,preview:PricingPreview,customerPhone:String="",customerName:String=""){
  val session=currentSession.value?:return
  val employee=currentEmployee.value?:return
  val table=currentTable.value
  if(!employee.canCheckout&&employee.role!="ADMIN")return
  if(printedCheckoutKey.value?.startsWith("${session.id}:${preview.total}:")!=true){printerMessage.value="PHẢI IN BILL TRƯỚC KHI XÁC NHẬN THANH TOÁN";return}
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
     vvipMinPoints=setting("vvip_min_points").toIntOrNull() ?: 500
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
   if(method=="TRANSFER"&&pendingPaymentSession!=null)dao.confirmPaymentSession(pendingPaymentSession.id,bill.id)
   else dao.cancelPaymentSessions(session.id)
   val customer=commit.customer
   val pointsBefore=commit.pointsBefore
   val pointsEarned=commit.pointsEarned
   val pointsAfter=commit.pointsAfter
   val receiptTier=commit.tier
   autoBackup()
   if(false&&printerMode()=="BLUETOOTH"&&printerMac().isNotBlank()){
    val bs=dao.batches(session.id).first().filter{it.status!="CANCELLED"}
    val lines=mutableListOf<Triple<String,Int,Long>>()
    bs.forEach{b->dao.batchItems(b.id).first().forEach{it2->lines.add(Triple(it2.itemNameSnapshot,it2.qty,it2.unitPriceSnapshot))}}
    val info="0210 ${table?.name ?: bill.billNo}"
    val qr=qrBitmap(preview.total,info)
    val period="${java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(java.util.Date(session.openedAt))}–${java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(java.util.Date(bill.closedAt ?: System.currentTimeMillis()))}"
    val receiptAdjustments=buildList {
     preview.surchargeRules.forEach{rule->add("PHỤ THU ${rule.name}  +${rule.percent}%")}
     preview.discountRule?.let{rule->
      add("ƯU ĐÃI ${rule.name}${if(rule.code.isNotBlank()) " · ${rule.code}" else ""}  -${rule.percent}%")
     }
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
     method=if(method=="CASH")"TIỀN MẶT" else "CHUYỂN KHOẢN",
     qr=qr,
     profile=profile
    )
    val job=PrintJobEntity(java.util.UUID.randomUUID().toString(),null,bill.id,"BILL",createdAt=System.currentTimeMillis())
    dao.insertPrintJob(job)
    if(repo.claimPrint(job.id,"ANDROID")){
     val pr=BluetoothPrinter.printBitmap(getApplication(),printerMac(),bmp,profile,vn.ecohome.pos0210.printing.PrintJobType.PAYMENT)
     if(pr.isSuccess){
      dao.markPrintSuccess(job.id,System.currentTimeMillis())
      audit("PRINT",bill.id,"BILL_PRINTED","printer=${printerName()},job=${job.id}")
      printerMessage.value="ĐÃ IN BILL · ${bill.billNo}"
     }else{
      dao.markPrintFailed(job.id,pr.exceptionOrNull()?.message ?: "UNKNOWN")
      audit("PRINT",bill.id,"BILL_PRINT_FAILED","printer=${printerName()},job=${job.id}")
      printerMessage.value="ĐÃ THANH TOÁN · IN BILL LỖI: ${pr.exceptionOrNull()?.message ?: "Thử in lại"}"
     }
    }
   }
   printedCheckoutKey.value=null
   currentSession.value=null
   currentTable.value=null
   screen.value="TABLES"
  }
 }
}
