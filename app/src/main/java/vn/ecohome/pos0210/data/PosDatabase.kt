package vn.ecohome.pos0210.data
import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
@Database(entities=[EmployeeEntity::class,AreaEntity::class,DiningTableEntity::class,MenuCategoryEntity::class,ComboEntity::class,ComboItemEntity::class,MenuItemEntity::class,TableSessionEntity::class,OrderBatchEntity::class,OrderItemEntity::class,BillEntity::class,PaymentEntity::class,CustomerEntity::class,CustomerPointTransactionEntity::class,PricingRuleEntity::class,BillAdjustmentEntity::class,SupplierEntity::class,PurchaseEntity::class,PurchaseCategoryEntity::class,PurchaseItemEntity::class,MonthlyAccountingEntity::class,ProfitPartnerEntity::class,PrintJobEntity::class,AuditEventEntity::class,AppSettingEntity::class,PaymentSessionEntity::class,BankNotificationEventEntity::class,AssetCategoryEntity::class,AssetEntity::class,AssetValuationEntity::class,FinancialMovementEntity::class,OpeningCashAdjustmentEntity::class,CloudSyncStateEntity::class,CostCodeEntity::class],version=19,exportSchema=false)
abstract class PosDatabase:RoomDatabase(){
 abstract fun dao():PosDao
 companion object{
  @Volatile private var instance:PosDatabase?=null
  private val MIGRATION_3_4=object:Migration(3,4){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("CREATE TABLE IF NOT EXISTS PurchaseCategoryEntity (id TEXT NOT NULL, name TEXT NOT NULL, defaultUnit TEXT NOT NULL, sortOrder INTEGER NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(id))")
    db.execSQL("INSERT OR IGNORE INTO PurchaseCategoryEntity(id,name,defaultUnit,sortOrder,active) VALUES('pc_salary','Lương','ngày công',0,1)")
    db.execSQL("INSERT OR IGNORE INTO PurchaseCategoryEntity(id,name,defaultUnit,sortOrder,active) VALUES('pc_fixed','Vật tư cố định','cái',1,1)")
    db.execSQL("INSERT OR IGNORE INTO PurchaseCategoryEntity(id,name,defaultUnit,sortOrder,active) VALUES('pc_production','Vật tư sản xuất','kg',2,1)")
    db.execSQL("ALTER TABLE PurchaseItemEntity ADD COLUMN categoryId TEXT NOT NULL DEFAULT 'pc_production'")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_PurchaseItemEntity_categoryId ON PurchaseItemEntity(categoryId)")
   }
  }
  private val MIGRATION_4_5=object:Migration(4,5){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("ALTER TABLE PurchaseEntity ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_PurchaseEntity_status ON PurchaseEntity(status)")
   }
  }
  private val MIGRATION_5_6=object:Migration(5,6){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("CREATE TABLE IF NOT EXISTS ComboEntity (id TEXT NOT NULL, name TEXT NOT NULL, price INTEGER NOT NULL, imageUri TEXT, sortOrder INTEGER NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(id))")
    db.execSQL("CREATE TABLE IF NOT EXISTS ComboItemEntity (id TEXT NOT NULL, comboId TEXT NOT NULL, menuItemId TEXT NOT NULL, qty INTEGER NOT NULL, PRIMARY KEY(id))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_ComboItemEntity_comboId ON ComboItemEntity(comboId)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_ComboItemEntity_menuItemId ON ComboItemEntity(menuItemId)")
    db.execSQL("CREATE TABLE IF NOT EXISTS PricingRuleEntity (id TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL, kind TEXT NOT NULL, percent INTEGER NOT NULL, startAt INTEGER, endAt INTEGER, startMinute INTEGER, endMinute INTEGER, autoApply INTEGER NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(id))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_PricingRuleEntity_code ON PricingRuleEntity(code)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_PricingRuleEntity_active ON PricingRuleEntity(active)")
    db.execSQL("CREATE TABLE IF NOT EXISTS BillAdjustmentEntity (id TEXT NOT NULL, billId TEXT NOT NULL, ruleId TEXT, name TEXT NOT NULL, kind TEXT NOT NULL, percent INTEGER NOT NULL, amount INTEGER NOT NULL, code TEXT NOT NULL, appliedAt INTEGER NOT NULL, actorId TEXT, PRIMARY KEY(id))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_BillAdjustmentEntity_billId ON BillAdjustmentEntity(billId)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_BillAdjustmentEntity_ruleId ON BillAdjustmentEntity(ruleId)")
   }
  }
  private val MIGRATION_6_7=object:Migration(6,7){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("ALTER TABLE OrderBatchEntity ADD COLUMN serviceNo INTEGER NOT NULL DEFAULT 0")
    db.execSQL("ALTER TABLE OrderBatchEntity ADD COLUMN deliveredAt INTEGER")
    db.execSQL("ALTER TABLE OrderBatchEntity ADD COLUMN deliveredBy TEXT")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_OrderBatchEntity_serviceNo ON OrderBatchEntity(serviceNo)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_OrderBatchEntity_status ON OrderBatchEntity(status)")
    db.execSQL("UPDATE OrderBatchEntity SET status='WAITING' WHERE status='SENT'")
    db.execSQL("ALTER TABLE BillEntity ADD COLUMN customerId TEXT")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_BillEntity_customerId ON BillEntity(customerId)")
    db.execSQL("CREATE TABLE IF NOT EXISTS CustomerEntity (id TEXT NOT NULL, phone TEXT NOT NULL, name TEXT NOT NULL, tier TEXT NOT NULL, points INTEGER NOT NULL, totalSpend INTEGER NOT NULL, visitCount INTEGER NOT NULL, lastVisitAt INTEGER, active INTEGER NOT NULL, PRIMARY KEY(id))")
    db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_CustomerEntity_phone ON CustomerEntity(phone)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_CustomerEntity_tier ON CustomerEntity(tier)")
    db.execSQL("CREATE TABLE IF NOT EXISTS CustomerPointTransactionEntity (id TEXT NOT NULL, customerId TEXT NOT NULL, billId TEXT, delta INTEGER NOT NULL, reason TEXT NOT NULL, createdAt INTEGER NOT NULL, actorId TEXT, PRIMARY KEY(id))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_CustomerPointTransactionEntity_customerId ON CustomerPointTransactionEntity(customerId)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_CustomerPointTransactionEntity_billId ON CustomerPointTransactionEntity(billId)")
   }
  }
  private val MIGRATION_7_8=object:Migration(7,8){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("ALTER TABLE CustomerEntity ADD COLUMN tierManual INTEGER NOT NULL DEFAULT 0")
   }
  }
  private val MIGRATION_8_9=object:Migration(8,9){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("ALTER TABLE CustomerEntity ADD COLUMN address TEXT NOT NULL DEFAULT ''")
   }
  }
  private val MIGRATION_9_10=object:Migration(9,10){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("DELETE FROM PrintJobEntity WHERE type='KITCHEN' AND batchId IS NOT NULL AND rowid NOT IN (SELECT MAX(rowid) FROM PrintJobEntity WHERE type='KITCHEN' AND batchId IS NOT NULL GROUP BY batchId,type)")
    db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_PrintJobEntity_batchId_type ON PrintJobEntity(batchId,type)")
   }
  }
  private val MIGRATION_10_11=object:Migration(10,11){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("ALTER TABLE MenuItemEntity ADD COLUMN productCode TEXT NOT NULL DEFAULT ''")
    db.execSQL("ALTER TABLE MenuItemEntity ADD COLUMN description TEXT NOT NULL DEFAULT ''")
    val categories=mutableMapOf<String,String>()
    db.query("SELECT id,name FROM MenuCategoryEntity").use{c->while(c.moveToNext())categories[c.getString(0)]=c.getString(1)}
    val used=mutableSetOf<String>();val categoryPrefixes=mutableMapOf<String,String>();val occupiedPrefixes=mutableSetOf<String>()
    db.query("SELECT id,categoryId FROM MenuItemEntity ORDER BY sortOrder,name,id").use{c->
     while(c.moveToNext()){
      val id=c.getString(0);val categoryId=c.getString(1)
      val prefix=categoryPrefixes.getOrPut(categoryId){
       val root=ProductCodes.basePrefix(categories[categoryId].orEmpty());var candidate=root;var suffix=2
       while(candidate in occupiedPrefixes)candidate="$root${suffix++}"
       occupiedPrefixes.add(candidate);candidate
      }
      var sequence=1;var code:String
      do{code="$prefix-${sequence.toString().padStart(3,'0')}";sequence++}while(code in used)
      used.add(code)
      db.execSQL("UPDATE MenuItemEntity SET productCode=? WHERE id=?",arrayOf(code,id))
     }
    }
    db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_MenuItemEntity_productCode ON MenuItemEntity(productCode)")
   }
  }
  private val MIGRATION_11_12=object:Migration(11,12){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("ALTER TABLE ComboEntity ADD COLUMN description TEXT NOT NULL DEFAULT ''")
   }
  }
  private val MIGRATION_12_13=object:Migration(12,13){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("ALTER TABLE PurchaseEntity ADD COLUMN expenseCategory TEXT NOT NULL DEFAULT 'UNCLASSIFIED'")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_PurchaseEntity_expenseCategory ON PurchaseEntity(expenseCategory)")
    db.execSQL("CREATE TABLE IF NOT EXISTS MonthlyAccountingEntity (monthKey TEXT NOT NULL, cogs INTEGER, cogsSource TEXT NOT NULL, openingCash INTEGER NOT NULL, reserveBasisPoints INTEGER NOT NULL, PRIMARY KEY(monthKey))")
    db.execSQL("CREATE TABLE IF NOT EXISTS ProfitPartnerEntity (id TEXT NOT NULL, name TEXT NOT NULL, shareBasisPoints INTEGER NOT NULL, sortOrder INTEGER NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(id))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_ProfitPartnerEntity_active ON ProfitPartnerEntity(active)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_ProfitPartnerEntity_sortOrder ON ProfitPartnerEntity(sortOrder)")
   }
  }
  private val MIGRATION_13_14=object:Migration(13,14){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("CREATE TABLE IF NOT EXISTS PaymentSessionEntity (id TEXT NOT NULL, tableSessionId TEXT NOT NULL, billId TEXT, tableId TEXT NOT NULL, expectedAmount INTEGER NOT NULL, paymentCode TEXT NOT NULL, openedAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, status TEXT NOT NULL, detectedFingerprint TEXT, detectedBank TEXT, detectedAmount INTEGER, detectedAt INTEGER, confidence TEXT, PRIMARY KEY(id))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_PaymentSessionEntity_tableSessionId ON PaymentSessionEntity(tableSessionId)")
    db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_PaymentSessionEntity_paymentCode ON PaymentSessionEntity(paymentCode)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_PaymentSessionEntity_status ON PaymentSessionEntity(status)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_PaymentSessionEntity_expiresAt ON PaymentSessionEntity(expiresAt)")
    db.execSQL("CREATE TABLE IF NOT EXISTS BankNotificationEventEntity (fingerprint TEXT NOT NULL, packageName TEXT NOT NULL, bank TEXT, title TEXT NOT NULL, body TEXT NOT NULL, receivedAt INTEGER NOT NULL, parserResult TEXT NOT NULL, amount INTEGER, account TEXT, transactionTime INTEGER, content TEXT, reference TEXT, direction TEXT, matchStatus TEXT NOT NULL, paymentSessionId TEXT, PRIMARY KEY(fingerprint))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_BankNotificationEventEntity_receivedAt ON BankNotificationEventEntity(receivedAt)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_BankNotificationEventEntity_matchStatus ON BankNotificationEventEntity(matchStatus)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_BankNotificationEventEntity_paymentSessionId ON BankNotificationEventEntity(paymentSessionId)")
   }
  }
  private val MIGRATION_14_15=object:Migration(14,15){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("ALTER TABLE MonthlyAccountingEntity ADD COLUMN openingCashOverridden INTEGER NOT NULL DEFAULT 0")
    db.execSQL("ALTER TABLE MonthlyAccountingEntity ADD COLUMN closingCashSnapshot INTEGER")
    db.execSQL("CREATE TABLE IF NOT EXISTS AssetCategoryEntity (id TEXT NOT NULL, name TEXT NOT NULL, defaultUsefulLifeMonths INTEGER NOT NULL, minUsefulLifeMonths INTEGER NOT NULL, maxUsefulLifeMonths INTEGER NOT NULL, sortOrder INTEGER NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(id))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_AssetCategoryEntity_active ON AssetCategoryEntity(active)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_AssetCategoryEntity_sortOrder ON AssetCategoryEntity(sortOrder)")
    db.execSQL("CREATE TABLE IF NOT EXISTS AssetEntity (id TEXT NOT NULL, name TEXT NOT NULL, categoryId TEXT NOT NULL, purchaseDate INTEGER NOT NULL, purchasePrice INTEGER NOT NULL, quantity INTEGER NOT NULL, totalCost INTEGER NOT NULL, supplier TEXT NOT NULL, usefulLifeMonths INTEGER NOT NULL, depreciationMethod TEXT NOT NULL, residualValue INTEGER NOT NULL, estimatedLiquidationValue INTEGER NOT NULL, status TEXT NOT NULL, disposalDate INTEGER, disposalPrice INTEGER, note TEXT NOT NULL, PRIMARY KEY(id))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_AssetEntity_categoryId ON AssetEntity(categoryId)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_AssetEntity_purchaseDate ON AssetEntity(purchaseDate)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_AssetEntity_status ON AssetEntity(status)")
    db.execSQL("CREATE TABLE IF NOT EXISTS AssetValuationEntity (id TEXT NOT NULL, assetId TEXT NOT NULL, previousValue INTEGER NOT NULL, newValue INTEGER NOT NULL, changedAt INTEGER NOT NULL, note TEXT NOT NULL, PRIMARY KEY(id))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_AssetValuationEntity_assetId ON AssetValuationEntity(assetId)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_AssetValuationEntity_changedAt ON AssetValuationEntity(changedAt)")
    db.execSQL("CREATE TABLE IF NOT EXISTS FinancialMovementEntity (id TEXT NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL, occurredAt INTEGER NOT NULL, partnerId TEXT, method TEXT NOT NULL, note TEXT NOT NULL, PRIMARY KEY(id))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_FinancialMovementEntity_occurredAt ON FinancialMovementEntity(occurredAt)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_FinancialMovementEntity_type ON FinancialMovementEntity(type)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_FinancialMovementEntity_partnerId ON FinancialMovementEntity(partnerId)")
    db.execSQL("CREATE TABLE IF NOT EXISTS OpeningCashAdjustmentEntity (id TEXT NOT NULL, monthKey TEXT NOT NULL, previousValue INTEGER NOT NULL, newValue INTEGER NOT NULL, note TEXT NOT NULL, changedAt INTEGER NOT NULL, PRIMARY KEY(id))")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_OpeningCashAdjustmentEntity_monthKey ON OpeningCashAdjustmentEntity(monthKey)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_OpeningCashAdjustmentEntity_changedAt ON OpeningCashAdjustmentEntity(changedAt)")
    val categories=listOf(arrayOf("coffee_machine","Máy pha cà phê",60,36,96,0),arrayOf("grinder","Máy xay",60,36,96,1),arrayOf("cold_equipment","Thiết bị lạnh",72,36,120,2),arrayOf("electrical","Thiết bị điện / POS",48,24,72,3),arrayOf("kitchen","Thiết bị bếp",60,24,96,4),arrayOf("furniture","Bàn ghế / nội thất",60,24,120,5),arrayOf("other","Dụng cụ khác",36,12,84,6))
    categories.forEach{v->db.execSQL("INSERT OR IGNORE INTO AssetCategoryEntity(id,name,defaultUsefulLifeMonths,minUsefulLifeMonths,maxUsefulLifeMonths,sortOrder,active) VALUES(?,?,?,?,?,?,1)",v)}
   }
  }
  private val MIGRATION_15_16=object:Migration(15,16){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("ALTER TABLE MonthlyAccountingEntity ADD COLUMN operatingProfitSnapshot INTEGER")
    db.execSQL("ALTER TABLE MonthlyAccountingEntity ADD COLUMN distributableProfitSnapshot INTEGER")
   }
  }
  private val MIGRATION_16_17=object:Migration(16,17){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("CREATE TABLE IF NOT EXISTS CloudSyncStateEntity (id TEXT NOT NULL, enabled INTEGER NOT NULL, dirty INTEGER NOT NULL, lastAttemptAt INTEGER, lastSuccessAt INTEGER, lastError TEXT, syncedUid TEXT, PRIMARY KEY(id))")
    db.execSQL("INSERT OR IGNORE INTO CloudSyncStateEntity(id,enabled,dirty) VALUES('firebase',0,1)")
   }
  }
  private val MIGRATION_17_18=object:Migration(17,18){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("ALTER TABLE PurchaseEntity ADD COLUMN paidByName TEXT NOT NULL DEFAULT ''")
   }
  }
  private val MIGRATION_18_19=object:Migration(18,19){
   override fun migrate(db:SupportSQLiteDatabase){
    db.execSQL("ALTER TABLE PurchaseEntity ADD COLUMN costCodeId TEXT")
    db.execSQL("ALTER TABLE PurchaseEntity ADD COLUMN updatedAt INTEGER")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_PurchaseEntity_costCodeId ON PurchaseEntity(costCodeId)")
    db.execSQL("ALTER TABLE AssetEntity ADD COLUMN investmentClass TEXT NOT NULL DEFAULT 'INITIAL'")
    db.execSQL("ALTER TABLE FinancialMovementEntity ADD COLUMN counterpartyName TEXT NOT NULL DEFAULT ''")
    db.execSQL("CREATE TABLE IF NOT EXISTS CostCodeEntity (id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, parentExpenseCategory TEXT NOT NULL, defaultUnit TEXT NOT NULL, defaultSupplier TEXT NOT NULL, referenceUnitPrice INTEGER, sortOrder INTEGER NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(id))")
    db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_CostCodeEntity_code ON CostCodeEntity(code)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_CostCodeEntity_parentExpenseCategory ON CostCodeEntity(parentExpenseCategory)")
    db.execSQL("CREATE INDEX IF NOT EXISTS index_CostCodeEntity_active ON CostCodeEntity(active)")
   }
  }
  fun get(context:Context):PosDatabase=instance?:synchronized(this){
   instance?:Room.databaseBuilder(context.applicationContext,PosDatabase::class.java,"pos0210.db")
    .addMigrations(MIGRATION_3_4,MIGRATION_4_5,MIGRATION_5_6,MIGRATION_6_7,MIGRATION_7_8,MIGRATION_8_9,MIGRATION_9_10,MIGRATION_10_11,MIGRATION_11_12,MIGRATION_12_13,MIGRATION_13_14,MIGRATION_14_15,MIGRATION_15_16,MIGRATION_16_17,MIGRATION_17_18,MIGRATION_18_19)
    .build().also{instance=it}
  }
  fun closeForRestore(){synchronized(this){instance?.close();instance=null}}
 }
}
