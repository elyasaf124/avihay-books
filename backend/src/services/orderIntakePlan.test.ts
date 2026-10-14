import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { planIntakeOrder, planShelfFill, type ShelfSlot } from "./orderIntakePlan.js";

function slot(
  shortageId: string,
  locationId: string | null,
  addedAt: string,
  quantityInCell = 0,
  shelfStock = 4,
): ShelfSlot {
  return { shortageId, locationId, addedAt, quantityInCell, shelfStock };
}

describe("planShelfFill", () => {
  test("4 arrived, 2 missing cells → 2 on shelves and 2 stay in warehouse", () => {
    const plan = planShelfFill(
      [slot("s1", "loc-a", "2026-01-01T00:00:00Z"), slot("s2", "loc-b", "2026-01-02T00:00:00Z")],
      4,
    );
    assert.deepEqual(plan.completedShortageIds, ["s1", "s2"]);
    assert.equal(plan.placed, 2);
    assert.equal(plan.warehouse, 2);
    assert.equal(plan.locationAdds.reduce((sum, row) => sum + row.add, 0), 2);
  });

  test("4 ordered cells, 3 arrived → oldest 3 filled, one shortage stays", () => {
    const plan = planShelfFill(
      [
        slot("s4", "loc-d", "2026-01-04T00:00:00Z"),
        slot("s1", "loc-a", "2026-01-01T00:00:00Z"),
        slot("s3", "loc-c", "2026-01-03T00:00:00Z"),
        slot("s2", "loc-b", "2026-01-02T00:00:00Z"),
      ],
      3,
    );
    assert.deepEqual(plan.completedShortageIds, ["s1", "s2", "s3"]);
    assert.equal(plan.placed, 3);
    assert.equal(plan.warehouse, 0);
    assert.equal(plan.completedShortageIds.includes("s4"), false);
  });

  test("no missing cells → everything stays in warehouse", () => {
    const plan = planShelfFill([], 4);
    assert.deepEqual(plan.completedShortageIds, []);
    assert.equal(plan.placed, 0);
    assert.equal(plan.warehouse, 4);
  });

  test("does not place above shelf_stock", () => {
    const plan = planShelfFill([slot("s1", "loc-a", "2026-01-01T00:00:00Z", 1, 1)], 1);
    assert.equal(plan.placed, 0);
    assert.equal(plan.warehouse, 1);
    assert.deepEqual(plan.completedShortageIds, []);
  });
});

describe("planIntakeOrder", () => {
  test("full arrival completes the line", () => {
    assert.deepEqual(planIntakeOrder(4, 4), { outcome: "complete" });
  });

  test("partial arrival returns the missing quantity to pending", () => {
    assert.deepEqual(planIntakeOrder(4, 3), { outcome: "partial_pending", quantity: 1 });
  });

  test("nothing arrived keeps the quantity and resets to pending", () => {
    assert.deepEqual(planIntakeOrder(4, 0), { outcome: "reset_pending", quantity: 4 });
  });
});
