import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { spineDisplayCounts } from "./spineShortageSlots.js";

describe("spineDisplayCounts", () => {
  test("עותק בודד שסומן חסר נשאר שדרה מטושטשת", () => {
    const { physical, ghosts, total } = spineDisplayCounts({
      quantity_in_cell: 0,
      shelf_stock: 1,
      pending_shortage_count: 1,
      is_pending_shortage: true,
    });
    assert.equal(physical, 0);
    assert.equal(ghosts, 1);
    assert.equal(total, 1);
  });

  test("שני עותקים: אחרי חוסר אחד נשארות שתי שדרות (אחת ghost)", () => {
    const { physical, ghosts, total } = spineDisplayCounts({
      quantity_in_cell: 1,
      shelf_stock: 2,
      pending_shortage_count: 1,
      is_pending_shortage: true,
    });
    assert.equal(physical, 1);
    assert.equal(ghosts, 1);
    assert.equal(total, 2);
  });

  test("shelf_stock מיושן נמוך מהכמות: סימון חוסר לא מעלים שדרה", () => {
    const before = spineDisplayCounts({
      quantity_in_cell: 2,
      shelf_stock: 1,
      pending_shortage_count: 0,
    });
    assert.equal(before.total, 2);
    assert.equal(before.ghosts, 0);

    const after = spineDisplayCounts({
      quantity_in_cell: 1,
      shelf_stock: 1,
      pending_shortage_count: 1,
      is_pending_shortage: true,
    });
    assert.equal(after.physical, 1);
    assert.equal(after.ghosts, 1);
    assert.equal(after.total, 2);
  });
});
