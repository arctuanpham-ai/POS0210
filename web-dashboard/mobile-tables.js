/* Bảng từ 4 cột trở lên: gắn nhãn cột vào từng ô để điện thoại hiện mỗi dòng thành một thẻ gọn (CSS ở styles.css), không phải kéo ngang. */
(function () {
  var queued = false;
  function label(table) {
    if (table.dataset.rt) return;
    var head = table.tHead && table.tHead.rows[0] ? table.tHead.rows[0] : null;
    if (!head) { var r0 = table.rows[0]; if (r0 && r0.querySelector("th") && !r0.querySelector("td")) head = r0; }
    if (!head) return;
    var names = [];
    Array.prototype.forEach.call(head.cells, function (c) { var n = Math.max(1, c.colSpan || 1); for (var i = 0; i < n; i++) names.push((c.textContent || "").trim()); });
    if (names.length < 4) return;
    table.dataset.rt = "1";
    table.classList.add("rt");
    Array.prototype.forEach.call(table.rows, function (row) {
      if (row === head) return;
      var col = 0;
      Array.prototype.forEach.call(row.cells, function (c) {
        if ((c.colSpan || 1) === 1 && names[col] && !c.hasAttribute("data-label")) c.setAttribute("data-label", names[col]);
        col += c.colSpan || 1;
      });
    });
  }
  function run() { queued = false; Array.prototype.forEach.call(document.querySelectorAll("table:not([data-rt])"), label); }
  function schedule() { if (!queued) { queued = true; (window.requestAnimationFrame || setTimeout)(run); } }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
