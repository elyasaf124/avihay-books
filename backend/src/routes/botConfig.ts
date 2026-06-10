/**
 * ניהול קונפיגורציית הבוט מהאפליקציה: שליפת הקונפיג המלא ושמירתו.
 * ה-`PUT` מאמת את כל המבנה ב-`zod`, כולל אילוצי WhatsApp (עד 10 פריטי תפריט,
 * עד 3 כפתורים, אורכי כותרות) ותקינות זרימות מותאמות (יעדי `goto`, צמתים מנותקים).
 */
import { Router } from "express";
import { z } from "zod";
import {
  BOT_TEXT_KEYS,
  BUILTIN_MENU_KEYS,
  FLOW_AFTER_ACTIONS,
  FLOW_BUTTON_ACTIONS,
  FLOW_NODE_TYPES,
  sanitizeAllCustomFlows,
  type BotConfigData,
} from "@avihay-books/shared";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getBotConfig, saveBotConfig } from "../repos/botConfig.repo.js";

const nullableUrl = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().url().nullable(),
);

const optionalUrl = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().url().optional(),
);

const flowButtonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(20),
  action: z.enum(FLOW_BUTTON_ACTIONS),
  target_node_id: z.string().optional(),
});

const flowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(FLOW_NODE_TYPES),
  text: z.string().max(4096).default(""),
  buttons: z.array(flowButtonSchema).max(3).optional(),
  link_url: optionalUrl,
  link_label: z.string().max(20).optional(),
  document_url: optionalUrl,
  document_filename: z.string().max(255).optional(),
  after: z.enum(FLOW_AFTER_ACTIONS).optional(),
  next_node_id: z.string().optional(),
});

const customFlowSchema = z.object({
  name: z.string().min(1).max(100),
  nodes: z.record(flowNodeSchema),
  entry_node_id: z.string().min(1),
});

const menuItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(24),
  description: z.string().max(72).default(""),
  type: z.enum(["builtin", "custom"]),
  builtin_key: z.enum(BUILTIN_MENU_KEYS).optional(),
  flow_id: z.string().optional(),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
});

const storeInfoSchema = z.object({
  store_name: z.string().min(1).max(100),
  store_address: z.string().max(500),
  hours_text: z.string().max(2000),
  waze_url: nullableUrl,
  bank_details: z.string().max(2000),
  payment_credit_url: nullableUrl,
  payment_bit_url: nullableUrl,
  payment_paybox_url: nullableUrl,
  catalog_pdf_url: nullableUrl,
  updates_group_url: nullableUrl,
  delivery_home_fee: z.number().nonnegative(),
  delivery_point_fee: z.number().nonnegative(),
  human_hours_start: z.number().int().min(0).max(23),
  human_hours_end: z.number().int().min(0).max(23),
});

const botConfigSchema = z
  .object({
    store_info: storeInfoSchema,
    menu_items: z.array(menuItemSchema).min(1).max(10),
    custom_flows: z.record(customFlowSchema).default({}),
    text_overrides: z.record(z.enum(BOT_TEXT_KEYS), z.string().min(1)).default({}),
  })
  .superRefine((cfg, ctx) => {
    if (!cfg.menu_items.some((m) => m.enabled)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["menu_items"],
        message: "at_least_one_menu_item_must_be_enabled",
      });
    }

    cfg.menu_items.forEach((item, i) => {
      if (item.type === "builtin" && !item.builtin_key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["menu_items", i, "builtin_key"],
          message: "builtin_item_requires_builtin_key",
        });
      }
      if (item.type === "custom") {
        if (!item.flow_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["menu_items", i, "flow_id"],
            message: "custom_item_requires_flow_id",
          });
        } else if (!cfg.custom_flows[item.flow_id]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["menu_items", i, "flow_id"],
            message: "flow_id_not_found",
          });
        }
      }
    });

    for (const [flowId, flow] of Object.entries(cfg.custom_flows)) {
      const nodeIds = Object.keys(flow.nodes);
      if (nodeIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["custom_flows", flowId, "nodes"],
          message: "flow_requires_at_least_one_node",
        });
        continue;
      }
      if (nodeIds.length > 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["custom_flows", flowId, "nodes"],
          message: "flow_exceeds_max_nodes",
        });
      }
      if (!flow.nodes[flow.entry_node_id]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["custom_flows", flowId, "entry_node_id"],
          message: "entry_node_not_found",
        });
      }

      for (const [nodeId, node] of Object.entries(flow.nodes)) {
        if (node.type === "buttons") {
          const buttons = node.buttons ?? [];
          if (buttons.length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["custom_flows", flowId, "nodes", nodeId, "buttons"],
              message: "buttons_node_requires_button",
            });
          }
          const ids = new Set<string>();
          buttons.forEach((b, bi) => {
            if (ids.has(b.id)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["custom_flows", flowId, "nodes", nodeId, "buttons", bi, "id"],
                message: "duplicate_button_id",
              });
            }
            ids.add(b.id);
            if (b.action === "goto" && (!b.target_node_id || !flow.nodes[b.target_node_id])) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["custom_flows", flowId, "nodes", nodeId, "buttons", bi, "target_node_id"],
                message: "goto_target_not_found",
              });
            }
          });
        } else if (node.after === "next" && (!node.next_node_id || !flow.nodes[node.next_node_id])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["custom_flows", flowId, "nodes", nodeId, "next_node_id"],
            message: "next_node_not_found",
          });
        }
      }

      // צמתים מנותקים: כל צומת חייב להיות נגיש מצומת הכניסה.
      const reachable = new Set<string>();
      const stack = [flow.entry_node_id];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (reachable.has(id)) continue;
        const node = flow.nodes[id];
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
      for (const nodeId of nodeIds) {
        if (!reachable.has(nodeId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["custom_flows", flowId, "nodes", nodeId],
            message: "orphan_node_unreachable",
          });
        }
      }
    }
  });

export const botConfigRouter = Router();

botConfigRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await getBotConfig());
  }),
);

botConfigRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const raw = req.body as BotConfigData;
    const payload: BotConfigData = {
      ...raw,
      custom_flows: sanitizeAllCustomFlows(raw.custom_flows ?? {}),
    };
    const parsed = botConfigSchema.parse(payload);
    const saved = await saveBotConfig(parsed as BotConfigData);
    res.json(saved);
  }),
);
