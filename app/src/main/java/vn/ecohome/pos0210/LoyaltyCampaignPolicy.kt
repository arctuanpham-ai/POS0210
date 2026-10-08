package vn.ecohome.pos0210

object LoyaltyCampaignPolicy {
    fun isValid(triggerType: String, threshold: Long, expiresDays: Int?): Boolean =
        triggerType in setOf("BILL_COUNT", "SPEND", "POINTS") &&
            threshold > 0L &&
            (expiresDays == null || expiresDays > 0)
}
