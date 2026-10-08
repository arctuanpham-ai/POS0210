package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Test

class PayrollSettingsTest {
    @Test fun employeeHourlyRateOverridesDefaultOnlyWhenValid() {
        assertEquals(35_000L, PayrollSettings.hourlyRate("35000", 30_000L))
        assertEquals(30_000L, PayrollSettings.hourlyRate("", 30_000L))
        assertEquals(30_000L, PayrollSettings.hourlyRate("-1", 30_000L))
    }

    @Test fun multiplierUsesConfiguredPercentWithinSafeRange() {
        assertEquals(15_000, PayrollSettings.multiplierBasisPoints("150"))
        assertEquals(10_000, PayrollSettings.multiplierBasisPoints(""))
        assertEquals(10_000, PayrollSettings.multiplierBasisPoints("9999"))
    }
}
