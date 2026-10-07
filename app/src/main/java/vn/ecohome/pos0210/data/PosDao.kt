package vn.ecohome.pos0210.data
import androidx.room.*
import kotlinx.coroutines.flow.Flow
data class TableServiceTimingRow(val sessionId:String,val firstOrderAt:Long?,val lastOrderSentAt:Long?,val sentBatchCount:Int,val waitingBatchCount:Int)
@Dao interface PosDao{
@Query("SELECT * FROM AreaEntity WHERE active=1 ORDER BY sortOrder,name") fun areas():Flow<List<AreaEntity>>
@Query("SELECT * FROM DiningTableEntity WHERE active=1 ORDER BY sortOrder,name") fun tables():Flow<List<DiningTableEntity>>
@Query("SELECT * FROM MenuCategoryEntity WHERE active=1 ORDER BY sortOrder,name") fun categories():Flow<List<MenuCategoryEntity>>
@Query("SELECT * FROM MenuItemEntity ORDER BY sortOrder,name") fun menuItems():Flow<List<MenuItemEntity>>
@Query("SELECT * FROM ComboEntity ORDER BY sortOrder,name") fun combos():Flow<List<ComboEntity>>
@Query("SELECT * FROM ComboItemEntity WHERE comboId=:comboId") fun comboItems(comboId:String):Flow<List<ComboItemEntity>>
@Query("SELECT * FROM ComboItemEntity") suspend fun allComboItemsSnapshot():List<ComboItemEntity>
@Query("SELECT * FROM ComboEntity") suspend fun allCombosSnapshot():List<ComboEntity>
@Query("SELECT * FROM EmployeeEntity ORDER BY name") fun employees():Flow<List<EmployeeEntity>>
@Query("SELECT * FROM SupplierEntity ORDER BY name") fun suppliers():Flow<List<SupplierEntity>>
@Query("SELECT * FROM SupplierEntity ORDER BY name") suspend fun allSuppliersSnapshot():List<SupplierEntity>
@Query("SELECT * FROM TableSessionEntity WHERE status='OPEN'") fun openSessions():Flow<List<TableSessionEntity>>
@Query("""SELECT s.id AS sessionId,
MIN(CASE WHEN ob.status NOT IN ('DRAFT','CANCELLED') THEN COALESCE(ob.sentAt,ob.createdAt) END) AS firstOrderAt,
MAX(CASE WHEN ob.status NOT IN ('DRAFT','CANCELLED') THEN COALESCE(ob.sentAt,ob.createdAt) END) AS lastOrderSentAt,
COALESCE(SUM(CASE WHEN ob.status NOT IN ('DRAFT','CANCELLED') THEN 1 ELSE 0 END),0) AS sentBatchCount,
COALESCE(SUM(CASE WHEN ob.status='WAITING' THEN 1 ELSE 0 END),0) AS waitingBatchCount
FROM TableSessionEntity s LEFT JOIN OrderBatchEntity ob ON ob.sessionId=s.id
WHERE s.status='OPEN' GROUP BY s.id""") fun tableServiceTimings():Flow<List<TableServiceTimingRow>>
@Query("SELECT * FROM TableSessionEntity WHERE id=:id LIMIT 1") fun sessionById(id:String):Flow<TableSessionEntity?>
@Query("SELECT * FROM TableSessionEntity WHERE tableId=:tableId AND status='OPEN' LIMIT 1") suspend fun openSessionForTable(tableId:String):TableSessionEntity?
@Query("SELECT * FROM OrderBatchEntity WHERE sessionId=:sessionId ORDER BY sequence") fun batches(sessionId:String):Flow<List<OrderBatchEntity>>
@Query("SELECT ob.* FROM OrderBatchEntity ob INNER JOIN TableSessionEntity s ON s.id=ob.sessionId WHERE ob.status='WAITING' AND s.status='OPEN' ORDER BY ob.serviceNo,ob.createdAt") fun waitingBatches():Flow<List<OrderBatchEntity>>
@Query("SELECT COUNT(*) FROM OrderBatchEntity WHERE sessionId=:sessionId AND status='WAITING'") suspend fun waitingCountForSession(sessionId:String):Int
@Query("SELECT COUNT(*) FROM OrderBatchEntity WHERE sessionId=:sessionId AND status IN ('DRAFT','WAITING')") suspend fun unfulfilledCountForSession(sessionId:String):Int
@Query("SELECT COALESCE(MAX(sequence),0) FROM OrderBatchEntity WHERE sessionId=:sessionId") suspend fun maxBatchSequence(sessionId:String):Int
@Query("SELECT COALESCE(MAX(serviceNo),0) FROM OrderBatchEntity WHERE createdAt>=:dayStart") suspend fun maxServiceNoSince(dayStart:Long):Int
@Query("SELECT * FROM OrderItemEntity WHERE batchId=:batchId") fun batchItems(batchId:String):Flow<List<OrderItemEntity>>
@Query("SELECT COALESCE(SUM(qty*unitPriceSnapshot),0) FROM OrderItemEntity WHERE batchId IN (SELECT id FROM OrderBatchEntity WHERE sessionId=:sessionId AND status!='CANCELLED')") fun sessionTotal(sessionId:String):Flow<Long>
@Query("SELECT COALESCE(SUM(qty*unitPriceSnapshot),0) FROM OrderItemEntity WHERE batchId IN (SELECT id FROM OrderBatchEntity WHERE sessionId=:sessionId AND status!='CANCELLED')") suspend fun sessionTotalSnapshot(sessionId:String):Long
@Query("SELECT * FROM BillEntity WHERE status='PAID' ORDER BY closedAt DESC") fun paidBills():Flow<List<BillEntity>>
@Query("SELECT * FROM PaymentEntity ORDER BY paidAt DESC") fun payments():Flow<List<PaymentEntity>>
@Query("SELECT * FROM CustomerEntity WHERE active=1 ORDER BY lastVisitAt DESC") fun customers():Flow<List<CustomerEntity>>
@Query("SELECT * FROM CustomerEntity WHERE phone=:phone AND active=1 LIMIT 1") suspend fun customerByPhone(phone:String):CustomerEntity?
@Query("SELECT * FROM CustomerEntity WHERE id=:id LIMIT 1") suspend fun customerById(id:String):CustomerEntity?
@Query("SELECT * FROM CustomerPointTransactionEntity WHERE customerId=:customerId ORDER BY createdAt DESC") fun customerPoints(customerId:String):Flow<List<CustomerPointTransactionEntity>>
@Query("SELECT b.customerId AS customerId, oi.itemNameSnapshot AS name, oi.qty AS qty FROM BillEntity b INNER JOIN OrderBatchEntity ob ON ob.sessionId=b.sessionId INNER JOIN OrderItemEntity oi ON oi.batchId=ob.id WHERE b.status='PAID' AND b.customerId IS NOT NULL AND ob.status!='CANCELLED'") fun customerItemStats():Flow<List<CustomerItemStatRow>>
@Query("SELECT COALESCE(SUM(delta),0) FROM CustomerPointTransactionEntity WHERE billId=:billId") suspend fun pointDeltaForBill(billId:String):Int
@Query("SELECT COALESCE(SUM(total),0) FROM BillEntity WHERE customerId=:customerId AND status='PAID'") suspend fun paidSpendForCustomer(customerId:String):Long
@Query("SELECT COUNT(*) FROM BillEntity WHERE customerId=:customerId AND status='PAID'") suspend fun paidVisitCountForCustomer(customerId:String):Int
@Query("SELECT MAX(closedAt) FROM BillEntity WHERE customerId=:customerId AND status='PAID'") suspend fun lastPaidVisitForCustomer(customerId:String):Long?
@Query("SELECT COALESCE(SUM(delta),0) FROM CustomerPointTransactionEntity WHERE customerId=:customerId") suspend fun pointBalanceForCustomer(customerId:String):Int
@Query("SELECT * FROM PricingRuleEntity ORDER BY name") fun pricingRules():Flow<List<PricingRuleEntity>>
@Query("SELECT * FROM PricingRuleEntity WHERE active=1") suspend fun activePricingRulesSnapshot():List<PricingRuleEntity>
@Query("SELECT * FROM PricingRuleEntity ORDER BY name") suspend fun allPricingRulesSnapshot():List<PricingRuleEntity>
@Query("SELECT * FROM BillAdjustmentEntity ORDER BY appliedAt DESC") fun billAdjustments():Flow<List<BillAdjustmentEntity>>
@Query("SELECT oi.itemNameSnapshot AS name, oi.qty AS qty, ob.sessionId AS sessionId FROM OrderItemEntity oi INNER JOIN OrderBatchEntity ob ON ob.id=oi.batchId INNER JOIN BillEntity b ON b.sessionId=ob.sessionId WHERE b.status='PAID' AND ob.status!='CANCELLED'") fun paidItemSales():Flow<List<ItemSaleRow>>
@Query("SELECT * FROM PurchaseEntity WHERE status='ACTIVE' ORDER BY purchasedAt DESC") fun purchases():Flow<List<PurchaseEntity>>
@Query("SELECT * FROM PurchaseEntity ORDER BY purchasedAt DESC") suspend fun allPurchasesSnapshot():List<PurchaseEntity>
@Query("SELECT pi.purchaseId AS purchaseId, pi.categoryId AS categoryId, pi.amount AS amount, p.purchasedAt AS purchasedAt FROM PurchaseItemEntity pi INNER JOIN PurchaseEntity p ON p.id=pi.purchaseId WHERE p.status='ACTIVE'") fun purchaseCosts():Flow<List<PurchaseCostRow>>
@Query("SELECT * FROM PurchaseCategoryEntity WHERE active=1 ORDER BY sortOrder,name") fun purchaseCategories():Flow<List<PurchaseCategoryEntity>>
@Query("SELECT * FROM CostCodeEntity WHERE active=1 ORDER BY sortOrder,code") fun costCodes():Flow<List<CostCodeEntity>>
@Query("SELECT * FROM CostCodeEntity ORDER BY sortOrder,code") suspend fun allCostCodesSnapshot():List<CostCodeEntity>
@Query("SELECT * FROM PurchaseItemEntity") fun allPurchaseItems():Flow<List<PurchaseItemEntity>>
@Query("SELECT * FROM PurchaseItemEntity WHERE purchaseId=:purchaseId") suspend fun purchaseItemsSnapshot(purchaseId:String):List<PurchaseItemEntity>
@Query("SELECT * FROM PurchaseCategoryEntity ORDER BY sortOrder,name") suspend fun allPurchaseCategoriesSnapshot():List<PurchaseCategoryEntity>
@Query("SELECT * FROM PurchaseItemEntity WHERE purchaseId=:purchaseId") fun purchaseItems(purchaseId:String):Flow<List<PurchaseItemEntity>>
@Query("SELECT * FROM MonthlyAccountingEntity") fun monthlyAccounting():Flow<List<MonthlyAccountingEntity>>
@Query("SELECT * FROM ProfitPartnerEntity WHERE active=1 ORDER BY sortOrder,name") fun profitPartners():Flow<List<ProfitPartnerEntity>>
@Query("SELECT * FROM ProfitPartnerEntity ORDER BY sortOrder,name") suspend fun allProfitPartnersSnapshot():List<ProfitPartnerEntity>
@Query("SELECT * FROM AssetCategoryEntity WHERE active=1 ORDER BY sortOrder,name") fun assetCategories():Flow<List<AssetCategoryEntity>>
@Query("SELECT * FROM AssetCategoryEntity ORDER BY sortOrder,name") suspend fun allAssetCategoriesSnapshot():List<AssetCategoryEntity>
@Query("SELECT * FROM AssetEntity ORDER BY purchaseDate DESC,name") fun assets():Flow<List<AssetEntity>>
@Query("SELECT * FROM AssetValuationEntity ORDER BY changedAt DESC") fun assetValuations():Flow<List<AssetValuationEntity>>
@Query("SELECT * FROM FinancialMovementEntity ORDER BY occurredAt DESC") fun financialMovements():Flow<List<FinancialMovementEntity>>
@Query("SELECT COALESCE(SUM(amount),0) FROM FinancialMovementEntity WHERE type=:type") suspend fun financialMovementTotal(type:String):Long
@Query("SELECT COALESCE(SUM(distributableProfitSnapshot),0) FROM MonthlyAccountingEntity WHERE distributableProfitSnapshot>0") suspend fun cumulativeDistributableProfit():Long
@Query("SELECT * FROM OpeningCashAdjustmentEntity ORDER BY changedAt DESC") fun openingCashAdjustments():Flow<List<OpeningCashAdjustmentEntity>>
@Query("SELECT * FROM PrintJobEntity ORDER BY createdAt DESC") fun printJobs():Flow<List<PrintJobEntity>>
@Query("SELECT * FROM PrintJobEntity WHERE batchId=:batchId AND type=\'KITCHEN\' LIMIT 1") suspend fun kitchenPrintJob(batchId:String):PrintJobEntity?
@Query("SELECT * FROM AuditEventEntity ORDER BY occurredAt DESC LIMIT 500") fun audits():Flow<List<AuditEventEntity>>
@Query("SELECT * FROM AppSettingEntity") fun settings():Flow<List<AppSettingEntity>>
@Query("SELECT * FROM CloudSyncStateEntity WHERE id='firebase' LIMIT 1") fun cloudSyncState():Flow<CloudSyncStateEntity?>
@Query("SELECT * FROM CloudSyncStateEntity WHERE id='firebase' LIMIT 1") suspend fun cloudSyncStateSnapshot():CloudSyncStateEntity?
@Query("SELECT * FROM PaymentSessionEntity WHERE tableSessionId=:tableSessionId AND status IN ('WAITING','PAYMENT_DETECTED') ORDER BY openedAt DESC LIMIT 1") fun activePaymentSession(tableSessionId:String):Flow<PaymentSessionEntity?>
@Query("SELECT * FROM PaymentSessionEntity WHERE tableSessionId=:tableSessionId AND status IN ('WAITING','PAYMENT_DETECTED') ORDER BY openedAt DESC LIMIT 1") suspend fun activePaymentSessionSnapshot(tableSessionId:String):PaymentSessionEntity?
@Query("SELECT ps.* FROM PaymentSessionEntity ps INNER JOIN TableSessionEntity ts ON ts.id=ps.tableSessionId WHERE ps.status='WAITING' AND ps.expectedAmount=:amount AND ps.expiresAt>=:now AND ts.status='OPEN'") suspend fun waitingPaymentSessions(amount:Long,now:Long):List<PaymentSessionEntity>
@Query("SELECT * FROM BankNotificationEventEntity ORDER BY receivedAt DESC LIMIT 20") fun recentBankNotifications():Flow<List<BankNotificationEventEntity>>
@Query("SELECT value FROM AppSettingEntity WHERE key=:key LIMIT 1") suspend fun settingValue(key:String):String?
@Query("SELECT * FROM AreaEntity ORDER BY sortOrder,name") suspend fun allAreasSnapshot():List<AreaEntity>
@Query("SELECT * FROM DiningTableEntity ORDER BY sortOrder,name") suspend fun allTablesSnapshot():List<DiningTableEntity>
@Query("SELECT * FROM MenuCategoryEntity ORDER BY sortOrder,name") suspend fun allCategoriesSnapshot():List<MenuCategoryEntity>
@Query("SELECT * FROM MenuItemEntity ORDER BY sortOrder,name") suspend fun allMenuSnapshot():List<MenuItemEntity>
@Query("SELECT productCode FROM MenuItemEntity") suspend fun allProductCodes():List<String>
@Query("SELECT * FROM MenuItemEntity WHERE id=:id LIMIT 1") suspend fun menuItemById(id:String):MenuItemEntity?
@Query("SELECT * FROM EmployeeEntity ORDER BY name") suspend fun allEmployeesSnapshot():List<EmployeeEntity>
@Query("SELECT * FROM AppSettingEntity") suspend fun allSettingsSnapshot():List<AppSettingEntity>
@Query("SELECT * FROM DiningTableEntity ORDER BY sortOrder,name") suspend fun cloudTablesSnapshot():List<DiningTableEntity>
@Query("SELECT * FROM TableSessionEntity ORDER BY openedAt DESC") suspend fun cloudSessionsSnapshot():List<TableSessionEntity>
@Query("SELECT * FROM OrderBatchEntity ORDER BY createdAt") suspend fun cloudOrderBatchesSnapshot():List<OrderBatchEntity>
@Query("SELECT * FROM OrderItemEntity") suspend fun cloudOrderItemsSnapshot():List<OrderItemEntity>
@Query("SELECT * FROM BillEntity ORDER BY openedAt DESC") suspend fun cloudBillsSnapshot():List<BillEntity>
@Query("SELECT * FROM PaymentEntity ORDER BY paidAt DESC") suspend fun cloudPaymentsSnapshot():List<PaymentEntity>
@Query("SELECT * FROM PurchaseEntity ORDER BY purchasedAt DESC") suspend fun cloudPurchasesSnapshot():List<PurchaseEntity>
@Query("SELECT * FROM MonthlyAccountingEntity ORDER BY monthKey") suspend fun cloudAccountingSnapshot():List<MonthlyAccountingEntity>
@Query("SELECT * FROM AssetEntity ORDER BY purchaseDate") suspend fun cloudAssetsSnapshot():List<AssetEntity>
@Query("SELECT * FROM FinancialMovementEntity ORDER BY occurredAt") suspend fun cloudMovementsSnapshot():List<FinancialMovementEntity>
@Query("SELECT * FROM EmployeeEntity WHERE pin=:pin AND active=1 LIMIT 1") suspend fun employeeByPin(pin:String):EmployeeEntity?
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertSession(v:TableSessionEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertBatch(v:OrderBatchEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertItems(v:List<OrderItemEntity>)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertBill(v:BillEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertPayment(v:PaymentEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveCustomer(v:CustomerEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertCustomerPoint(v:CustomerPointTransactionEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertPrintJob(v:PrintJobEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveArea(v:AreaEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveTable(v:DiningTableEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveCategory(v:MenuCategoryEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveMenuItem(v:MenuItemEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveCombo(v:ComboEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveComboItem(v:ComboItemEntity)
@Query("DELETE FROM ComboItemEntity WHERE comboId=:comboId") suspend fun deleteComboItems(comboId:String)
@Query("UPDATE ComboEntity SET active=:active WHERE id=:id") suspend fun setComboActive(id:String,active:Boolean)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveEmployee(v:EmployeeEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveSupplier(v:SupplierEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun savePurchaseCategory(v:PurchaseCategoryEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveCostCode(v:CostCodeEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveSetting(v:AppSettingEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveCloudSyncState(v:CloudSyncStateEntity)
@Query("UPDATE CloudSyncStateEntity SET dirty=1 WHERE id='firebase'") suspend fun markCloudDirty():Int
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertPaymentSession(v:PaymentSessionEntity)
@Insert(onConflict=OnConflictStrategy.IGNORE) suspend fun insertBankNotification(v:BankNotificationEventEntity):Long
@Query("UPDATE PaymentSessionEntity SET status='CANCELLED' WHERE tableSessionId=:tableSessionId AND status IN ('WAITING','PAYMENT_DETECTED')") suspend fun cancelPaymentSessions(tableSessionId:String):Int
@Query("UPDATE PaymentSessionEntity SET status='PAYMENT_DETECTED',detectedFingerprint=:fingerprint,detectedBank=:bank,detectedAmount=:amount,detectedAt=:detectedAt,confidence=:confidence WHERE id=:id AND status='WAITING'") suspend fun markPaymentDetected(id:String,fingerprint:String,bank:String,amount:Long,detectedAt:Long,confidence:String):Int
@Query("UPDATE PaymentSessionEntity SET status='CONFIRMED',billId=:billId WHERE id=:id AND status IN ('WAITING','PAYMENT_DETECTED')") suspend fun confirmPaymentSession(id:String,billId:String):Int
@Query("UPDATE BankNotificationEventEntity SET matchStatus=:status,paymentSessionId=:paymentSessionId WHERE fingerprint=:fingerprint") suspend fun updateBankNotificationMatch(fingerprint:String,status:String,paymentSessionId:String?):Int
@Query("DELETE FROM BankNotificationEventEntity WHERE fingerprint NOT IN (SELECT fingerprint FROM BankNotificationEventEntity ORDER BY receivedAt DESC LIMIT 20)") suspend fun trimBankNotifications()
@Query("DELETE FROM BankNotificationEventEntity") suspend fun clearBankNotifications()
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun savePricingRule(v:PricingRuleEntity)
@Query("UPDATE PricingRuleEntity SET active=:active WHERE id=:id") suspend fun setPricingRuleActive(id:String,active:Boolean)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertBillAdjustments(v:List<BillAdjustmentEntity>)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertPurchase(v:PurchaseEntity)
@Insert(onConflict=OnConflictStrategy.IGNORE) suspend fun insertCloudPurchase(v:PurchaseEntity):Long
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertPurchaseItems(v:List<PurchaseItemEntity>)
@Insert(onConflict=OnConflictStrategy.IGNORE) suspend fun insertCloudPurchaseItems(v:List<PurchaseItemEntity>):List<Long>
@Update suspend fun updatePurchase(v:PurchaseEntity):Int
@Update suspend fun updatePurchaseItem(v:PurchaseItemEntity):Int
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveMonthlyAccounting(v:MonthlyAccountingEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveProfitPartners(v:List<ProfitPartnerEntity>)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveAssetCategory(v:AssetCategoryEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveAsset(v:AssetEntity)
@Insert(onConflict=OnConflictStrategy.IGNORE) suspend fun insertCloudAsset(v:AssetEntity):Long
@Query("UPDATE AssetEntity SET status=:status WHERE id=:id") suspend fun setAssetStatus(id:String,status:String):Int
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertAssetValuation(v:AssetValuationEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertFinancialMovement(v:FinancialMovementEntity)
@Insert(onConflict=OnConflictStrategy.IGNORE) suspend fun insertCloudFinancialMovement(v:FinancialMovementEntity):Long
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertOpeningCashAdjustment(v:OpeningCashAdjustmentEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun audit(v:AuditEventEntity)
@Query("UPDATE MenuItemEntity SET active=:active WHERE id=:id") suspend fun setMenuActive(id:String,active:Boolean)
@Query("UPDATE MenuCategoryEntity SET active=:active WHERE id=:id") suspend fun setCategoryActive(id:String,active:Boolean)
@Query("UPDATE PurchaseCategoryEntity SET active=:active WHERE id=:id") suspend fun setPurchaseCategoryActive(id:String,active:Boolean)
@Query("UPDATE CostCodeEntity SET active=:active WHERE id=:id") suspend fun setCostCodeActive(id:String,active:Boolean)
@Query("UPDATE AreaEntity SET active=0") suspend fun deactivateAllAreas()
@Query("UPDATE DiningTableEntity SET active=0") suspend fun deactivateAllTables()
@Query("UPDATE MenuCategoryEntity SET active=0") suspend fun deactivateAllMenuCategories()
@Query("UPDATE MenuItemEntity SET active=0") suspend fun deactivateAllMenuItems()
@Query("UPDATE ComboEntity SET active=0") suspend fun deactivateAllCombos()
@Query("UPDATE PricingRuleEntity SET active=0") suspend fun deactivateAllPricingRules()
@Query("UPDATE EmployeeEntity SET active=0") suspend fun deactivateAllEmployees()
@Query("UPDATE PurchaseCategoryEntity SET active=0") suspend fun deactivateAllPurchaseCategories()
@Query("DELETE FROM AppSettingEntity WHERE key NOT IN ('autoback_tree_uri','master_config_uri','storage_root_uri','storage_write_enabled','firebase_project_id','firebase_application_id','firebase_api_key')") suspend fun clearConfigSettings()
@Query("UPDATE EmployeeEntity SET active=:active WHERE id=:id") suspend fun setEmployeeActive(id:String,active:Boolean)
@Query("UPDATE OrderBatchEntity SET status=:newStatus,sentAt=:sentAt WHERE id=:id AND status=:expected") suspend fun transitionBatch(id:String,expected:String,newStatus:String,sentAt:Long?):Int
@Query("UPDATE OrderBatchEntity SET status='DELIVERED',deliveredAt=:at,deliveredBy=:employeeId WHERE id=:id AND status='WAITING'") suspend fun markDelivered(id:String,at:Long,employeeId:String):Int
@Query("UPDATE OrderBatchEntity SET status='RECONCILED',deliveredAt=COALESCE((SELECT b.closedAt FROM BillEntity b WHERE b.sessionId=OrderBatchEntity.sessionId ORDER BY b.closedAt DESC LIMIT 1),deliveredAt,sentAt,createdAt) WHERE status='WAITING' AND sessionId IN (SELECT id FROM TableSessionEntity WHERE status='CLOSED')") suspend fun reconcileClosedSessionWaiting():Int
@Query("UPDATE OrderBatchEntity SET status='CANCELLED' WHERE id=:id AND status IN ('DRAFT','WAITING')") suspend fun cancelBatch(id:String):Int
@Query("UPDATE TableSessionEntity SET status='CLOSED',version=version+1 WHERE id=:id AND status='OPEN' AND version=:version") suspend fun closeSession(id:String,version:Long):Int
@Query("UPDATE PrintJobEntity SET status=:newStatus,claimedByDeviceId=:deviceId,attempts=attempts+1 WHERE id=:id AND status=:expected") suspend fun claimPrint(id:String,expected:String,newStatus:String,deviceId:String):Int
@Query("UPDATE PrintJobEntity SET status='REVIEW',error='APP_RESTART_DURING_PRINT' WHERE status='CLAIMED'") suspend fun recoverClaimedPrints():Int
@Query("UPDATE PrintJobEntity SET status='PRINTED',printedAt=:printedAt,error=NULL WHERE id=:id AND status='CLAIMED'") suspend fun markPrintSuccess(id:String,printedAt:Long):Int
@Query("UPDATE PrintJobEntity SET status='FAILED',error=:error WHERE id=:id AND status='CLAIMED'") suspend fun markPrintFailed(id:String,error:String):Int
@Query("UPDATE BillEntity SET status='DELETED' WHERE id=:id AND status='PAID'") suspend fun softDeleteBill(id:String):Int
@Query("UPDATE BillEntity SET status='DELETED' WHERE id IN (:ids) AND status='PAID'") suspend fun softDeleteBills(ids:List<String>):Int
@Query("UPDATE CustomerEntity SET points=points+:pointsDelta,totalSpend=MAX(0,totalSpend+:spendDelta),visitCount=MAX(0,visitCount+:visitDelta),lastVisitAt=:lastVisitAt WHERE id=:customerId") suspend fun updateCustomerStats(customerId:String,pointsDelta:Int,spendDelta:Long,visitDelta:Int,lastVisitAt:Long?)
@Query("UPDATE CustomerEntity SET name=:name,phone=:phone,address=:address WHERE id=:id") suspend fun updateCustomerProfileFields(id:String,name:String,phone:String,address:String):Int
@Query("UPDATE CustomerEntity SET tier=:tier,tierManual=:manual WHERE id=:id") suspend fun updateCustomerTierFields(id:String,tier:String,manual:Boolean):Int
@Query("UPDATE PurchaseEntity SET status='DELETED' WHERE id=:id AND status='ACTIVE'") suspend fun softDeletePurchase(id:String):Int
@Query("UPDATE PurchaseEntity SET invoiceImageUri=:uri WHERE id=:id") suspend fun updatePurchaseImage(id:String,uri:String?)
@Query("UPDATE PurchaseEntity SET expenseCategory=:category WHERE id=:id") suspend fun updatePurchaseExpenseCategory(id:String,category:String):Int
@Query("UPDATE ProfitPartnerEntity SET active=0") suspend fun deactivateProfitPartners()
@Query("UPDATE PurchaseEntity SET paidByName=:newName WHERE lower(trim(paidByName))=lower(trim(:oldName))") suspend fun renamePurchasePayerName(oldName:String,newName:String):Int
@Query("UPDATE FinancialMovementEntity SET counterpartyName=:newName WHERE lower(trim(counterpartyName))=lower(trim(:oldName))") suspend fun renameReimbursementCounterparty(oldName:String,newName:String):Int
}
