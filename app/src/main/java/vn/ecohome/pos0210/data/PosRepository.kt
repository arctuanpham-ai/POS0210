package vn.ecohome.pos0210.data

import androidx.room.withTransaction
import java.util.UUID

class PosRepository(private val db:PosDatabase){
    private val dao=db.dao()
    fun areas()=dao.areas(); fun tables()=dao.tables(); fun categories()=dao.categories(); fun menuItems()=dao.menuItems(); fun employees()=dao.employees(); fun openSessions()=dao.openSessions(); fun paidBills()=dao.paidBills(); fun purchases()=dao.purchases()
    suspend fun saveArea(v:AreaEntity)=dao.saveArea(v)
    suspend fun saveTable(v:DiningTableEntity)=dao.saveTable(v)
    suspend fun saveCategory(v:MenuCategoryEntity)=dao.saveCategory(v)
    suspend fun saveMenuItem(v:MenuItemEntity)=dao.saveMenuItem(v)
    suspend fun saveEmployee(v:EmployeeEntity)=dao.saveEmployee(v)
    suspend fun saveSupplier(v:SupplierEntity)=dao.saveSupplier(v)
    suspend fun savePurchaseCategory(v:PurchaseCategoryEntity)=dao.savePurchaseCategory(v)

    suspend fun openSession(tableId:String,employeeId:String):TableSessionEntity {
        val now=System.currentTimeMillis(); val s=TableSessionEntity(UUID.randomUUID().toString(),tableId,now,employeeId)
        db.withTransaction { dao.insertSession(s); dao.audit(AuditEventEntity(UUID.randomUUID().toString(),"SESSION",s.id,"OPEN",employeeId,null,now,tableId)) }
        return s
    }

    suspend fun createBatch(sessionId:String,sequence:Int,ordererId:String,items:List<OrderItemEntity>):OrderBatchEntity {
        val now=System.currentTimeMillis()
        val cal=java.util.Calendar.getInstance().apply{
            timeInMillis=now
            set(java.util.Calendar.HOUR_OF_DAY,0);set(java.util.Calendar.MINUTE,0);set(java.util.Calendar.SECOND,0);set(java.util.Calendar.MILLISECOND,0)
        }
        lateinit var b:OrderBatchEntity
        db.withTransaction {
            val serviceNo=dao.maxServiceNoSince(cal.timeInMillis)+1
            val nextSequence=dao.maxBatchSequence(sessionId)+1
            b=OrderBatchEntity(UUID.randomUUID().toString(),sessionId,nextSequence,ordererId,now,serviceNo=serviceNo)
            val fixed=items.map{it.copy(id=if(it.id.isBlank()) UUID.randomUUID().toString() else it.id,batchId=b.id)}
            dao.insertBatch(b)
            dao.insertItems(fixed)
            dao.audit(AuditEventEntity(UUID.randomUUID().toString(),"BATCH",b.id,"CREATE",ordererId,null,now,"serviceNo=$serviceNo,items=${fixed.size}"))
        }
        return b
    }

    suspend fun queueKitchenPrint(batch:OrderBatchEntity):PrintJobEntity =
        db.withTransaction {
            dao.kitchenPrintJob(batch.id) ?: PrintJobEntity(
                UUID.randomUUID().toString(),batch.id,null,"KITCHEN",createdAt=System.currentTimeMillis()
            ).also { dao.insertPrintJob(it) }
        }

    suspend fun claimPrint(jobId:String,deviceId:String,expected:String="PENDING")=
        dao.claimPrint(jobId,expected,"CLAIMED",deviceId)==1

    suspend fun finalizeKitchenPrint(jobId:String,batchId:String,printedAt:Long):Boolean =
        db.withTransaction {
            if(dao.markPrintSuccess(jobId,printedAt)!=1) return@withTransaction false
            check(dao.transitionBatch(batchId,"DRAFT","WAITING",printedAt)==1) { "BATCH_STATE_CHANGED_DURING_PRINT" }
            true
        }

    suspend fun failKitchenPrint(jobId:String,error:String):Boolean =
        dao.markPrintFailed(jobId,error)==1

    suspend fun markDeliveredAudited(batch:OrderBatchEntity,employeeId:String,employeeName:String,action:String="DELIVERED"):Boolean =
        db.withTransaction {
            val now=System.currentTimeMillis()
            if(dao.markDelivered(batch.id,now,employeeId)!=1) return@withTransaction false
            dao.audit(AuditEventEntity(
                UUID.randomUUID().toString(),"BATCH",batch.id,action,employeeId,null,now,
                "serviceNo=${batch.serviceNo},by=$employeeName"
            ))
            true
        }

    suspend fun updateCustomerProfileAudited(customerId:String,name:String,phone:String,address:String,actorId:String):Boolean =
        db.withTransaction {
            val changed=dao.updateCustomerProfileFields(customerId,name,phone,address)
            if(changed!=1) return@withTransaction false
            dao.audit(AuditEventEntity(
                UUID.randomUUID().toString(),"CUSTOMER",customerId,"PROFILE_UPDATE",actorId,null,System.currentTimeMillis(),
                "name=$name,phone=$phone"
            ))
            true
        }

    suspend fun updateCustomerTierAudited(customerId:String,tier:String,manual:Boolean,actorId:String,action:String):Boolean =
        db.withTransaction {
            val changed=dao.updateCustomerTierFields(customerId,tier,manual)
            if(changed!=1) return@withTransaction false
            dao.audit(AuditEventEntity(
                UUID.randomUUID().toString(),"CUSTOMER",customerId,action,actorId,null,System.currentTimeMillis(),tier
            ))
            true
        }

    suspend fun completePayment(
        session:TableSessionEntity,
        preview:PricingPreview,
        method:String,
        cashierId:String,
        billNo:String,
        customerPhone:String="",
        customerName:String="",
        autoTier:Boolean=true,
        vipMinPoints:Int=200,
        vvipMinPoints:Int=500
    ):PaymentCommitResult {
        require(method=="CASH" || method=="TRANSFER") { "INVALID_PAYMENT_METHOD" }
        require(preview.subtotal>=0L && preview.total>=0L && preview.surcharge>=0L && preview.discount>=0L) { "INVALID_PAYMENT_AMOUNT" }
        require(preview.total == (preview.subtotal + preview.surcharge - preview.discount).coerceAtLeast(0L)) { "PRICING_TOTAL_MISMATCH" }
        val now=System.currentTimeMillis()
        val normalizedPhone=customerPhone.filter(Char::isDigit).take(15)
        if(normalizedPhone.isNotBlank()) require(normalizedPhone.length>=9) { "INVALID_CUSTOMER_PHONE" }
        return db.withTransaction {
            if(dao.unfulfilledCountForSession(session.id)>0) error("PENDING_ORDER_NOT_COMPLETED")
            val liveSubtotal=dao.sessionTotalSnapshot(session.id)
            if(liveSubtotal!=preview.subtotal) error("ORDER_TOTAL_CHANGED")
            var customer:CustomerEntity?=null
            var pointsBefore=0
            var pointsEarned=0
            var pointsAfter=0
            var tier:String?=null

            if(normalizedPhone.isNotBlank()){
                val current=dao.customerByPhone(normalizedPhone) ?: CustomerEntity(
                    id=UUID.randomUUID().toString(),
                    phone=normalizedPhone,
                    name=customerName.trim(),
                    tier="MEMBER"
                )
                pointsBefore=current.points
                pointsEarned=(preview.total/10000L).toInt()
                pointsAfter=pointsBefore+pointsEarned
                val safeVvip=vvipMinPoints.coerceAtLeast(vipMinPoints)
                tier=if(current.tierManual||!autoTier) current.tier else when {
                    pointsAfter>=safeVvip -> "VVIP"
                    pointsAfter>=vipMinPoints -> "VIP"
                    else -> "MEMBER"
                }
                customer=current.copy(
                    points=pointsAfter,
                    totalSpend=current.totalSpend+preview.total,
                    visitCount=current.visitCount+1,
                    lastVisitAt=now,
                    tier=tier ?: current.tier,
                    name=if(current.name.isBlank()) customerName.trim() else current.name
                )
            }

            val bill=BillEntity(
                UUID.randomUUID().toString(),session.id,billNo,session.openedAt,now,
                preview.subtotal,preview.total,"PAID",customer?.id
            )

            if(dao.closeSession(session.id,session.version)!=1) error("SESSION_ALREADY_CLOSED_OR_CHANGED")
            dao.insertBill(bill)
            dao.insertPayment(PaymentEntity(UUID.randomUUID().toString(),bill.id,method,preview.total,cashierId,now))

            customer?.let { cu ->
                dao.saveCustomer(cu)
                if(pointsEarned>0){
                    dao.insertCustomerPoint(CustomerPointTransactionEntity(
                        UUID.randomUUID().toString(),cu.id,bill.id,pointsEarned,
                        "TÍCH ĐIỂM ${bill.billNo}",now,cashierId
                    ))
                }
                dao.audit(AuditEventEntity(
                    UUID.randomUUID().toString(),"CUSTOMER",cu.id,"VISIT",cashierId,null,now,
                    "bill=${bill.billNo},spend=${preview.total},points=$pointsEarned,tier=${cu.tier}"
                ))
            }

            val adjustments=mutableListOf<BillAdjustmentEntity>()
            preview.surchargeRules.forEach { rule ->
                adjustments.add(BillAdjustmentEntity(
                    UUID.randomUUID().toString(),bill.id,rule.id,rule.name,"SURCHARGE",rule.percent,
                    preview.subtotal*rule.percent/100L,rule.code,now,cashierId
                ))
            }
            preview.discountRule?.let { rule ->
                adjustments.add(BillAdjustmentEntity(
                    UUID.randomUUID().toString(),bill.id,rule.id,rule.name,"DISCOUNT",rule.percent,
                    preview.discount,rule.code,now,cashierId
                ))
            }
            if(adjustments.isNotEmpty()) dao.insertBillAdjustments(adjustments)

            dao.audit(AuditEventEntity(
                UUID.randomUUID().toString(),"BILL",bill.id,"PAID",cashierId,null,now,
                "method=$method,subtotal=${preview.subtotal},total=${preview.total},customer=${customer?.id.orEmpty()}"
            ))

            PaymentCommitResult(bill,customer,pointsBefore,pointsEarned,pointsAfter,tier)
        }
    }

    suspend fun deleteBillsAtomic(
        targets:List<BillEntity>,
        reason:String,
        actorId:String,
        autoTier:Boolean,
        vipMinPoints:Int,
        vvipMinPoints:Int
    ):Int = db.withTransaction {
        var changed=0
        val safeVvip=vvipMinPoints.coerceAtLeast(vipMinPoints)
        val now=System.currentTimeMillis()
        targets.forEach { bill ->
            if(dao.softDeleteBill(bill.id)==1){
                changed++
                bill.customerId?.let { customerId ->
                    val delta=dao.pointDeltaForBill(bill.id)
                    val cu=dao.customerById(customerId)
                    if(delta!=0){
                        dao.insertCustomerPoint(CustomerPointTransactionEntity(
                            UUID.randomUUID().toString(),customerId,bill.id,-delta,
                            "HỦY/XÓA BILL ${bill.billNo}",now,actorId
                        ))
                    }
                    if(cu!=null){
                        val newPoints=dao.pointBalanceForCustomer(customerId).coerceAtLeast(0)
                        val newSpend=dao.paidSpendForCustomer(customerId).coerceAtLeast(0)
                        val newVisits=dao.paidVisitCountForCustomer(customerId).coerceAtLeast(0)
                        val lastVisit=dao.lastPaidVisitForCustomer(customerId)
                        val newTier=if(cu.tierManual||!autoTier) cu.tier else when {
                            newPoints>=safeVvip -> "VVIP"
                            newPoints>=vipMinPoints -> "VIP"
                            else -> "MEMBER"
                        }
                        dao.saveCustomer(cu.copy(
                            points=newPoints,totalSpend=newSpend,visitCount=newVisits,tier=newTier,lastVisitAt=lastVisit
                        ))
                    }
                }
                dao.audit(AuditEventEntity(
                    UUID.randomUUID().toString(),"BILL",bill.id,"DELETE_SOFT",actorId,null,now,
                    "reason=${reason.trim()},total=${bill.total}"
                ))
            }
        }
        changed
    }

    suspend fun deletePurchaseAudited(purchase:PurchaseEntity,reason:String,actorId:String,linkedAssetId:String?=null):Boolean =
        db.withTransaction {
            val changed=dao.softDeletePurchase(purchase.id)
            if(changed!=1) return@withTransaction false
            if(linkedAssetId!=null) dao.setAssetStatus(linkedAssetId,"DELETED")
            dao.audit(AuditEventEntity(
                UUID.randomUUID().toString(),"PURCHASE",purchase.id,"DELETE_SOFT",actorId,null,System.currentTimeMillis(),
                "reason=${reason.trim()},total=${purchase.total}"
            ))
            true
        }

    suspend fun closeCancelledSession(session:TableSessionEntity,actorId:String) {
        val now=System.currentTimeMillis()
        db.withTransaction {
            if(dao.closeSession(session.id,session.version)!=1) error("SESSION_ALREADY_CLOSED_OR_CHANGED")
            dao.audit(
                AuditEventEntity(
                    UUID.randomUUID().toString(),
                    "SESSION",
                    session.id,
                    "CLOSED_CANCELLED",
                    actorId,
                    null,
                    now,
                    "ALL_ORDERS_CANCELLED"
                )
            )
        }
    }

    suspend fun savePurchase(p:PurchaseEntity,items:List<PurchaseItemEntity>,asset:AssetEntity?=null){
        db.withTransaction{dao.insertPurchase(p);dao.insertPurchaseItems(items);asset?.let{dao.saveAsset(it)}}
    }
}
