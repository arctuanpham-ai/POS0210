package vn.ecohome.pos0210.data

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract

object SafPosStorage {
    const val ROOT_NAME = "POS0210"
    const val CONFIG_NAME = "CONFIG"
    const val DATA_NAME = "DATA"
    const val ARCHIVE_NAME = "ARCHIVE"

    fun isPosRoot(context: Context, uri: Uri): Boolean =
        documentName(context, uri).equals(ROOT_NAME, ignoreCase = true)

    fun hasPersistedAccess(context: Context, rootTreeUriString: String): Boolean {
        if (rootTreeUriString.isBlank()) return false
        val uri = runCatching { Uri.parse(rootTreeUriString) }.getOrNull() ?: return false
        return context.contentResolver.persistedUriPermissions.any {
            it.uri == uri && it.isReadPermission && it.isWritePermission
        }
    }

    fun ensureSelectedRoot(context: Context, rootTreeUriString: String): Result<Structure> = runCatching {
        require(rootTreeUriString.isNotBlank()) { "Chưa chọn thư mục POS0210" }
        val rootTree = Uri.parse(rootTreeUriString)
        require(DocumentsContract.isTreeUri(rootTree)) { "URI thư mục không hợp lệ" }
        require(hasPersistedAccess(context, rootTreeUriString)) { "Quyền truy cập thư mục đã mất. Hãy GẮN LẠI THƯ MỤC POS0210" }

        val root = asDocumentUri(rootTree)
        require(documentName(context, root).equals(ROOT_NAME, ignoreCase = true)) {
            "Hãy chọn đúng thư mục POS0210 (không chọn Download hoặc thư mục khác)"
        }
        val config = findChild(context, root, CONFIG_NAME) ?: createDir(context, root, CONFIG_NAME)
        val data = findChild(context, root, DATA_NAME) ?: createDir(context, root, DATA_NAME)
        val archive = findChild(context, root, ARCHIVE_NAME) ?: createDir(context, root, ARCHIVE_NAME)
        Structure(rootTree, config, data, archive)
    }

    fun findFile(context: Context, folderUri: Uri, name: String): Uri? =
        children(context, folderUri).firstOrNull { it.second == name }?.first

    fun createFile(
        context: Context,
        folderUri: Uri,
        name: String,
        mime: String = "application/octet-stream"
    ): Uri {
        val parentDoc = asDocumentUri(folderUri)
        return DocumentsContract.createDocument(context.contentResolver, parentDoc, mime, name)
            ?: error("Không tạo được file $name")
    }

    fun overwrite(context: Context, uri: Uri, writer: (java.io.OutputStream) -> Unit) {
        context.contentResolver.openOutputStream(uri, "wt").use { out ->
            requireNotNull(out) { "Không mở được file để ghi đè" }
            writer(out)
        }
    }

    fun delete(context: Context, uri: Uri?) {
        if (uri != null) DocumentsContract.deleteDocument(context.contentResolver, asDocumentUri(uri))
    }

    private fun documentName(context: Context, uri: Uri): String {
        val doc = asDocumentUri(uri)
        context.contentResolver.query(
            doc,
            arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME),
            null, null, null
        )?.use { c ->
            if (c.moveToFirst()) return c.getString(0) ?: ""
        }
        return ""
    }

    private fun findChild(context: Context, parent: Uri, name: String): Uri? =
        children(context, parent).firstOrNull { it.second == name && it.third }?.first

    private fun createDir(context: Context, parent: Uri, name: String): Uri {
        val parentDoc = asDocumentUri(parent)
        return DocumentsContract.createDocument(
            context.contentResolver,
            parentDoc,
            DocumentsContract.Document.MIME_TYPE_DIR,
            name
        ) ?: error("Không tạo được thư mục $name")
    }

    private fun children(context: Context, parent: Uri): List<Triple<Uri, String, Boolean>> {
        val resolver = context.contentResolver
        val parentDoc = asDocumentUri(parent)
        val documentId = DocumentsContract.getDocumentId(parentDoc)
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(parentDoc, documentId)
        val out = mutableListOf<Triple<Uri, String, Boolean>>()

        resolver.query(
            childrenUri,
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE
            ),
            null, null, null
        )?.use { c ->
            val idI = c.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameI = c.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val mimeI = c.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
            while (c.moveToNext()) {
                val id = c.getString(idI)
                val uri = DocumentsContract.buildDocumentUriUsingTree(parentDoc, id)
                out += Triple(
                    uri,
                    c.getString(nameI),
                    c.getString(mimeI) == DocumentsContract.Document.MIME_TYPE_DIR
                )
            }
        }
        return out
    }

    /**
     * ACTION_OPEN_DOCUMENT_TREE trả về tree URI dạng:
     * content://.../tree/primary%3ADownload%2FPOS0210
     *
     * DocumentsContract.getDocumentId/createDocument/query lại cần document URI dạng:
     * content://.../tree/.../document/primary%3ADownload%2FPOS0210
     *
     * Không tự ghép URI bằng chuỗi; luôn chuyển qua API DocumentsContract.
     */
    private fun asDocumentUri(uri: Uri): Uri {
        // URI con tạo bằng buildDocumentUriUsingTree vẫn chứa segment "tree",
        // nên DocumentsContract.isTreeUri(uri) có thể trả true. Nếu đã có
        // segment "document" thì phải giữ nguyên documentId của thư mục con,
        // không được quy ngược về tree root POS0210.
        if (uri.pathSegments.contains("document")) return uri
        if (!DocumentsContract.isTreeUri(uri)) return uri
        val treeId = DocumentsContract.getTreeDocumentId(uri)
        return DocumentsContract.buildDocumentUriUsingTree(uri, treeId)
    }

    data class Structure(
        val root: Uri,
        val config: Uri,
        val data: Uri,
        val archive: Uri
    )
}
