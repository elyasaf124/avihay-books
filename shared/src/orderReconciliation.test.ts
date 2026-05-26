import assert from "node:assert/strict";
import test from "node:test";
import { allocateArrivedStock, type ReconcileOrderInput } from "./orderReconciliation.js";

function order(
  id: string,
  order_type: ReconcileOrderInput["order_type"],
  quantity: number,
  created_at: string,
): ReconcileOrderInput {
  return { id, order_type, quantity, status: "pending", created_at };
}

function actionsById(actions: ReturnType<typeof allocateArrivedStock>) {
  return Object.fromEntries(actions.map((a) => [a.id, a]));
}

test("2 customer + 3 inventory, arrived 4 → customer complete, inventory reduce to 1", () => {
  const orders = [
    order("c1", "customer", 2, "2025-01-01T00:00:00Z"),
    order("i1", "inventory", 3, "2025-01-02T00:00:00Z"),
  ];
  const actions = actionsById(allocateArrivedStock(orders, 4));
  assert.equal(actions.c1?.action, "complete");
  assert.equal(actions.i1?.action, "reduce");
  assert.equal((actions.i1 as { newQuantity: number }).newQuantity, 1);
});

test("2 customer + 3 inventory, arrived 5 → customer complete, inventory deleted", () => {
  const orders = [
    order("c1", "customer", 2, "2025-01-01T00:00:00Z"),
    order("i1", "inventory", 3, "2025-01-02T00:00:00Z"),
  ];
  const actions = actionsById(allocateArrivedStock(orders, 5));
  assert.equal(actions.c1?.action, "complete");
  assert.equal(actions.i1?.action, "delete");
});

test("customer(2) + inventory(3), arrived 1 → customer reduce to 1", () => {
  const orders = [
    order("c1", "customer", 2, "2025-01-01T00:00:00Z"),
    order("i1", "inventory", 3, "2025-01-02T00:00:00Z"),
  ];
  const actions = actionsById(allocateArrivedStock(orders, 1));
  assert.equal(actions.c1?.action, "reduce");
  assert.equal((actions.c1 as { newQuantity: number }).newQuantity, 1);
  assert.equal(actions.i1, undefined);
});

test("customer before whatsapp on same book", () => {
  const orders = [
    order("w1", "whatsapp", 2, "2025-01-01T00:00:00Z"),
    order("c1", "customer", 2, "2025-01-02T00:00:00Z"),
  ];
  const actions = actionsById(allocateArrivedStock(orders, 2));
  assert.equal(actions.c1?.action, "complete");
  assert.equal(actions.w1, undefined);
});

test("whatsapp before inventory", () => {
  const orders = [
    order("i1", "inventory", 3, "2025-01-01T00:00:00Z"),
    order("w1", "whatsapp", 2, "2025-01-03T00:00:00Z"),
  ];
  const actions = actionsById(allocateArrivedStock(orders, 2));
  assert.equal(actions.w1?.action, "complete");
  assert.equal(actions.i1, undefined);
});

test("skips completed orders", () => {
  const orders: ReconcileOrderInput[] = [
    {
      id: "c1",
      order_type: "customer",
      quantity: 2,
      status: "completed",
      created_at: "2025-01-01T00:00:00Z",
    },
    order("i1", "inventory", 1, "2025-01-02T00:00:00Z"),
  ];
  const actions = actionsById(allocateArrivedStock(orders, 1));
  assert.equal(actions.c1, undefined);
  assert.equal(actions.i1?.action, "delete");
});

test("zero or negative arrived returns empty", () => {
  assert.deepEqual(allocateArrivedStock([order("c1", "customer", 1, "2025-01-01")], 0), []);
  assert.deepEqual(allocateArrivedStock([order("c1", "customer", 1, "2025-01-01")], -1), []);
});
