import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { shortageGroupMissingCopies } from "./shortageWarehouse.js";

describe("shortageGroupMissingCopies", () => {
  test("מעדיף פער מדף על פני ספירת רשומות כפולות", () => {
    assert.equal(
      shortageGroupMissingCopies({
        missing_count: 2,
        shelf_stock_in_cell: 2,
        quantity_in_cell: 1,
      }),
      1,
    );
  });

  test("מעלה כשהמדף מציג יותר חוסרים מרשומות", () => {
    assert.equal(
      shortageGroupMissingCopies({
        missing_count: 1,
        shelf_stock_in_cell: 3,
        quantity_in_cell: 1,
      }),
      2,
    );
  });

  test("בלי תא — נשען על missing_count", () => {
    assert.equal(
      shortageGroupMissingCopies({
        missing_count: 2,
        shelf_stock_in_cell: null,
        quantity_in_cell: null,
      }),
      2,
    );
  });
});
