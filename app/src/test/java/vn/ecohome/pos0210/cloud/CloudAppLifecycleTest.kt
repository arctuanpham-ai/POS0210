package vn.ecohome.pos0210.cloud

import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test

class CloudAppLifecycleTest {
    @Test fun simultaneous_backup_and_realtime_create_one_app() {
        val app=AtomicReference<Any?>()
        val creations=AtomicInteger()
        val start=CountDownLatch(1)
        val pool=Executors.newFixedThreadPool(12)
        try {
            val calls=(1..12).map { pool.submit<Any> {
                start.await()
                CloudAppLifecycle.getOrCreate(
                    find={val found=app.get();Thread.sleep(10);found},
                    create={
                        check(creations.incrementAndGet()==1){"FirebaseApp name already exists"}
                        Any().also{app.set(it)}
                    }
                )
            } }
            start.countDown()
            val results=calls.map { runCatching{it.get(3,TimeUnit.SECONDS)} }
            assertEquals("only one named app must be created",1,creations.get())
            results.forEach { assertSame(app.get(),it.getOrThrow()) }
        } finally { pool.shutdownNow() }
    }
    @Test fun existing_app_is_reused_without_creation() {
        val app=Any()
        assertSame(app,CloudAppLifecycle.getOrCreate(find={app},create={error("must reuse app")}))
    }
}
