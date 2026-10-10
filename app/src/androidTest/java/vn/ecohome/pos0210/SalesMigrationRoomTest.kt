package vn.ecohome.pos0210

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import vn.ecohome.pos0210.data.*
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class SalesMigrationRoomTest {
    private val context:Context get()=ApplicationProvider.getApplicationContext()
    private fun open(file:File)=Room.databaseBuilder(context,PosDatabase::class.java,file.absolutePath)
        .setJournalMode(RoomDatabase.JournalMode.TRUNCATE).addMigrations(PosDatabase.MIGRATION_27_28).build()
    private suspend fun seed(db:PosDatabase) {
        val d=db.dao()
        d.insertSession(TableSessionEntity("s","t",0,"e",status="CLOSED"))
        d.insertBatch(OrderBatchEntity("b","s",1,"e",0,status="DELIVERED"))
        d.insertItems(listOf(OrderItemEntity("i","b","coffee","Cà phê",35000,2)))
        d.insertBill(BillEntity("bill","s","0210-1",0,1,70000,70000,"PAID"))
        d.insertPayment(PaymentEntity("pay","bill","TRANSFER",70000,"e",1))
    }
    private suspend fun assertPreserved(db:PosDatabase) {
        val d=db.dao();assertEquals(70000L,d.allPaidBillsSnapshot().single().total)
        assertEquals(70000L,d.reportPaymentsSnapshot().single().amount)
        assertEquals(2,d.paidItemSales().first().single().qty)
        assertEquals("Cà phê",d.paidItemSales().first().single().name)
    }
    @Test fun additive27To28MigrationKeepsAmountsAndDoesNotInventCategories()=runBlocking {
        val f=File(context.cacheDir,"qa-migrate-${UUID.randomUUID()}.db")
        try {
            open(f).let{db->seed(db);db.close()}
            SQLiteDatabase.openDatabase(f.absolutePath,null,SQLiteDatabase.OPEN_READWRITE).use{raw->
                val indexes=mutableListOf<String>()
                raw.rawQuery("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='OrderItemEntity' AND sql IS NOT NULL",null).use{c->while(c.moveToNext())indexes+=c.getString(0)}
                val cols=mutableListOf<String>()
                raw.rawQuery("PRAGMA table_info(OrderItemEntity)",null).use{c->while(c.moveToNext())if(c.getString(1) !in listOf("categoryIdSnapshot","categoryNameSnapshot","comboPartsSnapshot"))cols+=c.getString(1)}
                raw.execSQL("CREATE TABLE old_items (id TEXT NOT NULL PRIMARY KEY,batchId TEXT NOT NULL,menuItemId TEXT,itemNameSnapshot TEXT NOT NULL,unitPriceSnapshot INTEGER NOT NULL,qty INTEGER NOT NULL,note TEXT NOT NULL,adjustmentOfItemId TEXT,loyaltyRewardId TEXT,loyaltyLabel TEXT,buyGetPromotionId TEXT,buyGetLabel TEXT)")
                val names=cols.joinToString(",")
                raw.execSQL("INSERT INTO old_items ($names) SELECT $names FROM OrderItemEntity")
                raw.execSQL("DROP TABLE OrderItemEntity");raw.execSQL("ALTER TABLE old_items RENAME TO OrderItemEntity")
                indexes.forEach{raw.execSQL(it)};raw.version=27
            }
            open(f).let{db->
                try {assertPreserved(db);assertEquals(28,db.openHelper.writableDatabase.version)
                    assertNull(db.dao().paidItemSales().first().single().categoryName)
                    assertNull(db.dao().paidItemSales().first().single().comboPartsJson)
                } finally {db.close()}
            }
        } finally {f.delete()}
    }
    @Test fun closedDatabaseSnapshotRoundTripKeepsPaidOrderAndReport()=runBlocking {
        val source=File(context.cacheDir,"qa-source-${UUID.randomUUID()}.db")
        val copy=File(context.cacheDir,"qa-copy-${UUID.randomUUID()}.db")
        try {
            open(source).let{db->seed(db);db.close()}
            source.copyTo(copy)
            open(copy).let{db->try{assertPreserved(db)}finally{db.close()}}
        } finally {source.delete();copy.delete()}
    }
}
