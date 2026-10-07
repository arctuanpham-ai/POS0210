package vn.ecohome.pos0210.data

import android.content.Context

object DatabaseHealth {
    fun validate(context: Context): Result<Unit> = runCatching {
        val db = PosDatabase.get(context).openHelper.writableDatabase

        db.query("PRAGMA integrity_check").use { cursor ->
            require(cursor.moveToFirst()) { "Không đọc được integrity_check" }
            require(cursor.getString(0).equals("ok", ignoreCase = true)) {
                "SQLite integrity_check thất bại: ${cursor.getString(0)}"
            }
        }

        val orphanChecks = listOf(
            "Payment không có Bill" to
                "SELECT COUNT(*) FROM PaymentEntity p LEFT JOIN BillEntity b ON b.id=p.billId WHERE b.id IS NULL",
            "Bill customer không tồn tại" to
                "SELECT COUNT(*) FROM BillEntity b LEFT JOIN CustomerEntity c ON c.id=b.customerId WHERE b.customerId IS NOT NULL AND c.id IS NULL",
            "Order item không có batch" to
                "SELECT COUNT(*) FROM OrderItemEntity oi LEFT JOIN OrderBatchEntity ob ON ob.id=oi.batchId WHERE ob.id IS NULL",
            "Order batch không có session" to
                "SELECT COUNT(*) FROM OrderBatchEntity ob LEFT JOIN TableSessionEntity s ON s.id=ob.sessionId WHERE s.id IS NULL",
            "Bill không có session" to
                "SELECT COUNT(*) FROM BillEntity b LEFT JOIN TableSessionEntity s ON s.id=b.sessionId WHERE s.id IS NULL",
            "Điểm customer không có customer" to
                "SELECT COUNT(*) FROM CustomerPointTransactionEntity p LEFT JOIN CustomerEntity c ON c.id=p.customerId WHERE c.id IS NULL",
            "Bill adjustment không có bill" to
                "SELECT COUNT(*) FROM BillAdjustmentEntity a LEFT JOIN BillEntity b ON b.id=a.billId WHERE b.id IS NULL",
            "Kitchen PrintJob không có batch" to
                "SELECT COUNT(*) FROM PrintJobEntity j LEFT JOIN OrderBatchEntity b ON b.id=j.batchId WHERE j.type='KITCHEN' AND j.batchId IS NOT NULL AND b.id IS NULL"
        )

        orphanChecks.forEach { (label, sql) ->
            db.query(sql).use { cursor ->
                require(cursor.moveToFirst()) { "Không kiểm tra được: $label" }
                val count = cursor.getLong(0)
                require(count == 0L) { "$label: $count bản ghi" }
            }
        }

        db.query("SELECT COUNT(*) FROM PaymentEntity p INNER JOIN BillEntity b ON b.id=p.billId WHERE p.amount!=b.total").use { cursor ->
            require(cursor.moveToFirst())
            val count = cursor.getLong(0)
            require(count == 0L) { "Payment amount lệch Bill total: $count bill" }
        }

        db.query("SELECT COUNT(*) FROM CustomerEntity WHERE points<0 OR totalSpend<0 OR visitCount<0").use { cursor ->
            require(cursor.moveToFirst())
            val count = cursor.getLong(0)
            require(count == 0L) { "Customer có số liệu âm: $count hồ sơ" }
        }
    }
    fun diagnoseOperational(context: Context): List<String> {
        val db = PosDatabase.get(context).openHelper.writableDatabase
        val issues = mutableListOf<String>()

        fun count(label: String, sql: String) {
            db.query(sql).use { cursor ->
                if (!cursor.moveToFirst()) {
                    issues.add("$label · không đọc được")
                    return@use
                }
                val n = cursor.getLong(0)
                if (n > 0L) issues.add("$label · $n")
            }
        }

        count(
            "Bill PAID không có Payment",
            "SELECT COUNT(*) FROM BillEntity b LEFT JOIN PaymentEntity p ON p.billId=b.id WHERE b.status='PAID' AND p.id IS NULL"
        )
        count(
            "Payment lệch tổng Bill",
            "SELECT COUNT(*) FROM PaymentEntity p INNER JOIN BillEntity b ON b.id=p.billId WHERE b.status='PAID' AND p.amount!=b.total"
        )
        count(
            "Session CLOSED còn đơn WAITING",
            "SELECT COUNT(*) FROM OrderBatchEntity ob INNER JOIN TableSessionEntity s ON s.id=ob.sessionId WHERE ob.status='WAITING' AND s.status!='OPEN'"
        )
        count(
            "Bill PAID nhưng Session chưa CLOSED",
            "SELECT COUNT(*) FROM BillEntity b INNER JOIN TableSessionEntity s ON s.id=b.sessionId WHERE b.status='PAID' AND s.status!='CLOSED'"
        )
        count(
            "Session có nhiều hơn 1 Bill PAID",
            "SELECT COUNT(*) FROM (SELECT sessionId,COUNT(*) c FROM BillEntity WHERE status='PAID' GROUP BY sessionId HAVING c>1)"
        )
        count(
            "Customer lệch tổng chi tiêu",
            "SELECT COUNT(*) FROM CustomerEntity c WHERE c.totalSpend != COALESCE((SELECT SUM(b.total) FROM BillEntity b WHERE b.customerId=c.id AND b.status='PAID'),0)"
        )
        count(
            "Customer lệch số lần ghé",
            "SELECT COUNT(*) FROM CustomerEntity c WHERE c.visitCount != COALESCE((SELECT COUNT(*) FROM BillEntity b WHERE b.customerId=c.id AND b.status='PAID'),0)"
        )
        count(
            "Customer lệch sổ điểm",
            "SELECT COUNT(*) FROM CustomerEntity c WHERE c.points != COALESCE((SELECT SUM(p.delta) FROM CustomerPointTransactionEntity p WHERE p.customerId=c.id),0)"
        )
        count(
            "Bill PAID có Payment method không hợp lệ",
            "SELECT COUNT(*) FROM PaymentEntity p INNER JOIN BillEntity b ON b.id=p.billId WHERE b.status='PAID' AND p.method NOT IN ('CASH','TRANSFER')"
        )
        count(
            "Bill PAID có nhiều hơn 1 Payment",
            "SELECT COUNT(*) FROM (SELECT b.id,COUNT(p.id) c FROM BillEntity b INNER JOIN PaymentEntity p ON p.billId=b.id WHERE b.status='PAID' GROUP BY b.id HAVING c>1)"
        )
        count(
            "Bill lệch subtotal so với món",
            "SELECT COUNT(*) FROM BillEntity b WHERE b.status='PAID' AND b.subtotal != COALESCE((SELECT SUM(oi.qty*oi.unitPriceSnapshot) FROM OrderBatchEntity ob INNER JOIN OrderItemEntity oi ON oi.batchId=ob.id WHERE ob.sessionId=b.sessionId AND ob.status!='CANCELLED'),0)"
        )
        count(
            "Session CLOSED còn batch DRAFT",
            "SELECT COUNT(*) FROM OrderBatchEntity ob INNER JOIN TableSessionEntity s ON s.id=ob.sessionId WHERE ob.status='DRAFT' AND s.status='CLOSED'"
        )
        count(
            "Trùng số thứ tự đơn trong cùng session",
            "SELECT COUNT(*) FROM (SELECT sessionId,sequence,COUNT(*) c FROM OrderBatchEntity GROUP BY sessionId,sequence HAVING c>1)"
        )
        count(
            "Kitchen PRINTED nhưng batch vẫn DRAFT",
            "SELECT COUNT(*) FROM PrintJobEntity j INNER JOIN OrderBatchEntity b ON b.id=j.batchId WHERE j.type='KITCHEN' AND j.status='PRINTED' AND b.status='DRAFT'"
        )
        count(
            "Phiếu nhập lệch tổng chi tiết",
            "SELECT COUNT(*) FROM PurchaseEntity p WHERE p.status='ACTIVE' AND p.total != COALESCE((SELECT SUM(pi.amount) FROM PurchaseItemEntity pi WHERE pi.purchaseId=p.id),0)"
        )

        return issues
    }
}
