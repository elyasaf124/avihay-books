/** תא חסר אחד (`shortage_list`) לצורך מילוי מדף בקליטת משלוח. */
export type ShelfSlot = {
  shortageId: string;
  locationId: string | null;
  addedAt: string;
  quantityInCell: number;
  shelfStock: number;
};

export type ShelfFillPlan = {
  completedShortageIds: string[];
  locationAdds: { locationId: string; add: number }[];
  placed: number;
  /** עותקים שהגיעו ולא הונחו על מדף — נשארים במחסן. */
  warehouse: number;
};

export type IntakeOrderPlan =
  | { outcome: "reset_pending"; quantity: number }
  | { outcome: "complete" }
  | { outcome: "partial_pending"; quantity: number };

/**
 * קודם ממלאים תאים חסרים (מהישן לחדש), בלי לעבור את `shelf_stock`.
 * מה שלא הונח נשאר מחסן.
 */
export function planShelfFill(slots: ShelfSlot[], receivedQty: number): ShelfFillPlan {
  const cap = Math.max(0, Math.floor(receivedQty));
  const ordered = [...slots].sort(
    (a, b) => a.addedAt.localeCompare(b.addedAt) || a.shortageId.localeCompare(b.shortageId),
  );
  const running = new Map<string, number>();
  const adds = new Map<string, number>();
  const completedShortageIds: string[] = [];
  let placed = 0;

  for (const slot of ordered) {
    if (placed >= cap) break;
    if (!slot.locationId) continue;
    const current = running.get(slot.locationId) ?? slot.quantityInCell;
    if (slot.shelfStock - current < 1) continue;
    running.set(slot.locationId, current + 1);
    adds.set(slot.locationId, (adds.get(slot.locationId) ?? 0) + 1);
    completedShortageIds.push(slot.shortageId);
    placed += 1;
  }

  return {
    completedShortageIds,
    locationAdds: [...adds.entries()].map(([locationId, add]) => ({ locationId, add })),
    placed,
    warehouse: cap - placed,
  };
}

/** יתרת הזמנה אחרי קליטה: מלא → הושלם, חלקי או אפס → ממתין. */
export function planIntakeOrder(orderedQty: number, receivedQty: number): IntakeOrderPlan {
  if (!Number.isInteger(orderedQty) || orderedQty < 1) {
    throw new Error("invalid_ordered");
  }
  if (!Number.isInteger(receivedQty) || receivedQty < 0 || receivedQty > orderedQty) {
    throw new Error("invalid_received");
  }
  if (receivedQty === 0) return { outcome: "reset_pending", quantity: orderedQty };
  if (receivedQty === orderedQty) return { outcome: "complete" };
  return { outcome: "partial_pending", quantity: orderedQty - receivedQty };
}
