package vn.ecohome.pos0210.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MenuPullPolicyTest {
    private val now = 100_000_000L
    @Test fun skipsWhenVersionUnchangedAndRecent() {
        assertTrue(MenuPullPolicy.skip(5L, 5L, now - 3_600_000L, now))
    }
    @Test fun pullsWhenVersionChangedFirstTimeOrOld() {
        assertFalse(MenuPullPolicy.skip(6L, 5L, now - 60_000L, now))
        assertFalse(MenuPullPolicy.skip(0L, -1L, 0L, now))
        assertFalse(MenuPullPolicy.skip(5L, 5L, now - 25 * 3_600_000L, now))
    }
    @Test fun codeFromCloudUsedWhenFreeOrOwn() {
        assertEquals("CF-010", MenuPullPolicy.safeCode("CF-010", null, "a", "CF-001"))
        assertEquals("CF-010", MenuPullPolicy.safeCode("CF-010", "a", "a", "CF-010"))
    }
    @Test fun clashKeepsOldCodeOrSkipsNewItem() {
        assertEquals("CF-001", MenuPullPolicy.safeCode("CF-010", "b", "a", "CF-001"))
        assertNull(MenuPullPolicy.safeCode("CF-010", "b", "new", null))
    }
}
