package vn.ecohome.pos0210

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoyaltyCampaignPolicyTest {
    @Test fun accepts_supported_triggers_and_valid_expiry() {
        assertTrue(LoyaltyCampaignPolicy.isValid("BILL_COUNT", 5, 30))
        assertTrue(LoyaltyCampaignPolicy.isValid("SPEND", 100_000, null))
        assertTrue(LoyaltyCampaignPolicy.isValid("POINTS", 10, 1))
    }

    @Test fun rejects_invalid_campaign_threshold_or_expiry() {
        assertFalse(LoyaltyCampaignPolicy.isValid("UNKNOWN", 5, null))
        assertFalse(LoyaltyCampaignPolicy.isValid("BILL_COUNT", 0, null))
        assertFalse(LoyaltyCampaignPolicy.isValid("SPEND", 1, 0))
    }
}
