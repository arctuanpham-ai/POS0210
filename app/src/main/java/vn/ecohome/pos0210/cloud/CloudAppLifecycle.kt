package vn.ecohome.pos0210.cloud

internal object CloudAppLifecycle {
    private val monitor=Any()
    fun <T> getOrCreate(find:()->T?,create:()->T):T = synchronized(monitor){find()?:create()}
    fun mutate(block:()->Unit) = synchronized(monitor){block()}
}
