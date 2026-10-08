package vn.ecohome.pos0210

object HolidayCalendarSelection {
    fun toggle(selected: Set<String>, localDate: String): Set<String> =
        if (localDate in selected) selected - localDate else selected + localDate
}
