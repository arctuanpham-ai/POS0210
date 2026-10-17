package vn.ecohome.pos0210.report

import vn.ecohome.pos0210.data.MenuCategoryEntity
import vn.ecohome.pos0210.data.MenuItemEntity

data class SalesItemGroup(val id:String,val name:String,val rows:List<SalesReport.ItemSummary>,val inferredLineCount:Int) {
    val directQty:Int get()=rows.filter{it.kind!="COMPONENT"}.sumOf{it.qty}
    val directGross:Long get()=rows.filter{it.kind!="COMPONENT"}.sumOf{it.gross}
    val componentQty:Int get()=rows.filter{it.kind=="COMPONENT"}.sumOf{it.qty}
}

/** Presentation-only category fallback. Historical rows are never written back. */
object SalesItemGrouping {
    fun group(rows:List<SalesReport.ItemSummary>,menu:List<MenuItemEntity>,categories:List<MenuCategoryEntity>):List<SalesItemGroup> {
        val menuById=menu.associateBy{it.id}; val categoriesById=categories.associateBy{it.id}
        data class Resolved(val id:String,val name:String,val inferred:Boolean)
        fun resolve(row:SalesReport.ItemSummary):Resolved {
            if(row.categoryId!=null)return Resolved(row.categoryId,row.categoryName,false)
            val current=row.menuItemId?.let{menuById[it]}?.categoryId?.let{categoriesById[it]}
            return if(current!=null) Resolved(current.id,current.name,true) else Resolved("UNKNOWN","Chưa xác định nhóm",true)
        }
        return rows.groupBy{resolve(it).id}.map{(id,rs)->
            val direct=rs.firstOrNull{!resolve(it).inferred}
            SalesItemGroup(id,direct?.let{resolve(it).name} ?: resolve(rs.first()).name,rs,rs.count{resolve(it).inferred})
        }.sortedByDescending{it.directGross}
    }
}
