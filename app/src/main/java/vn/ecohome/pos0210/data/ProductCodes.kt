package vn.ecohome.pos0210.data

import java.text.Normalizer

object ProductCodes {
    fun basePrefix(categoryName: String): String {
        val normalized = Normalizer.normalize(categoryName, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .replace('đ', 'd').replace('Đ', 'D')
            .uppercase().trim()
        mapOf("CA PHE" to "CF", "AN SANG" to "AS", "TRA" to "TR", "SINH TO" to "ST", "KHAC" to "KH")[normalized]?.let { return it }
        val words = normalized.split(Regex("[^A-Z0-9]+" )).filter { it.isNotBlank() }
        return when {
            words.size >= 2 -> "${words[0].first()}${words[1].first()}"
            words.isNotEmpty() -> words[0].take(2)
            else -> "KH"
        }.padEnd(2, 'X')
    }

    fun next(categoryName: String, used: Set<String>): String {
        val root = basePrefix(categoryName)
        var prefix = root
        var suffix = 2
        // A prefix already belonging to another category gets a stable numeric suffix.
        val occupiedPrefixes = used.map { it.substringBefore('-') }.toSet()
        while (prefix in occupiedPrefixes && used.none { it.startsWith("$prefix-") }) prefix = "$root${suffix++}"
        var sequence = 1
        while ("$prefix-${sequence.toString().padStart(3, '0')}" in used) sequence++
        return "$prefix-${sequence.toString().padStart(3, '0')}"
    }
}
