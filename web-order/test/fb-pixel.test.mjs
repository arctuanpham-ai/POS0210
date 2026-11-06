import test from "node:test";
import assert from "node:assert/strict";
import { PIXEL_ID, pixelPayload, pixelTrack, startPixel } from "../public/fb-pixel.js";

test("pixelPayload: 4 bước phễu, mua hàng kèm số tiền làm tròn VND", () => {
  assert.equal(PIXEL_ID, "912331653705932");
  assert.equal(pixelPayload("menu").name, "ViewContent");
  assert.equal(pixelPayload("add", 31500).name, "AddToCart");
  assert.equal(pixelPayload("cart", 1).name, "InitiateCheckout");
  const p = pixelPayload("submit", 75860.4);
  assert.deepEqual(p, { name: "Purchase", params: { currency: "VND", value: 75860, content_type: "product" } });
  assert.equal(pixelPayload("visit"), null);
  assert.equal(pixelPayload("submit", -5).params.value, 0);
});

test("pixelTrack chỉ gọi fbq khi có, lỗi thì bỏ qua", () => {
  const calls = [];
  pixelTrack("add", 1000, { fbq: (...a) => calls.push(a) });
  assert.deepEqual(calls, [["track", "AddToCart", { currency: "VND", value: 1000, content_type: "product" }]]);
  pixelTrack("visit", 0, { fbq: () => { throw new Error("x"); } });
  pixelTrack("add", 1, {});
  startPixel({});
});
