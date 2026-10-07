package vn.ecohome.pos0210.data

import android.content.Context
import android.net.Uri
import androidx.room.withTransaction
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

object ConfigBackup {
    private const val CONFIG_VERSION = 4
    private const val MASTER_NAME = "POS0210_MASTER.0210"

    fun exportConfig(context: Context, uri: Uri): Result<Unit> = runCatching {
        val db = PosDatabase.get(context)
        val dao = db.dao()
        val snapshot = runBlocking {
            ConfigSnapshot(
                dao.allAreasSnapshot(),
                dao.allTablesSnapshot(),
                dao.allCategoriesSnapshot(),
                dao.allMenuSnapshot(),
                dao.allCombosSnapshot(),
                dao.allComboItemsSnapshot(),
                dao.allEmployeesSnapshot(),
                dao.allPurchaseCategoriesSnapshot(),
                dao.allPricingRulesSnapshot(),
                dao.allSettingsSnapshot()
            )
        }

        val root = JSONObject()
        root.put("format", "POS0210_MASTER_CONFIG")
        root.put("version", CONFIG_VERSION)
        root.put("createdAt", System.currentTimeMillis())

        root.put("areas", JSONArray().apply {
            snapshot.areas.forEach { a ->
                put(JSONObject().apply {
                    put("id", a.id); put("name", a.name); put("sortOrder", a.sortOrder); put("active", a.active)
                })
            }
        })
        root.put("tables", JSONArray().apply {
            snapshot.tables.forEach { t ->
                put(JSONObject().apply {
                    put("id", t.id); put("areaId", t.areaId); put("name", t.name)
                    put("sortOrder", t.sortOrder); put("active", t.active)
                })
            }
        })
        root.put("categories", JSONArray().apply {
            snapshot.categories.forEach { c ->
                put(JSONObject().apply {
                    put("id", c.id); put("name", c.name); put("sortOrder", c.sortOrder); put("active", c.active)
                })
            }
        })

        val menuArray = JSONArray()
        val imageEntries = mutableMapOf<String, Uri>()
        snapshot.menu.forEach { m ->
            val obj = JSONObject().apply {
                put("id", m.id); put("categoryId", m.categoryId); put("name", m.name); put("price", m.price)
                put("productCode", m.productCode); put("description", m.description)
                put("sortOrder", m.sortOrder); put("active", m.active)
            }
            if (!m.imageUri.isNullOrBlank()) {
                val imageUri = Uri.parse(m.imageUri)
                val ext = imageUri.lastPathSegment?.substringAfterLast('.', "")?.takeIf { it.length in 2..5 } ?: "jpg"
                val entry = "images/menu_${m.id}.$ext"
                obj.put("imageEntry", entry)
                imageEntries[entry] = imageUri
            }
            menuArray.put(obj)
        }
        root.put("menu", menuArray)
        root.put("combos", JSONArray().apply {
            snapshot.combos.forEach { combo ->
                val obj = JSONObject().apply {
                    put("id", combo.id); put("name", combo.name); put("price", combo.price); put("description", combo.description)
                    put("sortOrder", combo.sortOrder); put("active", combo.active)
                }
                if (!combo.imageUri.isNullOrBlank()) {
                    val imageUri = Uri.parse(combo.imageUri)
                    val ext = imageUri.lastPathSegment?.substringAfterLast('.', "")?.takeIf { it.length in 2..5 } ?: "jpg"
                    val entry = "images/combo_${combo.id}.$ext"
                    obj.put("imageEntry", entry)
                    imageEntries[entry] = imageUri
                }
                put(obj)
            }
        })
        root.put("comboItems", JSONArray().apply {
            snapshot.comboItems.forEach { item ->
                put(JSONObject().apply {
                    put("id", item.id); put("comboId", item.comboId); put("menuItemId", item.menuItemId); put("qty", item.qty)
                })
            }
        })
        root.put("pricingRules", JSONArray().apply {
            snapshot.pricingRules.forEach { rule ->
                put(JSONObject().apply {
                    put("id", rule.id); put("name", rule.name); put("code", rule.code); put("kind", rule.kind)
                    put("percent", rule.percent); put("startAt", rule.startAt ?: JSONObject.NULL); put("endAt", rule.endAt ?: JSONObject.NULL)
                    put("startMinute", rule.startMinute ?: JSONObject.NULL); put("endMinute", rule.endMinute ?: JSONObject.NULL)
                    put("autoApply", rule.autoApply); put("active", rule.active)
                })
            }
        })

        root.put("employees", JSONArray().apply {
            snapshot.employees.forEach { e ->
                put(JSONObject().apply {
                    put("id", e.id); put("name", e.name); put("active", e.active); put("pin", e.pin); put("role", e.role)
                    put("canCheckout", e.canCheckout); put("canPurchase", e.canPurchase); put("canOrder", e.canOrder)
                    put("canSendKitchen", e.canSendKitchen); put("canViewReport", e.canViewReport)
                    put("canManageMenu", e.canManageMenu); put("canManageSystem", e.canManageSystem)
                })
            }
        })
        root.put("purchaseCategories", JSONArray().apply {
            snapshot.purchaseCategories.forEach { c ->
                put(JSONObject().apply {
                    put("id", c.id); put("name", c.name); put("defaultUnit", c.defaultUnit)
                    put("sortOrder", c.sortOrder); put("active", c.active)
                })
            }
        })
        root.put("settings", JSONArray().apply {
            snapshot.settings
                .filterNot { it.key == "autoback_tree_uri" || it.key == "storage_root_uri" || it.key == "master_config_uri" || it.key == "storage_write_enabled" }
                .forEach { s -> put(JSONObject().apply { put("key", s.key); put("value", s.value) }) }
        })

        context.contentResolver.openOutputStream(uri, "w").use { raw ->
            requireNotNull(raw)
            ZipOutputStream(raw).use { zip ->
                zip.putNextEntry(ZipEntry("config.json"))
                zip.write(root.toString().toByteArray(Charsets.UTF_8))
                zip.closeEntry()

                imageEntries.forEach { (entry, imageUri) ->
                    runCatching {
                        context.contentResolver.openInputStream(imageUri)?.use { input ->
                            zip.putNextEntry(ZipEntry(entry))
                            input.copyTo(zip)
                            zip.closeEntry()
                        }
                    }
                }
            }
        }
    }

    fun saveMaster(context: Context, rootTreeUriString: String): Result<Uri> = runCatching {
        val structure = SafPosStorage.ensureSelectedRoot(context, rootTreeUriString).getOrThrow()
        val existing = SafPosStorage.findFile(context, structure.config, MASTER_NAME)
        val target = existing ?: SafPosStorage.createFile(context, structure.config, MASTER_NAME)
        exportConfig(context, target).getOrThrow()
        validateMaster(context, target)
        target
    }

    fun copyMaster(context: Context, rootTreeUriString: String, source: Uri): Result<Uri> = runCatching {
        val structure = SafPosStorage.ensureSelectedRoot(context, rootTreeUriString).getOrThrow()
        val existing = SafPosStorage.findFile(context, structure.config, MASTER_NAME)
        val target = existing ?: SafPosStorage.createFile(context, structure.config, MASTER_NAME)
        context.contentResolver.openInputStream(source).use { input ->
            requireNotNull(input)
            SafPosStorage.overwrite(context, target) { output -> input.copyTo(output) }
        }
        validateMaster(context, target)
        target
    }

    fun findMaster(context: Context, rootTreeUriString: String): Uri? {
        if (rootTreeUriString.isBlank()) return null
        val structure = SafPosStorage.ensureSelectedRoot(context, rootTreeUriString).getOrNull() ?: return null
        return SafPosStorage.findFile(context, structure.config, MASTER_NAME)
    }

    fun importConfig(context: Context, uri: Uri): Result<Unit> = runCatching {
        val imageDir = File(context.filesDir, "config_images").apply { mkdirs() }
        var jsonText: String? = null
        val extracted = mutableMapOf<String, File>()

        context.contentResolver.openInputStream(uri).use { raw ->
            requireNotNull(raw)
            ZipInputStream(raw).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    if (entry.name == "config.json") {
                        jsonText = zip.readBytes().toString(Charsets.UTF_8)
                    } else if (entry.name.startsWith("images/")) {
                        val safeName = entry.name.substringAfterLast('/').replace(Regex("[^A-Za-z0-9._-]"), "_")
                        val out = File(imageDir, safeName)
                        out.outputStream().use { zip.copyTo(it) }
                        extracted[entry.name] = out
                    }
                    zip.closeEntry()
                }
            }
        }

        val root = JSONObject(requireNotNull(jsonText) { "File .0210 không hợp lệ: thiếu config.json" })
        require(root.optString("format") == "POS0210_MASTER_CONFIG") { "Không đúng file cấu hình 0210" }
        require(root.optInt("version", 0) in 1..CONFIG_VERSION) { "Phiên bản cấu hình chưa được hỗ trợ" }

        val db = PosDatabase.get(context)
        val dao = db.dao()
        runBlocking {
            db.withTransaction {
                dao.deactivateAllAreas()
                dao.deactivateAllTables()
                dao.deactivateAllMenuCategories()
                dao.deactivateAllMenuItems()
                dao.deactivateAllCombos()
                dao.deactivateAllPricingRules()
                dao.deactivateAllEmployees()
                dao.deactivateAllPurchaseCategories()
                dao.clearConfigSettings()
                root.getJSONArray("areas").forEachObject { o ->
                    dao.saveArea(AreaEntity(o.getString("id"), o.getString("name"), o.optInt("sortOrder"), o.optBoolean("active", true)))
                }
                root.getJSONArray("tables").forEachObject { o ->
                    dao.saveTable(DiningTableEntity(o.getString("id"), o.getString("areaId"), o.getString("name"), o.optInt("sortOrder"), o.optBoolean("active", true)))
                }
                root.getJSONArray("categories").forEachObject { o ->
                    dao.saveCategory(MenuCategoryEntity(o.getString("id"), o.getString("name"), o.optInt("sortOrder"), o.optBoolean("active", true)))
                }
                root.getJSONArray("menu").forEachObject { o ->
                    val entry = o.optString("imageEntry", "")
                    val localUri = extracted[entry]?.let { Uri.fromFile(it).toString() }
                    val requestedCode = o.optString("productCode", "")
                    val usedCodes = dao.allProductCodes().filter { it.isNotBlank() }.toSet()
                    val categoryName = root.getJSONArray("categories").let { categories ->
                        (0 until categories.length()).map { categories.getJSONObject(it) }
                            .firstOrNull { it.optString("id") == o.getString("categoryId") }?.optString("name").orEmpty()
                    }
                    val currentCode = dao.menuItemById(o.getString("id"))?.productCode
                    val productCode = requestedCode.takeIf { it.isNotBlank() && (it !in usedCodes || it == currentCode) }
                        ?: ProductCodes.next(categoryName, usedCodes)
                    dao.saveMenuItem(
                        MenuItemEntity(
                            id = o.getString("id"),
                            categoryId = o.getString("categoryId"),
                            name = o.getString("name"),
                            price = o.getLong("price"),
                            imageUri = localUri,
                            sortOrder = o.optInt("sortOrder"),
                            active = o.optBoolean("active", true),
                            productCode = productCode,
                            description = o.optString("description", "")
                        )
                    )
                }
                root.optJSONArray("combos")?.forEachObject { o ->
                    val entry = o.optString("imageEntry", "")
                    val localUri = extracted[entry]?.let { Uri.fromFile(it).toString() }
                        ?: o.optString("imageUri", "").ifBlank { null }
                    dao.saveCombo(
                        ComboEntity(
                            id = o.getString("id"),
                            name = o.getString("name"),
                            price = o.getLong("price"),
                            imageUri = localUri,
                            sortOrder = o.optInt("sortOrder"),
                            active = o.optBoolean("active", true),
                            description = o.optString("description", "")
                        )
                    )
                }
                root.optJSONArray("comboItems")?.forEachObject { o ->
                    dao.saveComboItem(
                        ComboItemEntity(
                            id = o.getString("id"),
                            comboId = o.getString("comboId"),
                            menuItemId = o.getString("menuItemId"),
                            qty = o.optInt("qty", 1)
                        )
                    )
                }
                root.optJSONArray("pricingRules")?.forEachObject { o ->
                    dao.savePricingRule(
                        PricingRuleEntity(
                            id = o.getString("id"),
                            name = o.getString("name"),
                            code = o.optString("code", ""),
                            kind = o.optString("kind", "DISCOUNT"),
                            percent = o.optInt("percent", 0),
                            startAt = if (o.isNull("startAt")) null else o.optLong("startAt"),
                            endAt = if (o.isNull("endAt")) null else o.optLong("endAt"),
                            startMinute = if (o.isNull("startMinute")) null else o.optInt("startMinute"),
                            endMinute = if (o.isNull("endMinute")) null else o.optInt("endMinute"),
                            autoApply = o.optBoolean("autoApply", false),
                            active = o.optBoolean("active", true)
                        )
                    )
                }
                root.getJSONArray("employees").forEachObject { o ->
                    dao.saveEmployee(
                        EmployeeEntity(
                            id = o.getString("id"), name = o.getString("name"), active = o.optBoolean("active", true),
                            pin = o.optString("pin", "0000"), role = o.optString("role", "STAFF"),
                            canCheckout = o.optBoolean("canCheckout", true),
                            canPurchase = o.optBoolean("canPurchase", false),
                            canOrder = o.optBoolean("canOrder", true),
                            canSendKitchen = o.optBoolean("canSendKitchen", true),
                            canViewReport = o.optBoolean("canViewReport", false),
                            canManageMenu = o.optBoolean("canManageMenu", false),
                            canManageSystem = o.optBoolean("canManageSystem", false)
                        )
                    )
                }
                root.optJSONArray("purchaseCategories")?.forEachObject { o ->
                    dao.savePurchaseCategory(
                        PurchaseCategoryEntity(
                            id = o.getString("id"),
                            name = o.getString("name"),
                            defaultUnit = o.optString("defaultUnit", "lần"),
                            sortOrder = o.optInt("sortOrder"),
                            active = o.optBoolean("active", true)
                        )
                    )
                }
                root.getJSONArray("settings").forEachObject { o ->
                    dao.saveSetting(AppSettingEntity(o.getString("key"), o.optString("value", "")))
                }
            }
        }
    }

    private fun validateMaster(context: Context, uri: Uri) {
        var jsonText: String? = null
        context.contentResolver.openInputStream(uri).use { raw ->
            requireNotNull(raw)
            ZipInputStream(raw).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    if (entry.name == "config.json") {
                        jsonText = zip.readBytes().toString(Charsets.UTF_8)
                        break
                    }
                    zip.closeEntry()
                }
            }
        }
        val root = JSONObject(requireNotNull(jsonText) { "MASTER lỗi: thiếu config.json" })
        require(root.optString("format") == "POS0210_MASTER_CONFIG") { "MASTER không hợp lệ" }
    }

    private data class ConfigSnapshot(
        val areas: List<AreaEntity>,
        val tables: List<DiningTableEntity>,
        val categories: List<MenuCategoryEntity>,
        val menu: List<MenuItemEntity>,
        val combos: List<ComboEntity>,
        val comboItems: List<ComboItemEntity>,
        val employees: List<EmployeeEntity>,
        val purchaseCategories: List<PurchaseCategoryEntity>,
        val pricingRules: List<PricingRuleEntity>,
        val settings: List<AppSettingEntity>
    )

    private inline fun JSONArray.forEachObject(block: (JSONObject) -> Unit) {
        for (i in 0 until length()) block(getJSONObject(i))
    }
}
