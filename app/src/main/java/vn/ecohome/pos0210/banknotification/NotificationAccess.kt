package vn.ecohome.pos0210.banknotification

import android.content.Context
import androidx.core.app.NotificationManagerCompat

object NotificationAccess {
 fun isGranted(context:Context)=NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
}
