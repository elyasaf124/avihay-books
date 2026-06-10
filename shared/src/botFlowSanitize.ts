import type { CustomFlow, FlowNode } from "./botConfig.js";

/** צמתים הנגישים מצומת הכניסה (כמו בוולידציה ב-API). */
export function computeReachable(
  nodes: Record<string, FlowNode>,
  entryId: string,
): Set<string> {
  const reachable = new Set<string>();
  const stack = [entryId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    const node = nodes[id];
    if (!node) continue;
    reachable.add(id);
    if (node.type === "buttons") {
      for (const b of node.buttons ?? []) {
        if (b.action === "goto" && b.target_node_id) stack.push(b.target_node_id);
      }
    } else if (node.after === "next" && node.next_node_id) {
      stack.push(node.next_node_id);
    }
  }
  return reachable;
}

function cloneNodes(nodes: Record<string, FlowNode>): Record<string, FlowNode> {
  return Object.fromEntries(
    Object.entries(nodes).map(([id, n]) => [id, { ...n, buttons: n.buttons?.map((b) => ({ ...b })) }]),
  );
}

function newBtnId(): string {
  return `btn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** מחבר צעד לצעד הבא — תומך גם בצעדי כפתורים (`goto`). */
function linkForward(from: FlowNode, toId: string): void {
  if (from.type === "buttons") {
    const buttons = [...(from.buttons ?? [])];
    const hasGoto = buttons.some((b) => b.action === "goto" && b.target_node_id === toId);
    if (hasGoto) return;

    const replaceIdx = buttons.findIndex((b) => b.action === "end_loop" || b.action === "main_menu");
    if (replaceIdx >= 0) {
      buttons[replaceIdx] = {
        ...buttons[replaceIdx]!,
        action: "goto",
        target_node_id: toId,
      };
    } else if (buttons.length < 3) {
      buttons.push({ id: newBtnId(), title: "המשך", action: "goto", target_node_id: toId });
    } else {
      buttons[2] = { ...buttons[2]!, action: "goto", target_node_id: toId, title: buttons[2]!.title || "המשך" };
    }
    from.buttons = buttons;
    return;
  }

  if (from.after === "handover") return;
  from.after = "next";
  from.next_node_id = toId;
}

function sanitizeNodeRefs(nodes: Record<string, FlowNode>): void {
  for (const node of Object.values(nodes)) {
    if (node.type === "buttons") {
      node.buttons = (node.buttons ?? []).map((b) => {
        if (b.action === "goto" && (!b.target_node_id || !nodes[b.target_node_id])) {
          return { ...b, action: "end_loop" as const, target_node_id: undefined };
        }
        return b;
      });
      if ((node.buttons ?? []).length === 0) {
        nodes[node.id] = { id: node.id, type: "text", text: node.text, after: "end_loop" };
      }
    } else if (node.after === "next" && (!node.next_node_id || !nodes[node.next_node_id])) {
      node.after = "end_loop";
      delete node.next_node_id;
    }
  }
}

/** מנקה צעד בודד (יעדי `goto` / `next` חסרים). */
export function sanitizeSingleNode(
  node: FlowNode,
  allNodes: Record<string, FlowNode>,
): FlowNode {
  const nodes = { ...allNodes, [node.id]: node };
  sanitizeNodeRefs(nodes);
  return nodes[node.id]!;
}

/**
 * מכין זרימה לשמירה: מחבר צעדים בשרשרת מצומת הכניסה,
 * מתקן כפתורים, ומסיר צעדים שלא ניתן לחבר.
 */
export function prepareFlowForSave(
  flow: CustomFlow,
  stepOrder: string[],
): CustomFlow {
  const nodes = cloneNodes(flow.nodes);
  sanitizeNodeRefs(nodes);

  const order: string[] = [];
  for (const id of stepOrder) {
    if (nodes[id] && !order.includes(id)) order.push(id);
  }
  for (const id of Object.keys(nodes)) {
    if (!order.includes(id)) order.push(id);
  }

  if (order.length === 0) {
    return { ...flow, nodes: {}, entry_node_id: flow.entry_node_id };
  }

  let entryId = nodes[flow.entry_node_id] ? flow.entry_node_id : order[0]!;
  let startIdx = order.indexOf(entryId);
  if (startIdx < 0) {
    entryId = order[0]!;
    startIdx = 0;
  }

  for (let i = 0; i < startIdx; i++) {
    delete nodes[order[i]!];
  }

  const chainIds = order.slice(startIdx).filter((id) => nodes[id]);

  for (let i = 0; i < chainIds.length - 1; i++) {
    const from = nodes[chainIds[i]!];
    const toId = chainIds[i + 1]!;
    if (from) linkForward(from, toId);
  }

  const lastId = chainIds[chainIds.length - 1];
  if (lastId) {
    const last = nodes[lastId];
    if (last && last.type !== "buttons") {
      last.after = "end_loop";
      delete last.next_node_id;
    }
  }

  const reachable = computeReachable(nodes, entryId);
  for (const id of Object.keys(nodes)) {
    if (!reachable.has(id)) delete nodes[id];
  }

  if (Object.keys(nodes).length === 1) {
    const only = nodes[entryId];
    if (only && only.type !== "buttons" && only.after === "next") {
      only.after = "end_loop";
      delete only.next_node_id;
    }
  }

  return { name: flow.name, entry_node_id: entryId, nodes };
}

/** מנקה את כל הזרימות המותאמות לפני וולידציה/שמירה. */
export function sanitizeAllCustomFlows(
  flows: Record<string, CustomFlow>,
): Record<string, CustomFlow> {
  const out: Record<string, CustomFlow> = {};
  for (const [id, flow] of Object.entries(flows)) {
    out[id] = prepareFlowForSave(flow, Object.keys(flow.nodes));
  }
  return out;
}
