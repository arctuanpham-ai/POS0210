package vn.ecohome.pos0210.data
import androidx.room.*
import kotlinx.coroutines.flow.Flow
data class TableServiceTimingRow(val sessionId:String,val firstOrderAt:Long?,val lastOrderSentAt:Long?,val sentBatchCount:Int,val waitingBatchCount:Int)
@Dao interface PosDao{
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertAttendanceSession(v:AttendanceSessionEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertAttendanceSessions(v:List<AttendanceSessionEntity>)
@Query("SELECT * FROM AttendanceSessionEntity WHERE employeeId=:employeeId AND status='OPEN' AND dataScope='LIVE' ORDER BY checkInAt DESC LIMIT 1") suspend fun openAttendance(employeeId:String):AttendanceSessionEntity?
@Query("SELECT * FROM AttendanceSessionEntity WHERE status='OPEN' AND dataScope='LIVE' ORDER BY checkInAt") fun openAttendances():Flow<List<AttendanceSessionEntity>>
@Query("SELECT * FROM AttendanceSessionEntity WHERE employeeId=:employeeId AND dataScope='LIVE' ORDER BY checkInAt DESC") fun attendanceHistory(employeeId:String):Flow<List<AttendanceSessionEntity>>
@Query("SELECT * FROM AttendanceSessionEntity WHERE checkInAt<:endAt AND COALESCE(checkOutAt,:now)>:startAt AND dataScope=:dataScope ORDER BY employeeId,checkInAt") suspend fun attendanceBetween(startAt:Long,endAt:Long,now:Long,dataScope:String="LIVE"):List<AttendanceSessionEntity>
@Query("SELECT * FROM AttendanceSessionEntity WHERE id=:id LIMIT 1") suspend fun attendanceById(id:String):AttendanceSessionEntity?
@Query("UPDATE AttendanceSessionEntity SET checkInAt=:checkInAt,checkOutAt=:checkOutAt,status=:status,note=:note,updatedAt=:updatedAt WHERE id=:id AND dataScope='LIVE'") suspend fun correctAttendance(id:String,checkInAt:Long,checkOutAt:Long?,status:String,note:String,updatedAt:Long):Int
@Query("UPDATE AttendanceSessionEntity SET checkOutAt=:at,status='CLOSED',updatedAt=:at WHERE id=:id AND status='OPEN' AND dataScope='LIVE'") suspend fun closeAttendance(id:String,at:Long):Int
@Query("DELETE FROM AttendanceSessionEntity WHERE dataScope=\'TEST\'") suspend fun deleteTestAttendances():Int
@Query("DELETE FROM AttendanceSessionEntity WHERE dataScope=\'LIVE\'") suspend fun deleteLiveAttendances():Int

@Query("SELECT * FROM AreaEntity WHERE active=1 ORDER BY sortOrder,name") fun areas():Flow<List<AreaEntity>>
@Query("SELECT * FROM DiningTableEntity WHERE active=1 ORDER BY sortOrder,name") fun tables():Flow<List<DiningTableEntity>>
@Query("SELECT * FROM MenuCategoryEntity WHERE active=1 ORDER BY sortOrder,name") fun categories():Flow<List<MenuCategoryEntity>>
@Query("SELECT * FROM MenuItemEntity ORDER BY sortOrder,name") fun menuItems():Flow<List<MenuItemEntity>>
@Query("SELECT * FROM ComboEntity ORDER BY sortOrder,name") fun combos():Flow<List<ComboEntity>>
@Query("SELECT * FROM ComboItemEntity WHERE comboId=:comboId") fun comboItems(comboId:String):Flow<List<ComboItemEntity>>
@Query("SELECT * FROM ComboItemEntity") suspend fun allComboItemsSnapshot():List<ComboItemEntity>
/** Xoá hẳn món CHƯA từng bán, không nằm trong combo hay khuyến mãi mua-tặng. Món đã bán thì không xoá được (trả 0). */
@Query("DELETE FROM MenuItemEntity WHERE id=:id AND NOT EXISTS(SELECT 1 FROM OrderItemEntity WHERE menuItemId=:id) AND NOT EXISTS(SELECT 1 FROM ComboItemEntity WHERE menuItemId=:id) AND NOT EXISTS(SELECT 1 FROM BuyGetPromotionEntity WHERE buyMenuItemId=:id OR giftMenuItemId=:id)") suspend fun deleteUnusedMenuItem(id:String):Int
@Query("SELECT COUNT(*) FROM OrderItemEntity WHERE menuItemId=:id") suspend fun orderCountForMenuItem(id:String):Int
@Query("SELECT * FROM ComboItemEntity") fun comboItemsAll():Flow<List<ComboItemEntity>>
@Query("SELECT menuItemId AS id, SUM(qty) AS n FROM OrderItemEntity WHERE menuItemId LIKE 'combo:%' AND qty>0 GROUP BY menuItemId") fun comboOrderCounts():Flow<List<ComboOrderCount>>
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
@Query("SELECT ob.* FROM OrderBatchEntity ob INNER JOIN TableSessionEntity s ON s.id=ob.sessionId WHERE ob.status='WAITING' AND (s.status='OPEN' OR s.flow='prepaid') ORDER BY ob.serviceNo,ob.createdAt") fun waitingBatches():Flow<List<OrderBatchEntity>>
@Query("SELECT COUNT(*) FROM OrderBatchEntity WHERE sessionId=:sessionId AND status='WAITING'") suspend fun waitingCountForSession(sessionId:String):Int
@Query("SELECT COUNT(*) FROM OrderBatchEntity WHERE sessionId=:sessionId AND status IN ('DRAFT','WAITING')") suspend fun unfulfilledCountForSession(sessionId:String):Int
@Query("SELECT COALESCE(MAX(sequence),0) FROM OrderBatchEntity WHERE sessionId=:sessionId") suspend fun maxBatchSequence(sessionId:String):Int
@Query("SELECT COALESCE(MAX(serviceNo),0) FROM OrderBatchEntity WHERE createdAt>=:dayStart") suspend fun maxServiceNoSince(dayStart:Long):Int
@Query("SELECT COALESCE(SUM(oi.qty),0) FROM OrderItemEntity oi JOIN OrderBatchEntity ob ON ob.id=oi.batchId WHERE oi.adjustmentOfItemId=:sourceId AND oi.qty<0 AND ob.status!='CANCELLED'") suspend fun sourceCorrectionQty(sourceId:String):Int
@Query("SELECT COALESCE(SUM(oi.qty),0) FROM OrderItemEntity oi JOIN OrderBatchEntity ob ON ob.id=oi.batchId WHERE oi.adjustmentOfItemId=:sourceId AND oi.qty<0 AND ob.status!='CANCELLED'") fun sourceCorrectionQtyFlow(sourceId:String):Flow<Int>
@Query("SELECT * FROM OrderItemEntity WHERE id=:id LIMIT 1") suspend fun orderItemById(id:String):OrderItemEntity?
@Query("SELECT * FROM OrderBatchEntity WHERE id=:id LIMIT 1") suspend fun orderBatchById(id:String):OrderBatchEntity?
@Query("SELECT * FROM OrderItemEntity WHERE batchId=:batchId") suspend fun batchItemsOnce(batchId:String):List<OrderItemEntity>
@Query("UPDATE OrderItemEntity SET deliveredQty=:q WHERE id=:id AND qty>0 AND adjustmentOfItemId IS NULL AND :q>=0 AND :q<=qty") suspend fun setItemDelivered(id:String,q:Int):Int
@Query("UPDATE OrderItemEntity SET deliveredQty=qty WHERE batchId=:batchId AND qty>0 AND adjustmentOfItemId IS NULL") suspend fun markAllItemsDelivered(batchId:String):Int
@Query("SELECT status FROM OrderBatchEntity WHERE id=:id") suspend fun batchStatus(id:String):String?
@Query("UPDATE OrderBatchEntity SET status='WAITING',deliveredAt=NULL,deliveredBy=NULL WHERE id=:id AND status='DELIVERED' AND EXISTS(SELECT 1 FROM TableSessionEntity s WHERE s.id=OrderBatchEntity.sessionId AND s.status='OPEN')") suspend fun reopenDelivered(id:String):Int
@Query("UPDATE OrderItemEntity SET deliveredQty=0 WHERE batchId=:batchId") suspend fun resetItemsDelivered(batchId:String):Int
@Query("SELECT i.itemNameSnapshot AS name, i.qty-i.deliveredQty AS remaining, b.sessionId AS sessionId, COALESCE(b.sentAt,b.createdAt) AS sentAt FROM OrderItemEntity i JOIN OrderBatchEntity b ON b.id=i.batchId WHERE b.status='WAITING' AND i.adjustmentOfItemId IS NULL AND i.qty>i.deliveredQty") fun waitingItemRows():Flow<List<WaitingItemRow>>
@Query("SELECT * FROM OrderBatchEntity WHERE status='DRAFT'") fun draftBatches():Flow<List<OrderBatchEntity>>
@Query("SELECT * FROM OrderItemEntity WHERE batchId=:batchId") fun batchItems(batchId:String):Flow<List<OrderItemEntity>>
@Query("SELECT COALESCE(SUM(qty*unitPriceSnapshot),0) FROM OrderItemEntity WHERE batchId IN (SELECT id FROM OrderBatchEntity WHERE sessionId=:sessionId AND status!='CANCELLED')") fun sessionTotal(sessionId:String):Flow<Long>
@Query("SELECT COALESCE(SUM(qty*unitPriceSnapshot),0) FROM OrderItemEntity WHERE batchId IN (SELECT id FROM OrderBatchEntity WHERE sessionId=:sessionId AND status!='CANCELLED')") suspend fun sessionTotalSnapshot(sessionId:String):Long
@Query("SELECT COALESCE(SUM(qty*unitPriceSnapshot),0) FROM OrderItemEntity WHERE batchId IN (SELECT id FROM OrderBatchEntity WHERE sessionId=:sessionId AND status!='CANCELLED') AND buyGetPromotionId IS NOT NULL") fun sessionBuyGetDiscount(sessionId:String):Flow<Long>
@Query("SELECT COALESCE(SUM(qty*unitPriceSnapshot),0) FROM OrderItemEntity WHERE batchId IN (SELECT id FROM OrderBatchEntity WHERE sessionId=:sessionId AND status!=\'CANCELLED\') AND loyaltyRewardId IS NOT NULL") fun sessionVoucherDiscount(sessionId:String):Flow<Long>
@Query("SELECT * FROM BillEntity WHERE status='PAID' AND dataScope='LIVE' ORDER BY closedAt DESC") fun paidBills():Flow<List<BillEntity>>
@Query("SELECT * FROM BillEntity WHERE status='PAID' AND dataScope='LIVE' ORDER BY closedAt DESC") suspend fun allPaidBillsSnapshot():List<BillEntity>
@Query("SELECT * FROM BillEntity WHERE status='PAID' AND dataScope='TEST' ORDER BY closedAt DESC") fun testPaidBills():Flow<List<BillEntity>>
@Query("DELETE FROM PaymentEntity WHERE dataScope='TEST'") suspend fun deleteTestPayments():Int
@Query("DELETE FROM BillAdjustmentEntity WHERE billId IN (SELECT id FROM BillEntity WHERE dataScope='TEST')") suspend fun deleteTestBillAdjustments():Int
@Query("DELETE FROM BillEntity WHERE dataScope='TEST'") suspend fun deleteTestBills():Int
@Query("DELETE FROM OrderItemEntity WHERE batchId IN (SELECT ob.id FROM OrderBatchEntity ob INNER JOIN TableSessionEntity s ON s.id=ob.sessionId WHERE s.dataScope='TEST')") suspend fun deleteTestOrderItems():Int
@Query("DELETE FROM OrderBatchEntity WHERE sessionId IN (SELECT id FROM TableSessionEntity WHERE dataScope='TEST')") suspend fun deleteTestBatches():Int
@Query("DELETE FROM TableSessionEntity WHERE dataScope='TEST'") suspend fun deleteTestSessions():Int
@Query("SELECT * FROM BillEntity WHERE id=:id LIMIT 1") suspend fun billById(id:String):BillEntity?
@Query("SELECT * FROM TableSessionEntity WHERE id=:id LIMIT 1") suspend fun sessionSnapshotById(id:String):TableSessionEntity?
@Query("SELECT * FROM PaymentEntity WHERE billId=:billId LIMIT 1") suspend fun paymentByBillId(billId:String):PaymentEntity?
@Query("SELECT * FROM BillAdjustmentEntity WHERE billId=:billId ORDER BY appliedAt") suspend fun adjustmentsByBillId(billId:String):List<BillAdjustmentEntity>
@Query("SELECT * FROM PaymentEntity WHERE dataScope='LIVE' ORDER BY paidAt DESC") fun payments():Flow<List<PaymentEntity>>
@Query("SELECT * FROM CustomerEntity WHERE active=1 ORDER BY lastVisitAt DESC") fun customers():Flow<List<CustomerEntity>>
@Query("SELECT * FROM CustomerEntity WHERE phone=:phone AND active=1 LIMIT 1") suspend fun customerByPhone(phone:String):CustomerEntity?
@Query("SELECT * FROM CustomerEntity WHERE id=:id LIMIT 1") suspend fun customerById(id:String):CustomerEntity?
@Query("SELECT * FROM CustomerPointTransactionEntity WHERE customerId=:customerId ORDER BY createdAt DESC") fun customerPoints(customerId:String):Flow<List<CustomerPointTransactionEntity>>
@Query("SELECT b.customerId AS customerId, oi.itemNameSnapshot AS name, oi.qty AS qty FROM BillEntity b INNER JOIN OrderBatchEntity ob ON ob.sessionId=b.sessionId INNER JOIN OrderItemEntity oi ON oi.batchId=ob.id WHERE b.status='PAID' AND b.dataScope='LIVE' AND b.customerId IS NOT NULL AND ob.status!='CANCELLED'") fun customerItemStats():Flow<List<CustomerItemStatRow>>
@Query("SELECT COALESCE(SUM(delta),0) FROM CustomerPointTransactionEntity WHERE billId=:billId") suspend fun pointDeltaForBill(billId:String):Int
@Query("SELECT * FROM LoyaltyCampaignEntity WHERE active=1 ORDER BY createdAt") suspend fun activeLoyaltyCampaignsSnapshot():List<LoyaltyCampaignEntity>
@Query("SELECT COUNT(*) FROM CustomerRewardEntity WHERE customerId=:customerId AND campaignId=:campaignId AND status IN ('AVAILABLE','REDEEMED')") suspend fun issuedRewardCount(customerId:String,campaignId:String):Int
@Query("SELECT COALESCE(SUM(total),0) FROM BillEntity WHERE customerId=:customerId AND status='PAID' AND dataScope='LIVE'") suspend fun paidSpendForCustomer(customerId:String):Long
@Query("SELECT COUNT(*) FROM BillEntity WHERE customerId=:customerId AND status='PAID' AND dataScope='LIVE'") suspend fun paidVisitCountForCustomer(customerId:String):Int
@Query("SELECT MAX(closedAt) FROM BillEntity WHERE customerId=:customerId AND status='PAID' AND dataScope='LIVE'") suspend fun lastPaidVisitForCustomer(customerId:String):Long?
@Query("SELECT COALESCE(SUM(delta),0) FROM CustomerPointTransactionEntity WHERE customerId=:customerId") suspend fun pointBalanceForCustomer(customerId:String):Int
@Query("SELECT * FROM PricingRuleEntity ORDER BY name") fun pricingRules():Flow<List<PricingRuleEntity>>
 @Query("SELECT * FROM BuyGetPromotionEntity ORDER BY name") fun buyGetPromotions():Flow<List<BuyGetPromotionEntity>>
 @Query("SELECT * FROM BuyGetPromotionEntity WHERE active=1") suspend fun activeBuyGetPromotionsSnapshot():List<BuyGetPromotionEntity>
 @Query("SELECT * FROM BuyGetPromotionEntity ORDER BY name") suspend fun allBuyGetPromotionsSnapshot():List<BuyGetPromotionEntity>
 @Query("UPDATE BuyGetPromotionEntity SET active=0") suspend fun deactivateAllBuyGetPromotions()
 @Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveBuyGetPromotion(v:BuyGetPromotionEntity)
 @Query("UPDATE BuyGetPromotionEntity SET active=:active,updatedAt=:updatedAt WHERE id=:id") suspend fun setBuyGetPromotionActive(id:String,active:Boolean,updatedAt:Long)
@Query("SELECT * FROM PricingRuleEntity WHERE active=1") suspend fun activePricingRulesSnapshot():List<PricingRuleEntity>
@Query("SELECT * FROM PricingRuleEntity ORDER BY name") suspend fun allPricingRulesSnapshot():List<PricingRuleEntity>
@Query("SELECT * FROM BillAdjustmentEntity ORDER BY appliedAt DESC") fun billAdjustments():Flow<List<BillAdjustmentEntity>>
@Query("""SELECT oi.itemNameSnapshot AS name, oi.qty AS qty, ob.sessionId AS sessionId,
oi.id AS lineId, oi.menuItemId AS menuItemId, oi.unitPriceSnapshot AS unitPrice,
oi.categoryIdSnapshot AS categoryId, oi.categoryNameSnapshot AS categoryName, oi.comboPartsSnapshot AS comboPartsJson,
oi.loyaltyRewardId AS loyaltyRewardId, oi.buyGetPromotionId AS buyGetPromotionId, oi.adjustmentOfItemId AS adjustmentOfItemId,
EXISTS(SELECT 1 FROM BillAdjustmentEntity a JOIN BillEntity b ON b.id=a.billId WHERE b.sessionId=ob.sessionId AND b.status='PAID' AND b.dataScope='LIVE' AND a.kind='DISCOUNT' AND a.amount>0) AS discounted
FROM OrderItemEntity oi JOIN OrderBatchEntity ob ON ob.id=oi.batchId JOIN TableSessionEntity s ON s.id=ob.sessionId
WHERE s.dataScope='LIVE' AND ob.status!='CANCELLED' AND EXISTS(SELECT 1 FROM BillEntity b WHERE b.sessionId=ob.sessionId AND b.status='PAID' AND b.dataScope='LIVE')""") fun paidItemSales():Flow<List<ItemSaleRow>>
@Query("""SELECT oi.itemNameSnapshot AS name, oi.qty AS qty, ob.sessionId AS sessionId,
oi.id AS lineId, oi.menuItemId AS menuItemId, oi.unitPriceSnapshot AS unitPrice,
oi.categoryIdSnapshot AS categoryId, oi.categoryNameSnapshot AS categoryName, oi.comboPartsSnapshot AS comboPartsJson,
oi.loyaltyRewardId AS loyaltyRewardId, oi.buyGetPromotionId AS buyGetPromotionId, oi.adjustmentOfItemId AS adjustmentOfItemId,
EXISTS(SELECT 1 FROM BillAdjustmentEntity a JOIN BillEntity b ON b.id=a.billId WHERE b.sessionId=ob.sessionId AND b.status='PAID' AND b.dataScope='LIVE' AND a.kind='DISCOUNT' AND a.amount>0) AS discounted
FROM OrderItemEntity oi JOIN OrderBatchEntity ob ON ob.id=oi.batchId JOIN TableSessionEntity s ON s.id=ob.sessionId
WHERE s.dataScope='LIVE' AND ob.status!='CANCELLED' AND EXISTS(SELECT 1 FROM BillEntity b WHERE b.sessionId=ob.sessionId AND b.status='PAID' AND b.dataScope='LIVE')""") suspend fun paidItemSalesSnapshot():List<ItemSaleRow>
@Query("SELECT * FROM PaymentEntity") suspend fun reportPaymentsSnapshot():List<PaymentEntity>
@Query("SELECT * FROM BillAdjustmentEntity") suspend fun reportAdjustmentsSnapshot():List<BillAdjustmentEntity>
@Query("SELECT COUNT(*) FROM OrderItemEntity oi LEFT JOIN OrderBatchEntity ob ON ob.id=oi.batchId LEFT JOIN TableSessionEntity s ON s.id=ob.sessionId WHERE ob.id IS NULL OR s.id IS NULL") suspend fun reportOrphanLineCount():Int
@Query("SELECT * FROM PurchaseEntity WHERE status='ACTIVE' ORDER BY purchasedAt DESC") fun purchases():Flow<List<PurchaseEntity>>
/** Phiếu chi từ web chưa được duyệt hoặc bị trả lại: chưa tính chi phí, báo cáo tháng cảnh báo trước khi chốt. */
@Query("SELECT * FROM PurchaseEntity WHERE status IN ('PENDING_REVIEW','REJECTED_REVIEW') ORDER BY purchasedAt DESC") fun unreviewedPurchases():Flow<List<PurchaseEntity>>
@Query("SELECT * FROM PurchaseEntity ORDER BY purchasedAt DESC") suspend fun allPurchasesSnapshot():List<PurchaseEntity>
@Query("SELECT * FROM PurchaseEntity WHERE id=:id LIMIT 1") suspend fun purchaseById(id:String):PurchaseEntity?
@Query("SELECT pi.purchaseId AS purchaseId, pi.categoryId AS categoryId, pi.amount AS amount, p.purchasedAt AS purchasedAt FROM PurchaseItemEntity pi INNER JOIN PurchaseEntity p ON p.id=pi.purchaseId WHERE p.status='ACTIVE'") fun purchaseCosts():Flow<List<PurchaseCostRow>>
@Query("SELECT * FROM PurchaseCategoryEntity WHERE active=1 ORDER BY sortOrder,name") fun purchaseCategories():Flow<List<PurchaseCategoryEntity>>
@Query("SELECT * FROM CostCodeEntity WHERE active=1 ORDER BY sortOrder,code") fun costCodes():Flow<List<CostCodeEntity>>
@Query("SELECT * FROM CostCodeEntity ORDER BY sortOrder,code") suspend fun allCostCodesSnapshot():List<CostCodeEntity>
@Query("SELECT * FROM PurchaseItemEntity") fun allPurchaseItems():Flow<List<PurchaseItemEntity>>
@Query("SELECT * FROM PurchaseItemEntity WHERE purchaseId=:purchaseId") suspend fun purchaseItemsSnapshot(purchaseId:String):List<PurchaseItemEntity>
@Query("SELECT * FROM PurchaseCategoryEntity ORDER BY sortOrder,name") suspend fun allPurchaseCategoriesSnapshot():List<PurchaseCategoryEntity>
@Query("SELECT * FROM PurchaseItemEntity WHERE purchaseId=:purchaseId") fun purchaseItems(purchaseId:String):Flow<List<PurchaseItemEntity>>
@Query("SELECT * FROM MonthlyAccountingEntity") fun monthlyAccounting():Flow<List<MonthlyAccountingEntity>>
@Query("SELECT * FROM MonthlyAccountingEntity ORDER BY monthKey") suspend fun allMonthlyAccountingSnapshot():List<MonthlyAccountingEntity>
@Query("SELECT * FROM PaymentEntity WHERE dataScope='LIVE' ORDER BY paidAt DESC") suspend fun allPaymentsSnapshot():List<PaymentEntity>
@Query("SELECT * FROM TableSessionEntity ORDER BY openedAt DESC") suspend fun allSessionsSnapshot():List<TableSessionEntity>
@Query("SELECT * FROM OrderBatchEntity ORDER BY createdAt") suspend fun allOrderBatchesSnapshot():List<OrderBatchEntity>
@Query("SELECT * FROM OrderItemEntity") suspend fun allOrderItemsSnapshot():List<OrderItemEntity>
@Query("SELECT * FROM AssetEntity ORDER BY purchaseDate DESC,name") suspend fun allAssetsSnapshot():List<AssetEntity>
@Query("SELECT * FROM AssetValuationEntity ORDER BY changedAt DESC") suspend fun allAssetValuationsSnapshot():List<AssetValuationEntity>
@Query("SELECT * FROM FinancialMovementEntity ORDER BY occurredAt DESC") suspend fun allFinancialMovementsSnapshot():List<FinancialMovementEntity>
@Query("SELECT * FROM OpeningCashAdjustmentEntity ORDER BY changedAt DESC") suspend fun allOpeningCashAdjustmentsSnapshot():List<OpeningCashAdjustmentEntity>
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
@Query("SELECT * FROM PrintJobEntity WHERE batchId=:rewardId AND type=\'VOUCHER\' LIMIT 1") suspend fun voucherPrintJob(rewardId:String):PrintJobEntity?
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
@Query("SELECT * FROM PaymentEntity WHERE dataScope='LIVE' ORDER BY paidAt DESC") suspend fun cloudPaymentsSnapshot():List<PaymentEntity>
@Query("SELECT * FROM PaymentEntity ORDER BY paidAt DESC") suspend fun cloudPaymentMirrorSnapshot():List<PaymentEntity>
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
/** Sửa hình thức thanh toán ghi nhầm của bill đã thanh toán. Không đổi số tiền; bỏ tiền khách đưa/thối vì không còn đúng. */
@Query("UPDATE PaymentEntity SET method=:method,cashReceived=NULL,change=NULL WHERE billId=:billId AND method<>:method AND EXISTS(SELECT 1 FROM BillEntity b WHERE b.id=:billId AND b.status='PAID')") suspend fun changePaymentMethod(billId:String,method:String):Int
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveCustomer(v:CustomerEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertCustomerPoint(v:CustomerPointTransactionEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertPrintJob(v:PrintJobEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveArea(v:AreaEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveTable(v:DiningTableEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveCategory(v:MenuCategoryEntity)
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveMenuItem(v:MenuItemEntity)
@Query("UPDATE MenuItemEntity SET imageUri=:uri WHERE id=:id") suspend fun updateMenuImage(id:String,uri:String?)
@Query("UPDATE ComboEntity SET imageUri=:uri WHERE id=:id") suspend fun updateComboImage(id:String,uri:String?)
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
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun enqueueSync(v:SyncQueueEntity)
@Query("SELECT * FROM SyncQueueEntity WHERE status='PENDING' AND nextAttemptAt<=:now ORDER BY createdAt LIMIT :limit") suspend fun pendingSync(now:Long,limit:Int=100):List<SyncQueueEntity>
@Query("SELECT * FROM SyncQueueEntity WHERE status IN ('PENDING','IN_FLIGHT') AND entityType IN ('MENU_ITEM','MENU_CATEGORY')") suspend fun unsentCatalogSync():List<SyncQueueEntity>
@Query("UPDATE SyncQueueEntity SET status='IN_FLIGHT',attempts=attempts+1,updatedAt=:now WHERE id=:id AND status='PENDING'") suspend fun claimSync(id:String,now:Long):Int
@Query("DELETE FROM SyncQueueEntity WHERE id=:id") suspend fun completeSync(id:String):Int
@Query("UPDATE SyncQueueEntity SET status='PENDING',nextAttemptAt=:nextAttemptAt,updatedAt=:now,lastError=:error WHERE id=:id") suspend fun retrySync(id:String,nextAttemptAt:Long,now:Long,error:String?):Int
@Query("UPDATE SyncQueueEntity SET status='PENDING' WHERE status='IN_FLIGHT'") suspend fun recoverInflightSync():Int
@Query("SELECT COUNT(*) FROM SyncQueueEntity WHERE status IN ('PENDING','IN_FLIGHT')") suspend fun pendingSyncCount():Int
@Query("UPDATE CloudSyncStateEntity SET bootstrapState=:state,bootstrapCompletedAt=:completedAt,lastPullAt=:lastPullAt WHERE id='firebase'") suspend fun updateBootstrapState(state:String,completedAt:Long?,lastPullAt:Long?):Int
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
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveWebExpensePurchase(v:PurchaseEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertPurchaseItems(v:List<PurchaseItemEntity>)
@Insert(onConflict=OnConflictStrategy.IGNORE) suspend fun insertCloudPurchaseItems(v:List<PurchaseItemEntity>):List<Long>
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveWebExpenseItems(v:List<PurchaseItemEntity>)
@Query("DELETE FROM PurchaseItemEntity WHERE purchaseId=:purchaseId") suspend fun deletePurchaseItemsForWebExpense(purchaseId:String):Int
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
@Query("SELECT * FROM CustomerRewardEntity WHERE customerId=:customerId AND status='AVAILABLE' AND (expiresAt IS NULL OR expiresAt>:now) ORDER BY earnedAt") suspend fun availableRewardsSnapshot(customerId:String,now:Long):List<CustomerRewardEntity>
@Query("SELECT * FROM CustomerRewardEntity WHERE id LIKE \'%\' || :suffix AND status=\'AVAILABLE\' AND (expiresAt IS NULL OR expiresAt>:now) LIMIT 1") suspend fun availableVoucherBySuffix(suffix:String,now:Long):CustomerRewardEntity?
@Query("SELECT * FROM LoyaltyCampaignEntity WHERE id=:id LIMIT 1") suspend fun loyaltyCampaignById(id:String):LoyaltyCampaignEntity?
@Query("SELECT * FROM LoyaltyCampaignEntity WHERE active=1 ORDER BY createdAt") fun activeLoyaltyCampaigns():Flow<List<LoyaltyCampaignEntity>>
@Query("SELECT * FROM LoyaltyCampaignEntity ORDER BY active DESC,createdAt DESC") fun allLoyaltyCampaigns():Flow<List<LoyaltyCampaignEntity>>
@Query("SELECT * FROM CustomerRewardEntity WHERE customerId=:customerId AND status='AVAILABLE' ORDER BY earnedAt") fun availableRewards(customerId:String):Flow<List<CustomerRewardEntity>>
@Query("SELECT COUNT(*) FROM CustomerRewardEntity WHERE customerId=:customerId AND campaignId=:campaignId AND sourceBillId=:billId") suspend fun rewardExists(customerId:String,campaignId:String,billId:String):Int
@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun upsertLoyaltyCampaign(v:LoyaltyCampaignEntity)
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertCustomerReward(v:CustomerRewardEntity)
@Query("UPDATE LoyaltyCampaignEntity SET active=:active,updatedAt=:at WHERE id=:id") suspend fun setLoyaltyCampaignActive(id:String,active:Boolean,at:Long)
@Query("UPDATE CustomerRewardEntity SET status='REDEEMED',redeemedAt=:at,redeemedBillId=:billId WHERE id=:id AND status='AVAILABLE'") suspend fun redeemReward(id:String,billId:String,at:Long):Int
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
@Query("UPDATE OrderBatchEntity SET status='CANCELLED' WHERE id=:id AND status IN ('DRAFT','WAITING','DELIVERED') AND EXISTS(SELECT 1 FROM TableSessionEntity s WHERE s.id=OrderBatchEntity.sessionId AND s.status='OPEN')") suspend fun cancelBatch(id:String):Int
@Query("UPDATE TableSessionEntity SET status='CLOSED',version=version+1 WHERE id=:id AND status='OPEN' AND version=:version") suspend fun closeSession(id:String,version:Long):Int
/** Đơn trả trước CHƯA thu tiền → trả sau ở bàn đã chọn. Chỉ đổi phiên (flow, bàn); món, giá, số đơn giữ nguyên. Đã có bill thì không đổi. */
@Query("UPDATE TableSessionEntity SET flow='postpaid',tableId=:tableId,version=version+1 WHERE id=:id AND status='OPEN' AND flow='prepaid' AND NOT EXISTS(SELECT 1 FROM BillEntity b WHERE b.sessionId=:id)") suspend fun convertPrepaidToPostpaid(id:String,tableId:String):Int
@Query("UPDATE PrintJobEntity SET status=:newStatus,claimedByDeviceId=:deviceId,attempts=attempts+1 WHERE id=:id AND status=:expected") suspend fun claimPrint(id:String,expected:String,newStatus:String,deviceId:String):Int
@Query("UPDATE PrintJobEntity SET status='REVIEW',error='APP_RESTART_DURING_PRINT' WHERE status='CLAIMED'") suspend fun recoverClaimedPrints():Int
@Query("UPDATE PrintJobEntity SET status='PRINTED',printedAt=:printedAt,error=NULL WHERE id=:id AND status='CLAIMED'") suspend fun markPrintSuccess(id:String,printedAt:Long):Int
@Query("UPDATE PrintJobEntity SET status='FAILED',error=:error WHERE id=:id AND status='CLAIMED'") suspend fun markPrintFailed(id:String,error:String):Int
@Query("UPDATE BillEntity SET status='DELETED' WHERE id=:id AND status='PAID'") suspend fun softDeleteBill(id:String):Int
@Query("UPDATE BillEntity SET status='DELETED' WHERE id IN (:ids) AND status='PAID'") suspend fun softDeleteBills(ids:List<String>):Int
@Query("UPDATE PaymentEntity SET dataScope='PREOPENING_RESET' WHERE billId IN (:billIds) AND dataScope='LIVE'") suspend fun archivePaymentsForBills(billIds:List<String>):Int
@Query("UPDATE CustomerRewardEntity SET status='CANCELLED' WHERE sourceBillId IN (:billIds) AND status='AVAILABLE'") suspend fun cancelRewardsForBills(billIds:List<String>):Int
@Query("UPDATE CustomerEntity SET points=points+:pointsDelta,totalSpend=MAX(0,totalSpend+:spendDelta),visitCount=MAX(0,visitCount+:visitDelta),lastVisitAt=:lastVisitAt WHERE id=:customerId") suspend fun updateCustomerStats(customerId:String,pointsDelta:Int,spendDelta:Long,visitDelta:Int,lastVisitAt:Long?)
@Query("UPDATE CustomerEntity SET active=0 WHERE id=:id AND active=1") suspend fun softDeleteCustomer(id:String):Int
@Query("UPDATE CustomerEntity SET name=:name,phone=:phone,address=:address WHERE id=:id") suspend fun updateCustomerProfileFields(id:String,name:String,phone:String,address:String):Int
@Query("UPDATE CustomerEntity SET tier=:tier,tierManual=:manual WHERE id=:id") suspend fun updateCustomerTierFields(id:String,tier:String,manual:Boolean):Int
@Query("UPDATE PurchaseEntity SET status='DELETED' WHERE id=:id AND status='ACTIVE'") suspend fun softDeletePurchase(id:String):Int
@Query("UPDATE PurchaseEntity SET invoiceImageUri=:uri WHERE id=:id") suspend fun updatePurchaseImage(id:String,uri:String?)
@Query("UPDATE PurchaseEntity SET expenseCategory=:category WHERE id=:id") suspend fun updatePurchaseExpenseCategory(id:String,category:String):Int
@Query("UPDATE ProfitPartnerEntity SET active=0") suspend fun deactivateProfitPartners()
@Query("UPDATE PurchaseEntity SET paidByName=:newName WHERE lower(trim(paidByName))=lower(trim(:oldName))") suspend fun renamePurchasePayerName(oldName:String,newName:String):Int
@Query("UPDATE FinancialMovementEntity SET counterpartyName=:newName WHERE lower(trim(counterpartyName))=lower(trim(:oldName))") suspend fun renameReimbursementCounterparty(oldName:String,newName:String):Int

@Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun saveShift(v:ShiftEntity)
@Query("SELECT * FROM ShiftEntity WHERE status='open' AND dataScope='LIVE' ORDER BY checkInClient DESC LIMIT 1") fun activeShiftFlow():Flow<ShiftEntity?>
@Query("SELECT * FROM ShiftEntity WHERE status='open' AND dataScope='LIVE' ORDER BY checkInClient DESC LIMIT 1") suspend fun activeShift():ShiftEntity?
@Query("SELECT * FROM ShiftEntity WHERE id=:id LIMIT 1") suspend fun shiftById(id:String):ShiftEntity?
@Query("SELECT * FROM ShiftEntity ORDER BY checkInClient DESC LIMIT 200") fun recentShifts():Flow<List<ShiftEntity>>
@Query("SELECT * FROM ShiftEntity ORDER BY checkInClient") suspend fun shiftsSnapshot():List<ShiftEntity>
@Query("UPDATE ShiftEntity SET lastActivityAt=:at,updatedAt=:at WHERE status='open' AND dataScope='LIVE'") suspend fun touchActiveShift(at:Long):Int
@Query("SELECT * FROM TableSessionEntity WHERE shiftId=:shiftId AND status='OPEN'") suspend fun openSessionsOfShift(shiftId:String):List<TableSessionEntity>
@Query("UPDATE TableSessionEntity SET shiftId=:shiftId WHERE id=:id") suspend fun setSessionShift(id:String,shiftId:String?):Int
@Query("UPDATE TableSessionEntity SET shiftId=:newShift WHERE shiftId='PENDING_NEXT'") suspend fun adoptPendingSessions(newShift:String):Int
@Query("SELECT COALESCE(SUM(p.amount),0) FROM PaymentEntity p JOIN BillEntity b ON b.id=p.billId JOIN TableSessionEntity s ON s.id=b.sessionId WHERE s.shiftId=:shiftId AND p.method=:method AND p.dataScope='LIVE' AND b.status='PAID'") suspend fun shiftPaymentTotal(shiftId:String,method:String):Long
@Query("SELECT COUNT(*) FROM BillEntity b JOIN TableSessionEntity s ON s.id=b.sessionId WHERE s.shiftId=:shiftId AND b.status='PAID' AND b.dataScope='LIVE'") suspend fun shiftPaidBillCount(shiftId:String):Int
@Query("SELECT * FROM EmployeeEntity WHERE id=:id LIMIT 1") suspend fun employeeById(id:String):EmployeeEntity?
@Query("DELETE FROM AttendanceSessionEntity WHERE id=:id AND dataScope='LIVE'") suspend fun deleteAttendance(id:String):Int
@Query("SELECT COALESCE(SUM(p.amount),0) - COALESCE((SELECT SUM(r.amount) FROM RefundEntity r WHERE r.shiftId=:shiftId AND r.method=:method AND r.dataScope='LIVE' AND r.createdAt<=:until),0) FROM PaymentEntity p JOIN BillEntity b ON b.id=p.billId JOIN TableSessionEntity s ON s.id=b.sessionId WHERE s.shiftId=:shiftId AND p.method=:method AND p.dataScope='LIVE' AND b.status IN ('PAID','REFUNDED') AND p.paidAt<=:until") suspend fun shiftPaymentTotalUntil(shiftId:String,method:String,until:Long):Long
@Query("SELECT COUNT(*) FROM BillEntity b JOIN TableSessionEntity s ON s.id=b.sessionId JOIN PaymentEntity p ON p.billId=b.id WHERE s.shiftId=:shiftId AND b.status='PAID' AND b.dataScope='LIVE' AND p.paidAt<=:until") suspend fun shiftPaidBillCountUntil(shiftId:String,until:Long):Int
@Query("SELECT DISTINCT s.id FROM TableSessionEntity s JOIN BillEntity b ON b.sessionId=s.id JOIN PaymentEntity p ON p.billId=b.id WHERE s.shiftId=:shiftId AND p.paidAt>:until") suspend fun sessionIdsPaidAfter(shiftId:String,until:Long):List<String>
@Insert(onConflict=OnConflictStrategy.ABORT) suspend fun insertRefund(v:RefundEntity)
@Query("SELECT * FROM RefundEntity ORDER BY createdAt DESC") fun refundsFlow():kotlinx.coroutines.flow.Flow<List<RefundEntity>>
@Query("UPDATE RefundEntity SET status='DONE',settledAt=:at,settleNote=:note WHERE id=:id AND status='FROZEN'") suspend fun settleRefund(id:String,at:Long,note:String):Int
@Query("SELECT * FROM RefundEntity ORDER BY createdAt") suspend fun refundsSnapshot():List<RefundEntity>
@Query("SELECT * FROM BillEntity WHERE sessionId=:sessionId LIMIT 1") suspend fun billBySessionId(sessionId:String):BillEntity?
@Query("UPDATE BillEntity SET status='REFUNDED' WHERE id=:id AND status='PAID'") suspend fun markBillRefunded(id:String):Int
@Query("UPDATE OrderBatchEntity SET status='CANCELLED' WHERE id=:id AND status IN ('WAITING','DELIVERED')") suspend fun cancelPaidBatch(id:String):Int
@Query("SELECT * FROM TableSessionEntity WHERE flow='prepaid' AND status='OPEN'") suspend fun openPrepaidSessions():List<TableSessionEntity>
/** Đơn trả trước đã lên màn thanh toán (đã hiện bill/QR) nhưng chưa xác nhận thu tiền. Không tự huỷ: chờ người xử lý. */
@Query("SELECT s.* FROM TableSessionEntity s WHERE s.flow='prepaid' AND s.status='OPEN' AND NOT EXISTS(SELECT 1 FROM BillEntity b WHERE b.sessionId=s.id) ORDER BY s.openedAt") fun unpaidPrepaidSessions():Flow<List<TableSessionEntity>>
@Query("SELECT COUNT(*) FROM TableSessionEntity s WHERE s.flow='prepaid' AND s.status='OPEN' AND s.dataScope='LIVE' AND NOT EXISTS(SELECT 1 FROM BillEntity b WHERE b.sessionId=s.id)") suspend fun unpaidPrepaidCount():Int
// Đơn hôm nay: MỖI BILL MỘT DÒNG, cả trả trước lẫn trả sau. Món lấy từ mọi phiếu còn hiệu lực của bill (bỏ phiếu đã huỷ khi sửa đơn).
@Query("SELECT s.id AS sessionId, " +
 "COALESCE((SELECT ob.id FROM OrderBatchEntity ob WHERE ob.sessionId=s.id AND ob.status!='CANCELLED' ORDER BY ob.sequence DESC LIMIT 1),(SELECT ob.id FROM OrderBatchEntity ob WHERE ob.sessionId=s.id ORDER BY ob.sequence DESC LIMIT 1),'') AS batchId, " +
 "COALESCE((SELECT MAX(ob.serviceNo) FROM OrderBatchEntity ob WHERE ob.sessionId=s.id AND ob.status!='CANCELLED'),(SELECT MAX(ob.serviceNo) FROM OrderBatchEntity ob WHERE ob.sessionId=s.id),0) AS serviceNo, " +
 "CASE WHEN EXISTS(SELECT 1 FROM OrderBatchEntity ob WHERE ob.sessionId=s.id AND ob.status IN ('DRAFT','WAITING')) THEN 'WAITING' WHEN EXISTS(SELECT 1 FROM OrderBatchEntity ob WHERE ob.sessionId=s.id AND ob.status NOT IN ('CANCELLED')) THEN 'DELIVERED' ELSE 'CANCELLED' END AS batchStatus, " +
 "b.id AS billId, b.total AS total, p.method AS method, p.cashReceived AS cashReceived, p.`change` AS `change`, p.paidAt AS paidAt, b.status AS billStatus, s.openedAt AS openedAt, COALESCE(t.name,'') AS tableName, " +
 "(SELECT group_concat(i.qty || ' × ' || i.itemNameSnapshot || CASE WHEN i.note<>'' THEN ' [' || i.note || ']' ELSE '' END, char(10)) FROM OrderItemEntity i JOIN OrderBatchEntity ob2 ON ob2.id=i.batchId WHERE ob2.sessionId=s.id AND (ob2.status!='CANCELLED' OR b.status='REFUNDED')) AS itemsText, " +
 "s.flow AS flow " +
 "FROM TableSessionEntity s JOIN BillEntity b ON b.sessionId=s.id LEFT JOIN PaymentEntity p ON p.billId=b.id LEFT JOIN DiningTableEntity t ON t.id=s.tableId " +
 "WHERE s.openedAt>=:since AND s.dataScope='LIVE' GROUP BY s.id ORDER BY COALESCE(p.paidAt,b.closedAt,s.openedAt) DESC") fun prepaidOrdersSince(since:Long):Flow<List<PrepaidOrderRow>>
/** Huỷ & hoàn tiền: huỷ mọi phiếu đã thu của bill (đơn đã sửa có thể gồm nhiều phiếu). */
@Query("UPDATE OrderBatchEntity SET status='CANCELLED' WHERE sessionId=:sessionId AND status IN ('WAITING','DELIVERED')") suspend fun cancelPaidBatchesOfSession(sessionId:String):Int
@Query("SELECT ob.id AS batchId, ob.sessionId AS sessionId, ob.serviceNo AS serviceNo, ob.sequence AS sequence, ob.createdAt AS createdAt, ob.sentAt AS sentAt, s.tableId AS tableId, COALESCE(t.name,'') AS tableName, s.flow AS flow, (SELECT group_concat(i.qty || ' × ' || i.itemNameSnapshot || CASE WHEN i.note<>'' THEN ' [' || i.note || ']' ELSE '' END, char(10)) FROM OrderItemEntity i WHERE i.batchId=ob.id) AS itemsText FROM OrderBatchEntity ob JOIN TableSessionEntity s ON s.id=ob.sessionId LEFT JOIN DiningTableEntity t ON t.id=s.tableId WHERE ob.status='WAITING' AND (s.status='OPEN' OR s.flow='prepaid') ORDER BY ob.serviceNo, ob.createdAt") fun waitingOrders():Flow<List<WaitingOrderRow>>
@Query("SELECT i.* FROM OrderItemEntity i JOIN OrderBatchEntity b ON b.id=i.batchId WHERE b.sessionId=:sessionId AND b.status!='CANCELLED'") fun sessionItems(sessionId:String):Flow<List<OrderItemEntity>>
}
