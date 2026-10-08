package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Test

class LoyaltyAwardPolicyTest {
    @Test fun repeatCampaignIssuesOneRewardForEachUnissuedThreshold() {
        assertEquals(2, LoyaltyAwardPolicy.additionalAwards(
            progress = 10,
            threshold = 5,
            cycleMode = "REPEAT",
            issued = 0
        ))
    }

    @Test fun oneTimeCampaignNeverIssuesMoreThanOneReward() {
        assertEquals(1, LoyaltyAwardPolicy.additionalAwards(
            progress = 100,
            threshold = 5,
            cycleMode = "ONCE",
            issued = 0
        ))
        assertEquals(0, LoyaltyAwardPolicy.additionalAwards(
            progress = 100,
            threshold = 5,
            cycleMode = "ONCE",
            issued = 1
        ))
    }
}
