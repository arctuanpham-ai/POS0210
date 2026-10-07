package vn.ecohome.pos0210.cloud

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CloudSyncPolicyTest{
    @Test fun sensitiveLocalSettingsNeverUpload(){
        assertFalse(CloudSyncPolicy.shouldUploadSetting("storage_root_uri"))
        assertFalse(CloudSyncPolicy.shouldUploadSetting("printer_mac"))
        assertFalse(CloudSyncPolicy.shouldUploadSetting("firebase_api_key"))
        assertFalse(CloudSyncPolicy.shouldUploadSetting("employee_pin"))
    }
    @Test fun approvedBusinessConfigurationCanUpload(){
        assertTrue(CloudSyncPolicy.shouldUploadSetting("bank_name"))
        assertTrue(CloudSyncPolicy.shouldUploadSetting("qr_prefix"))
        assertTrue(CloudSyncPolicy.shouldUploadSetting("vip_discount_percent"))
    }
}
