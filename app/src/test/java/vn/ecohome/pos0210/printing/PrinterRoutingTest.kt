package vn.ecohome.pos0210.printing

import org.junit.Assert.assertEquals
import org.junit.Test

class PrinterRoutingTest {
    @Test fun kitchenAndCancellationUseKitchenPrinter() {
        val routing = PrinterRouting.fromSettings("LEGACY", "KITCHEN", "RECEIPT")
        assertEquals("KITCHEN", routing.addressFor(PrintJobType.KITCHEN))
        assertEquals("KITCHEN", routing.addressFor(PrintJobType.CANCEL))
    }

    @Test fun paymentAndTestUseReceiptPrinter() {
        val routing = PrinterRouting.fromSettings("LEGACY", "KITCHEN", "RECEIPT")
        assertEquals("RECEIPT", routing.addressFor(PrintJobType.PAYMENT))
        assertEquals("RECEIPT", routing.addressFor(PrintJobType.TEST))
    }

    @Test fun legacyPrinterRemainsFallbackUntilRolesAreAssigned() {
        val routing = PrinterRouting.fromSettings("LEGACY")
        assertEquals("LEGACY", routing.addressFor(PrintJobType.KITCHEN))
        assertEquals("LEGACY", routing.addressFor(PrintJobType.PAYMENT))
    }
}
