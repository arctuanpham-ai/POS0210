package vn.ecohome.pos0210

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun OrderCartNotesDialog(vm: PosViewModel, onDismiss: () -> Unit) {
    val cart by vm.cart.collectAsState()
    val notes by vm.cartNotes.collectAsState()
    val menu by vm.menu.collectAsState()
    val combos by vm.combos.collectAsState()

    val keys = cart.keys.toList()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Giỏ hàng & ghi chú", fontWeight = FontWeight.Black) },
        text = {
            if (keys.isEmpty()) {
                Text("Chưa có món trong giỏ.")
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth().heightIn(max = 470.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(keys, key = { it }) { key ->
                        val qty = cart[key] ?: 0
                        val name = if (key.startsWith("combo:")) {
                            combos.firstOrNull { it.id == key.removePrefix("combo:") }?.name ?: "Combo"
                        } else {
                            menu.firstOrNull { it.id == key }?.name ?: "Món"
                        }
                        Column(Modifier.fillMaxWidth()) {
                            Text("$qty × $name", fontWeight = FontWeight.Bold)
                            OutlinedTextField(
                                value = notes[key].orEmpty(),
                                onValueChange = { vm.setCartNote(key, it) },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Ghi chú cho bếp") },
                                placeholder = { Text("VD: không hành, ít đá, ít ngọt…") },
                                supportingText = {
                                    Text("Ghi chú áp dụng cho toàn bộ $qty phần của dòng này", fontSize = 10.sp)
                                },
                                minLines = 1,
                                maxLines = 3
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) { Text("XONG") }
        }
    )
}
