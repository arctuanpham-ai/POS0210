package vn.ecohome.pos0210.cloud

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update

internal object CloudExecution {
    val active=MutableStateFlow<Map<String,Long>>(emptyMap())
    val history=MutableStateFlow<List<String>>(emptyList())
    fun trace(message:String) {
        history.update { (it+"${System.currentTimeMillis()} $message").takeLast(60) }
    }
    suspend fun <T> operation(name:String,mutex:Mutex,block:suspend()->T):Result<T> {
        if(!mutex.tryLock()) {
            trace("$name MUTEX_BUSY")
            return Result.failure(IllegalStateException("$name MUTEX_BUSY: tác vụ cùng loại đang chạy; không chờ khóa"))
        }
        val start=System.nanoTime()
        active.update{it+(name to System.currentTimeMillis())}
        trace("$name LOCK_ACQUIRED")
        try {
            val value=block()
            trace("$name SUCCESS elapsedMs=${(System.nanoTime()-start)/1_000_000}")
            return Result.success(value)
        } catch(e:CancellationException) {
            trace("$name CANCELLED")
            throw e
        } catch(e:Exception) {
            trace("$name FAILED ${e.message}")
            return Result.failure(e)
        } finally { active.update{it-name};mutex.unlock() }
    }
    suspend fun <T> stage(name:String,timeoutMs:Long,block:suspend()->T):T {
        val start=System.nanoTime()
        trace("$name START")
        try {
            val value=withTimeout(timeoutMs) { block() }
            trace("$name ACK elapsedMs=${(System.nanoTime()-start)/1_000_000}")
            return value
        } catch(e:TimeoutCancellationException) {
            currentCoroutineContext().ensureActive()
            trace("$name TIMEOUT elapsedMs=${(System.nanoTime()-start)/1_000_000}")
            throw IllegalStateException("$name FIREBASE_TIMEOUT after ${timeoutMs}ms; chưa được server xác nhận",e)
        } catch(e:CancellationException) { throw e }
        catch(e:Exception) {
            trace("$name ERROR ${e.javaClass.simpleName}: ${e.message}")
            throw IllegalStateException("$name: ${e.javaClass.simpleName}: ${e.message}",e)
        }
    }
}
