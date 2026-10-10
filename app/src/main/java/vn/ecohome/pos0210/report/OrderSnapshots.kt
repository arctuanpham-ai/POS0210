package vn.ecohome.pos0210.report

import org.json.JSONArray
import org.json.JSONObject
import vn.ecohome.pos0210.data.*

/** All-or-nothing local cart validation. Called with database snapshots, never UI flow caches. */
object OrderSnapshots {
    fun cart(lines:Map<String,Int>,notes:Map<String,String>,menu:List<MenuItemEntity>,
        combos:List<ComboEntity>,parts:List<ComboItemEntity>,categories:List<MenuCategoryEntity>):List<OrderItemEntity> {
        require(lines.isNotEmpty()){ "EMPTY_CART" }
        val items=lines.map { (id,q) ->
            require(q>0){"INVALID_CART_QUANTITY"}
            if(id.startsWith("combo:")) {
                val c=combos.firstOrNull{it.id==id.removePrefix("combo:")&&it.active} ?: error("MENU_CHANGED: $id")
                OrderItemEntity("","",id,"COMBO · ${c.name}",c.price,q,notes[id].orEmpty().trim())
            } else {
                val m=menu.firstOrNull{it.id==id&&it.active} ?: error("MENU_CHANGED: $id")
                OrderItemEntity("","",id,m.name,m.price,q,notes[id].orEmpty().trim())
            }
        }
        return stamp(items,menu,combos,parts,categories)
    }
    fun stamp(items:List<OrderItemEntity>,menu:List<MenuItemEntity>,combos:List<ComboEntity>,
        parts:List<ComboItemEntity>,categories:List<MenuCategoryEntity>):List<OrderItemEntity> {
        val ms=menu.associateBy{it.id};val cs=categories.associateBy{it.id}
        return items.map { i ->
            require(i.qty!=0&&i.unitPriceSnapshot>=0){"INVALID_ORDER_ITEM"}
            // A signed correction keeps its original snapshot; repository checks the source link.
            if(i.qty<0){require(i.adjustmentOfItemId!=null){"INVALID_ADJUSTMENT"};return@map i}
            val id=i.menuItemId ?: error("MENU_CHANGED")
            if(id.startsWith("combo:")) {
                val cid=id.removePrefix("combo:")
                val c=combos.firstOrNull{it.id==cid&&it.active} ?: error("MENU_CHANGED: $id")
                check(c.price==i.unitPriceSnapshot){"MENU_CHANGED: $id"}
                val cps=parts.filter{it.comboId==cid}
                check(cps.isNotEmpty()){ "COMBO_COMPONENT_MISSING: $id" }
                val json=JSONArray()
                val descriptions=cps.map { p ->
                    val m=ms[p.menuItemId]?.takeIf{it.active} ?: error("COMBO_COMPONENT_MISSING: ${p.menuItemId}")
                    check(p.qty>0){"INVALID_COMBO_QUANTITY"}
                    val category=cs[m.categoryId] ?: error("MENU_CATEGORY_MISSING")
                    json.put(JSONObject().put("id",m.id).put("name",m.name).put("qty",p.qty)
                        .put("categoryId",category.id).put("categoryName",category.name))
                    "${p.qty}×${m.name}"
                }
                val name="COMBO · ${c.name} [${descriptions.joinToString(" + ")}]"
                // Prepared combo composition must still match at the transaction boundary.
                check(i.comboPartsSnapshot==null||i.comboPartsSnapshot==json.toString()){ "MENU_CHANGED: $id" }
                i.copy(itemNameSnapshot=name,categoryIdSnapshot="__COMBO__",categoryNameSnapshot="Combo",comboPartsSnapshot=json.toString())
            } else {
                val m=ms[id]?.takeIf{it.active} ?: error("MENU_CHANGED: $id")
                check(m.price==i.unitPriceSnapshot&&i.itemNameSnapshot.removePrefix("🎁 ")==m.name){"MENU_CHANGED: $id"}
                val cat=cs[m.categoryId] ?: error("MENU_CATEGORY_MISSING")
                i.copy(categoryIdSnapshot=cat.id,categoryNameSnapshot=cat.name)
            }
        }
    }
}
