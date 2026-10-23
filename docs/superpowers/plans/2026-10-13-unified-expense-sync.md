# Đồng bộ phiếu chi thống nhất Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa phiếu chi/mua hàng Android và Web về một hợp đồng `expenseReceipts` duy nhất, Local-first, không ảnh hưởng dữ liệu bán hàng.

**Architecture:** Android lưu dữ liệu vận hành trong Room trước, kèm một bản ghi phiếu chuẩn và hàng đợi Firebase theo `receiptId`. Firebase `expenseReceipts` là cầu nối duy nhất cho Web và App; Web đọc trực tiếp các phiếu 7 ngày. Các collection mirror `purchases`/`purchaseItems` không còn là nguồn hiển thị Web của phiếu chi mới.

**Tech Stack:** Kotlin, Jetpack Compose, Room, Firebase Firestore, JavaScript Web Dashboard, Node test, Gradle unit test.

**Spec:** `docs/superpowers/specs/2026-10-13-unified-expense-sync-design.md`

## Global Constraints

- Không đọc, ghi, xóa hoặc đổi schema luồng bàn, order, bill, thanh toán và doanh thu bán hàng.
- Mọi nhãn và giá trị hiển thị bằng tiếng Việt.
- Android versionCode phải lớn hơn 107.
- App Local-first; lỗi mạng không được làm mất phiếu.
- Web chỉ đọc phiếu chi 7 ngày khi người dùng bấm Làm mới; không tạo listener realtime.
- Không deploy Firestore Security Rules production nếu chưa có phê duyệt riêng.

## Review Focus

- Phiếu lưu offline rồi khôi phục mạng chỉ được đẩy một lần.
- Một `receiptId` được kéo lặp lại không sinh dòng vật tư trùng.
- Sửa phiếu trên Web với `updatedAt` mới hơn thay đúng phiếu Local.
- Phiếu `CANCELLED` giữ lịch sử nhưng không tính vào tổng chi.
- Đồng bộ phiếu chi không làm đổi bất kỳ bill/bàn/doanh thu bán hàng nào.

---

## File Structure

- `app/src/main/java/vn/ecohome/pos0210/data/Entities.kt`: entity Room cho metadata phiếu chuẩn và metadata từng dòng.
- `app/src/main/java/vn/ecohome/pos0210/data/PosDao.kt`: transaction Local, hàng đợi và cursor đồng bộ.
- `app/src/main/java/vn/ecohome/pos0210/data/PosDatabase.kt`: migration Room tăng version.
- `app/src/main/java/vn/ecohome/pos0210/cloud/ExpenseReceiptTranslator.kt`: model/payload chuẩn hai chiều, validate và conflict resolution.
- `app/src/main/java/vn/ecohome/pos0210/cloud/FirebaseCloudSync.kt`: đẩy outbox `expenseReceipts`, kéo incremental và không dùng finance mirror cho phiếu mới.
- `app/src/main/java/vn/ecohome/pos0210/PosViewModel.kt`: lưu phiếu Local + outbox với `receiptId`.
- `app/src/main/java/vn/ecohome/pos0210/MainActivity.kt`: form Android chuyên biệt “Phiếu nhiều vật tư”.
- `web-dashboard/app.js`: đọc và hiển thị `expenseReceipts` trong 7 ngày.
- `web-dashboard/expense-domain.js`: chuẩn hóa/validate payload chung.
- `web-dashboard/test/expense-domain.test.mjs`: test Web canonical contract.
- `app/src/test/java/vn/ecohome/pos0210/cloud/ExpenseReceiptTranslatorTest.kt`: test mapper và conflict.
- `app/src/test/java/vn/ecohome/pos0210/data/ExpenseReceiptSyncTest.kt`: test outbox/cursor/dedup.
- `app/build.gradle.kts`: tăng versionCode lên 108.

### Task 1: Hợp đồng dữ liệu canonical và mapper Android

**Files:**
- Modify: `app/src/main/java/vn/ecohome/pos0210/cloud/ExpenseReceiptTranslator.kt`
- Test: `app/src/test/java/vn/ecohome/pos0210/cloud/ExpenseReceiptTranslatorTest.kt`

**Interfaces:**
- Produces: `CanonicalExpenseReceipt`, `CanonicalExpenseLine`, `validateReceipt(receipt): ReceiptValidation`, `isRemoteNewer(localUpdatedAt, remoteUpdatedAt): Boolean`.
- Consumes: purchase data Local and Web payload fields trong spec.

- [ ] **Step 1: Viết test fail cho validate phiếu có hai dòng và tổng chính xác**
- [ ] **Step 2: Chạy test để xác nhận fail vì canonical validator chưa tồn tại**
- [ ] **Step 3: Cài model, validate và mapper hai chiều**
- [ ] **Step 4: Chạy test để xác nhận pass**
- [ ] **Step 5: Bổ sung test fail cho cùng receiptId với updatedAt cũ hơn không được ghi đè**
- [ ] **Step 6: Cài so sánh conflict theo updatedAt**
- [ ] **Step 7: Chạy toàn bộ ExpenseReceiptTranslatorTest và commit**

### Task 2: Local metadata và outbox không mất phiếu

**Files:**
- Modify: `Entities.kt`, `PosDao.kt`, `PosDatabase.kt`, `PosViewModel.kt`
- Test: `ExpenseReceiptSyncTest.kt`

**Interfaces:**
- Consumes: `CanonicalExpenseReceipt`.
- Produces: `saveExpenseReceiptLocal(receipt)`, `pendingExpenseReceiptSync(limit)`, `markExpenseReceiptSynced(receiptId)`, `replaceExpenseReceiptIfNewer(receipt)`.

- [ ] **Step 1: Viết test fail: lưu Local tạo một outbox theo receiptId**
- [ ] **Step 2: Chạy test fail**
- [ ] **Step 3: Thêm entity metadata, metadata dòng và migration Room; transaction ghi purchase/items + canonical metadata + outbox**
- [ ] **Step 4: Chạy test pass**
- [ ] **Step 5: Viết test fail: import cùng receiptId hai lần không sinh dòng trùng**
- [ ] **Step 6: Cài transaction replace nguyên tử và cursor**
- [ ] **Step 7: Chạy test data scope và commit**

### Task 3: Firebase đồng bộ hai chiều theo expenseReceipts

**Files:**
- Modify: `FirebaseCloudSync.kt`, `ExpenseReceiptTranslator.kt`
- Test: `ExpenseReceiptSyncTest.kt`, `CloudSyncPolicyTest.kt`

**Interfaces:**
- Consumes: outbox Task 2; Firestore path `users/{uid}/stores/0210/expenseReceipts/{receiptId}`.
- Produces: `pushPendingExpenseReceipts` và incremental pull có dedup/conflict.

- [ ] **Step 1: Viết test fail: retry cùng outbox chỉ sinh một document receiptId**
- [ ] **Step 2: Chạy test fail**
- [ ] **Step 3: Cài push idempotent, chỉ đánh dấu synced sau Firestore thành công**
- [ ] **Step 4: Chạy test pass**
- [ ] **Step 5: Viết test fail: phiếu CANCELLED kéo về vẫn lưu lịch sử nhưng không active**
- [ ] **Step 6: Cài pull/replace theo updatedAt + receiptId**
- [ ] **Step 7: Chạy toàn bộ test cloud và commit**

### Task 4: Web Dashboard dùng trực tiếp expenseReceipts 7 ngày

**Files:**
- Modify: `web-dashboard/app.js`, `web-dashboard/expense-domain.js`
- Test: `web-dashboard/test/expense-domain.test.mjs`, `web-dashboard/test/dashboard-snapshot.test.mjs`

**Interfaces:**
- Consumes: payload canonical Task 1.
- Produces: refresh Dashboard đọc `expenseReceipts` 7 ngày, không phụ thuộc mirror purchase cho chi phí mới.

- [ ] **Step 1: Viết test fail: receipt active 7 ngày xuất hiện, receipt cancelled không cộng tổng**
- [ ] **Step 2: Chạy test fail**
- [ ] **Step 3: Chuyển read/query/render sang expenseReceipts; giữ nút Làm mới**
- [ ] **Step 4: Chạy test Web pass**
- [ ] **Step 5: Commit**

### Task 5: Form Android Phiếu nhiều vật tư và trạng thái đồng bộ

**Files:**
- Modify: `MainActivity.kt`, `PosViewModel.kt`, `app/build.gradle.kts`
- Test: `ExpenseReceiptSyncTest.kt`

**Interfaces:**
- Consumes: `saveExpenseReceiptLocal` Task 2.
- Produces: form Android gồm ngày mua, ghi chú, dòng tên/mã/nhóm/số lượng/đơn vị/đơn giá, thêm/bỏ dòng, tổng phiếu và trạng thái Local/Firebase.

- [ ] **Step 1: Viết test fail: dòng invalid không được xếp outbox**
- [ ] **Step 2: Chạy test fail**
- [ ] **Step 3: Cài form chuyên biệt và ViewModel save Local-first**
- [ ] **Step 4: Tăng versionCode 108 và chạy test pass**
- [ ] **Step 5: Commit**

### Task 6: Kiểm thử tích hợp và build APK

**Files:**
- Modify: các file test trên khi cần fixture
- Verify: GitHub Actions Android build và Web test

- [ ] **Step 1: Chạy Android unit test**
- [ ] **Step 2: Chạy Web test**
- [ ] **Step 3: Đối chiếu regression: bill/bàn/doanh thu không bị thay đổi**
- [ ] **Step 4: Build APK ký Android 10-compatible qua GitHub Actions**
- [ ] **Step 5: Tải artifact, kiểm tra versionCode 108 và bàn giao APK**
