package vn.ecohome.pos0210

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MaterialCatalogTest {
    private val fixed = { "ab12-cd34-ef56-gh78" }

    @Test fun codeHasGroupPrefixAndTwelveUppercaseChars() {
        val code = MaterialCatalog.newMaterialCode("THIT") { "ab12-cd34-ef56-gh78" }
        assertEquals("THIT-CD34EF56GH78", code)
        assertEquals("THIT", MaterialCatalog.groupCodeFromMaterialCode(code))
        assertEquals("Thịt, gia cầm", MaterialCatalog.groupLabelFromMaterialCode(code))
    }

    @Test fun legacyAndroidCodesAreNotGroupCodes() {
        assertNull(MaterialCatalog.groupCodeFromMaterialCode("pc_production"))
        assertNull(MaterialCatalog.groupCodeFromMaterialCode("web-inventory_purchase"))
        assertNull(MaterialCatalog.groupCodeFromMaterialCode(""))
    }

    @Test fun unknownGroupFallsBackToOther() {
        assertEquals("KHAC", MaterialCatalog.groupCodeOf("không có nhóm này"))
        assertEquals("THIT", MaterialCatalog.groupCodeOf("Thịt, gia cầm"))
        assertEquals("Vật tư khác", MaterialCatalog.groupLabel("???"))
    }

    @Test fun searchIgnoresDiacriticsAndOrder() {
        assertTrue(MaterialCatalog.matches("Thịt bò", "thit bo"))
        assertTrue(MaterialCatalog.matches("Đường cát", "duong"))
        assertTrue(MaterialCatalog.matches("Thịt bò", "bo thit"))
        assertFalse(MaterialCatalog.matches("Thịt bò", "gà"))
        assertTrue(MaterialCatalog.matches("Bất kỳ", ""))
    }

    @Test fun suggestRanksExactThenPrefixThenContains() {
        val known = listOf(
            KnownMaterial("Cà phê rang xay", "CAPHE-AAAAAAAAAAAA", "kg"),
            KnownMaterial("Cà phê", "CAPHE-BBBBBBBBBBBB", "kg"),
            KnownMaterial("Bột cà phê", "CAPHE-CCCCCCCCCCCC", "gói")
        )
        val result = MaterialCatalog.suggest(known, "ca phe")
        assertEquals(listOf("Cà phê", "Cà phê rang xay", "Bột cà phê"), result.map { it.name })
        assertTrue(MaterialCatalog.suggest(known, "  ").isEmpty())
    }

    @Test fun knownMaterialsKeepLatestAndDropLegacyCodes() {
        val known = MaterialCatalog.knownFrom(listOf(
            Triple("Thịt bò", "THIT-OLD000000000", "kg"),
            Triple("thịt  BÒ", "THIT-NEW000000000", "kg"),
            Triple("Điện", "pc_fixed", "kWh"),
            Triple("  ", "KHAC-X", "cái")
        ))
        assertEquals(2, known.size)
        assertEquals("THIT-NEW000000000", known.first { MaterialCatalog.normalize(it.name) == "thit bo" }.code)
        assertEquals("", known.first { it.name == "Điện" }.code)
    }

    @Test fun typingKnownNameReusesItsCodeGroupAndUnit() {
        val known = listOf(KnownMaterial("Thịt bò", "THIT-AAAAAAAAAAAA", "kg"), KnownMaterial("Chanh", "RAU-BBBBBBBBBBBB", "quả"))
        val line = MaterialCatalog.withName(DraftReceiptLine("l1"), "chanh", known, fixed)
        assertEquals("RAU-BBBBBBBBBBBB", line.code)
        assertEquals("RAU", line.groupCode)
        assertEquals("quả", line.unit)
    }

    @Test fun typingNewNameGeneratesCodeInSelectedGroupAndKeepsItWhileTyping() {
        val first = MaterialCatalog.withName(DraftReceiptLine("l1", groupCode = "THIT"), "Gà", emptyList(), fixed)
        assertEquals("THIT-CD34EF56GH78", first.code)
        val more = MaterialCatalog.withName(first, "Gà ta", emptyList()) { "zzzzzzzzzzzz" }
        assertEquals(first.code, more.code)
        assertEquals("", MaterialCatalog.withName(more, "", emptyList()).code)
    }

    @Test fun changingGroupRegeneratesPrefixOnlyWhenNamed() {
        val empty = MaterialCatalog.withGroup(DraftReceiptLine("l1"), "THIT", fixed)
        assertEquals("THIT", empty.groupCode)
        assertEquals("", empty.code)
        val named = MaterialCatalog.withGroup(DraftReceiptLine("l1", name = "Gà", code = "KHAC-OLD000000000"), "THIT", fixed)
        assertEquals("THIT-CD34EF56GH78", named.code)
    }

    @Test fun pickingSuggestionFillsAllFields() {
        val picked = MaterialCatalog.withKnown(DraftReceiptLine("l1"), KnownMaterial("Sữa tươi", "SUA-CCCCCCCCCCCC", "hộp"), fixed)
        assertEquals("Sữa tươi", picked.name)
        assertEquals("SUA-CCCCCCCCCCCC", picked.code)
        assertEquals("SUA", picked.groupCode)
        assertEquals("hộp", picked.unit)
    }

    @Test fun draftLineValidationAndAmount() {
        val ok = DraftReceiptLine("l1", name = "Gà", qtyText = "1,5", unit = "kg", priceText = "100000")
        assertTrue(ok.isValid)
        assertEquals(150_000L, ok.amount)
        assertFalse(ok.copy(name = " ").isValid)
        assertFalse(ok.copy(qtyText = "0").isValid)
        assertFalse(ok.copy(priceText = "").isValid)
        assertFalse(ok.copy(unit = "").isValid)
    }
}
