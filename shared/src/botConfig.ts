/**
 * טיפוסים משותפים לקונפיגורציית בוט הוואטסאפ הניתנת לעריכה מהאפליקציה.
 * נצרכים גם ב-`backend` (מנוע השיחה + ה-API) וגם ב-`mobile` (מסכי הניהול),
 * כך שחוזה הנתונים נשאר מסונכרן בין שני הצדדים.
 */

/** מפתחות הענפים המובנים — קשורים ללוגיקה ב-`engine.ts` ולכן לא ניתנים למחיקה. */
export const BUILTIN_MENU_KEYS = [
  "stock",
  "order",
  "order_status",
  "hours",
  "payment",
  "catalog",
  "quote",
  "updates",
  "support",
] as const;
export type BuiltinMenuKey = (typeof BUILTIN_MENU_KEYS)[number];

/** סוג צעד (node) בזרימה מותאמת אישית. */
export const FLOW_NODE_TYPES = ["text", "buttons", "link", "document"] as const;
export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number];

/** פעולה שמתבצעת בלחיצה על כפתור בצעד מסוג `buttons`. */
export const FLOW_BUTTON_ACTIONS = ["goto", "end_loop", "main_menu", "handover"] as const;
export type FlowButtonAction = (typeof FLOW_BUTTON_ACTIONS)[number];

/** מה קורה אחרי צעד שאינו `buttons` (טקסט/קישור/מסמך). */
export const FLOW_AFTER_ACTIONS = ["end_loop", "handover", "next"] as const;
export type FlowAfterAction = (typeof FLOW_AFTER_ACTIONS)[number];

export interface FlowButton {
  id: string;
  title: string;
  action: FlowButtonAction;
  /** צעד היעד כאשר `action === "goto"`. */
  target_node_id?: string;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  /** גוף ההודעה הנשלחת (לכל הסוגים). */
  text: string;
  /** צעד מסוג `buttons` — עד 3 כפתורים. */
  buttons?: FlowButton[];
  /** צעד מסוג `link` — נשלח כ-`cta_url`. */
  link_url?: string;
  link_label?: string;
  /** צעד מסוג `document` — נשלח כמסמך עם כיתוב (`text`). */
  document_url?: string;
  document_filename?: string;
  /** המשך אחרי שליחה (לצעדים שאינם `buttons`). */
  after?: FlowAfterAction;
  /** צעד היעד כאשר `after === "next"`. */
  next_node_id?: string;
}

export interface CustomFlow {
  name: string;
  nodes: Record<string, FlowNode>;
  entry_node_id: string;
}

export interface MenuItemConfig {
  /** מזהה ייחודי. לענף מובנה — מזהה השורה הקיים (למשל `menu:stock`). */
  id: string;
  title: string;
  description: string;
  type: "builtin" | "custom";
  /** רק לענף מובנה. */
  builtin_key?: BuiltinMenuKey;
  /** רק לענף מותאם — מצביע על מפתח ב-`custom_flows`. */
  flow_id?: string;
  enabled: boolean;
  order: number;
}

export interface BotStoreInfo {
  store_name: string;
  store_address: string;
  hours_text: string;
  waze_url: string | null;
  bank_details: string;
  payment_credit_url: string | null;
  payment_bit_url: string | null;
  payment_paybox_url: string | null;
  catalog_pdf_url: string | null;
  updates_group_url: string | null;
  delivery_home_fee: number;
  delivery_point_fee: number;
  human_hours_start: number;
  human_hours_end: number;
}

/**
 * מפתחות הטקסטים הניתנים לעקיפה. `welcome` ו-`closing` תומכים ב-`{storeName}`,
 * ו-`supportOffHours` תומך ב-`{start}` ו-`{end}`.
 */
export const BOT_TEXT_KEYS = [
  "welcome",
  "menuButton",
  "menuPrompt",
  "closing",
  "b1AskTitle",
  "b1ManyMatches",
  "b1NoMatch",
  "b1ImageFallback",
  "orderAskType",
  "askName",
  "askPhone",
  "askAddress",
  "askDeliveryMethod",
  "askBookTitle",
  "askQuantity",
  "askMore",
  "askNotesPickup",
  "askNotesDelivery",
  "invalidQuantity",
  "orderDonePickup",
  "orderDoneDelivery",
  "quoteHandover",
  "supportPrompt",
  "supportAskBook",
  "supportReportSaved",
  "supportPosText",
  "supportHumanInHours",
  "supportOffHours",
  "supportQuestionSaved",
  "endLoopPrompt",
  "catalogCaption",
  "catalogMissing",
  "b3NoOrders",
  "b3MultipleOrders",
] as const;
export type BotTextKey = (typeof BOT_TEXT_KEYS)[number];

export type BotTextOverrides = Partial<Record<BotTextKey, string>>;

export interface BotConfigData {
  store_info: BotStoreInfo;
  menu_items: MenuItemConfig[];
  custom_flows: Record<string, CustomFlow>;
  text_overrides: BotTextOverrides;
}
