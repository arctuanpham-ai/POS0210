package vn.ecohome.pos0210

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class TableCardUi(
    val id:String,val name:String,val areaName:String,val occupied:Boolean,
    val serviceNo:Int?=null,val priorityRank:Int?=null,val timer:ServiceTimerPresentation?=null
)

data class TableGridSpec(val columns:Int,val minCardHeight:Dp,val gap:Dp,val compact:Boolean)

fun tableGridSpec(tableCount:Int,availableWidthDp:Float):TableGridSpec {
    val columns=when {
        tableCount<=4 -> if(availableWidthDp<320f) 1 else 2
        tableCount<=9 -> if(availableWidthDp<340f) 2 else 3
        tableCount<=16 -> if(availableWidthDp<360f) 3 else 4
        availableWidthDp>=700f -> 6
        availableWidthDp>=480f -> 5
        else -> 4
    }
    val compact=tableCount>16||columns>=5
    return TableGridSpec(columns,when{columns<=2->132.dp;columns==3->122.dp;columns==4->114.dp;else->108.dp},if(compact)6.dp else 8.dp,compact)
}

@Composable
fun ResponsiveTableGrid(cards:List<TableCardUi>,modifier:Modifier=Modifier,onClick:(String)->Unit={}) {
    BoxWithConstraints(modifier) {
        val spec=tableGridSpec(cards.size.coerceAtLeast(1),maxWidth.value)
        LazyVerticalGrid(
            columns=GridCells.Fixed(spec.columns),modifier=Modifier.fillMaxSize().testTag("table-grid"),
            horizontalArrangement=Arrangement.spacedBy(spec.gap),verticalArrangement=Arrangement.spacedBy(spec.gap)
        ) {
            items(cards,key={it.id}){card->TableCard(card,spec,onClick)}
        }
    }
}

@Composable
fun TableCard(card:TableCardUi,spec:TableGridSpec,onClick:(String)->Unit={}) {
    val background=when{card.priorityRank==0->Color(0xFFE86A33);card.priorityRank==1->Color(0xFFF3C15F);card.serviceNo!=null->Color(0xFFF2B777);!card.occupied->Color(0xFFF1ECE3);else->Color(0xFFE7C4AA)}
    val timerColor=when(card.timer?.ageBand){ServiceAgeBand.WARM->Color(0xFF8A6A2F);ServiceAgeBand.ORANGE->Color(0xFFA65E2E);ServiceAgeBand.OVERDUE->Color(0xFF9A4B3D);else->Color(0xFF6E432D)}
    Card(
        Modifier.fillMaxWidth().heightIn(min=spec.minCardHeight).testTag("table-card-${card.id}").clickable{onClick(card.id)},
        colors=CardDefaults.cardColors(containerColor=background)
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal=if(spec.compact)5.dp else 8.dp,vertical=if(spec.compact)6.dp else 8.dp),horizontalAlignment=Alignment.CenterHorizontally) {
            Text(card.name,Modifier.testTag("table-name-${card.id}"),fontWeight=FontWeight.Black,fontSize=if(spec.compact)14.sp else 17.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
            Text(card.areaName,Modifier.testTag("table-area-${card.id}"),fontSize=if(spec.compact)9.sp else 10.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
            Spacer(Modifier.height(if(spec.compact)2.dp else 4.dp))
            if(!card.occupied) {
                Text("Trống",Modifier.testTag("table-status-${card.id}"),fontSize=if(spec.compact)11.sp else 13.sp,maxLines=1)
                Spacer(Modifier.height(if(spec.compact)4.dp else 8.dp))
            } else {
                Text("● CÓ KHÁCH",Modifier.testTag("table-status-${card.id}"),fontWeight=FontWeight.Bold,fontSize=if(spec.compact)10.sp else 11.sp,maxLines=1)
                card.serviceNo?.let { no ->
                    val detail=when(card.priorityRank){0->if(spec.columns>=4)"#${no.toString().padStart(3,'0')} · P1" else "#${no.toString().padStart(3,'0')} · ƯU TIÊN 1";1->if(spec.columns>=4)"#${no.toString().padStart(3,'0')} · P2" else "#${no.toString().padStart(3,'0')} · ƯU TIÊN 2";else->"#${no.toString().padStart(3,'0')} · CHỜ"}
                    Text(detail,Modifier.testTag("table-priority-${card.id}"),fontWeight=FontWeight.Black,fontSize=if(spec.compact)9.sp else 10.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                }
                card.timer?.let { timer ->
                    Text("⏱ ${timer.totalMinutes}' · ${timer.statusLabel}",Modifier.testTag("table-timer-${card.id}"),color=timerColor,fontWeight=FontWeight.Bold,fontSize=if(spec.compact)9.sp else 10.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                    timer.lastOrderMinutes?.let{Text("+ món mới ${it}'",Modifier.testTag("table-addon-${card.id}"),color=timerColor,fontSize=if(spec.compact)8.sp else 9.sp,maxLines=1,overflow=TextOverflow.Ellipsis)}
                }
            }
        }
    }
}
