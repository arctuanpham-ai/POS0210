package vn.ecohome.pos0210.cloud

import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import org.junit.Assert.*
import org.junit.Test

class CloudExecutionTest {
    @Test fun busy_operation_returns_without_waiting() = runBlocking {
        val mutex=Mutex(locked=true)
        val result=withTimeout(500) { CloudExecution.operation("REALTIME",mutex) { error("must not run") } }
        assertTrue(result.exceptionOrNull()?.message.orEmpty().contains("MUTEX_BUSY"))
    }
    @Test fun timeout_identifies_firebase_stage_and_releases_lock() = runBlocking {
        val mutex=Mutex()
        val result=CloudExecution.operation("REALTIME",mutex) {
            CloudExecution.stage("PUSH_PENDING_CATALOG",10) { delay(1000) }
        }
        assertTrue(result.exceptionOrNull()?.message.orEmpty().contains("PUSH_PENDING_CATALOG"))
        assertFalse(mutex.isLocked)
    }
    @Test fun worker_cancellation_is_not_converted_to_success_or_retry() = runBlocking {
        val mutex=Mutex()
        val task=launch {
            CloudExecution.operation("BACKUP",mutex) { delay(10000) }
            fail("cancelled operation returned")
        }
        yield();task.cancelAndJoin()
        assertFalse(mutex.isLocked)
    }
    @Test fun independent_backup_lock_does_not_block_realtime() = runBlocking {
        val backup=Mutex(locked=true)
        val realtime=Mutex()
        assertTrue(CloudExecution.operation("REALTIME",realtime) { 42 }.isSuccess)
        assertTrue(backup.isLocked)
    }
}
