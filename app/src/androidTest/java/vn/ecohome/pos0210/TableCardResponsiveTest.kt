package vn.ecohome.pos0210

import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class TableCardResponsiveTest {
 @get:Rule val compose=createComposeRule()
 private fun cards(count:Int)=List(count){i->when(i){
  0->TableCardUi("t1","Bàn 01","Trong nhà",true,101,0,ServiceTimerPresentation(38,4,"đang làm",ServiceAgeBand.OVERDUE))
  1->TableCardUi("t2","Bàn 02","Ngoài trời",true,102,1,ServiceTimerPresentation(22,null,"đang làm",ServiceAgeBand.ORANGE))
  else->TableCardUi("t${i+1}","Bàn ${(i+1).toString().padStart(2,'0')}",if(i%2==0)"Trong nhà" else "Ngoài trời",false)
 }}
 private fun verify(count:Int){
  compose.setContent{MaterialTheme{ResponsiveTableGrid(cards(count),Modifier.width(360.dp).height(600.dp).testTag("fixture"))}}
  fun node(tag:String)=compose.onNodeWithTag(tag,useUnmergedTree=true)
  val required=listOf("table-name-t1","table-priority-t1","table-priority-t2","table-timer-t1","table-addon-t1")
  required.forEach{node(it).assertExists()}
  val card:Rect=compose.onNodeWithTag("table-card-t1").fetchSemanticsNode().boundsInRoot
  required.filterNot{it=="table-priority-t2"}.forEach{tag->
   val child:Rect=node(tag).fetchSemanticsNode().boundsInRoot
   assertTrue("$tag bị clip ngang ở $count bàn",child.left>=card.left-0.5f&&child.right<=card.right+0.5f)
   assertTrue("$tag bị clip dọc ở $count bàn",child.top>=card.top-0.5f&&child.bottom<=card.bottom+0.5f)
  }
  // Lazy grid exposes cards in its merged tree; text-level tags remain in the
  // unmerged tree so their geometry can still be measured precisely.
  compose.onNodeWithTag("table-grid").performScrollToNode(hasTestTag("table-card-t$count"))
  val grid=compose.onNodeWithTag("table-grid").fetchSemanticsNode().boundsInRoot
  val last=node("table-name-t$count").assertExists().fetchSemanticsNode().boundsInRoot
  assertTrue("bàn cuối không nằm trong viewport sau scroll ở $count bàn",last.top>=grid.top-0.5f&&last.bottom<=grid.bottom+0.5f)
 }
 @Test fun fourTablesRenderWithoutClipping()=verify(4)
 @Test fun twelveTablesRenderWithoutClipping()=verify(12)
 @Test fun sixteenTablesRenderWithoutClipping()=verify(16)
 @Test fun twentyFourTablesScrollWithoutClipping()=verify(24)
}
