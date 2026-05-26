import { z } from "zod";
import {
  NOTIFICATION_TYPES,
  ORDER_STATUSES,
  ORDER_TYPES,
  SHORTAGE_STATUSES,
  SIDE_LABELS,
  STORE_POSITIONS,
} from "@avihay-books/shared";

export const uuid = z.string().uuid();

/**
 * ערכי `TIMESTAMPTZ` מהמסד (דרך `pg`) מגיעים לעיתים כאובייקט `Date`.
 * בקשות JSON משתמשות במחרוזת ISO — הסכמה מאחדת את שני הצורות.
 */
const dbTimestamptzOptional = z.preprocess((val) => {
  if (val === undefined || val === null) return undefined;
  if (val instanceof Date) return val.toISOString();
  return val;
}, z.string().datetime().optional());

export const supplierInputSchema = z.object({
  id: uuid.optional(),
  name: z.string().min(1).max(255),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  email: z.string().email().max(255),
  last_order_date: z.string().datetime().nullable().optional(),
});
export type SupplierInput = z.infer<typeof supplierInputSchema>;

export const bookInputSchema = z.object({
  id: uuid.optional(),
  title: z.string().min(1).max(255),
  author: z.string().min(1).max(255),
  supplier_id: uuid,
  price: z.coerce.number().nonnegative(),
  stock_quantity: z.number().int().nonnegative().default(0),
  reorder_threshold: z.number().int().nonnegative().default(0),
  is_new: z.boolean().default(false),
  added_at: dbTimestamptzOptional,
  topic: z.string().max(100).default(""),
  is_active: z.boolean().default(true),
  copy_placement_notes: z.array(z.string().max(500)).default([]),
});
export type BookInput = z.infer<typeof bookInputSchema>;

export const shelvingUnitInputSchema = z.object({
  id: uuid.optional(),
  name: z.string().min(1).max(100),
  store_position: z.enum(STORE_POSITIONS),
  has_sides: z.boolean().default(false),
  is_display_unit: z.boolean().default(false),
  display_order: z.number().int().default(0),
});
export type ShelvingUnitInput = z.infer<typeof shelvingUnitInputSchema>;

export const unitSideInputSchema = z.object({
  id: uuid.optional(),
  unit_id: uuid,
  side_label: z.enum(SIDE_LABELS),
  side_order: z.union([z.literal(1), z.literal(2)]),
});
export type UnitSideInput = z.infer<typeof unitSideInputSchema>;

export const shelfInputSchema = z
  .object({
    id: uuid.optional(),
    unit_id: uuid.nullable().optional(),
    side_id: uuid.nullable().optional(),
    shelf_number: z.number().int().min(1),
    label: z.string().max(50).nullable().optional(),
  })
  .refine(
    (s) => (!!s.unit_id && !s.side_id) || (!s.unit_id && !!s.side_id),
    "shelves must reference exactly one of unit_id or side_id (XOR)",
  );
export type ShelfInput = z.infer<typeof shelfInputSchema>;

export const cellInputSchema = z.object({
  id: uuid.optional(),
  shelf_id: uuid,
  cell_number: z.number().int().min(1),
  cell_name: z.string().min(1).max(20),
  capacity: z.number().int().min(1),
});
export type CellInput = z.infer<typeof cellInputSchema>;

export const bookLocationInputSchema = z.object({
  id: uuid.optional(),
  book_id: uuid,
  cell_id: uuid,
  position_in_cell: z.number().int().min(1),
  quantity_in_cell: z.number().int().min(0),
});
export type BookLocationInput = z.infer<typeof bookLocationInputSchema>;

export const shortageInputSchema = z.object({
  id: uuid.optional(),
  book_id: uuid,
  location_id: uuid.nullish().optional(),
  added_at: z.string().datetime().optional(),
  status: z.enum(SHORTAGE_STATUSES).default("shortage"),
  resolved_at: z.string().datetime().nullable().optional(),
});
export type ShortageInput = z.infer<typeof shortageInputSchema>;

export const orderInputSchema = z
  .object({
    id: uuid.optional(),
    book_id: uuid.nullable().optional(),
    supplier_id: uuid.nullable().optional(),
    order_type: z.enum(ORDER_TYPES),
    quantity: z.number().int().positive(),
    customer_name: z.string().max(255).nullable().optional(),
    customer_phone: z.string().max(20).nullable().optional(),
    manual_book_title: z.string().max(500).nullable().optional(),
    manual_book_author: z.string().max(255).nullable().optional(),
    status: z.enum(ORDER_STATUSES).default("pending"),
  })
  .superRefine((data, ctx) => {
    const bookId = data.book_id ?? null;
    const manualTitle = data.manual_book_title?.trim() ?? "";

    if (data.order_type === "inventory") {
      if (!bookId && !manualTitle) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["book_id"],
          message: "inventory_requires_book_or_manual_title",
        });
      }
      if (bookId && manualTitle) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["manual_book_title"],
          message: "book_id_xor_manual_title",
        });
      }
      return;
    }

    if (!bookId && !manualTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["book_id"],
        message: "customer_or_whatsapp_requires_book_or_manual_title",
      });
    }
    if (bookId && manualTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manual_book_title"],
        message: "book_id_xor_manual_title",
      });
    }
  });
export type OrderInput = z.infer<typeof orderInputSchema>;

export const notificationInputSchema = z.object({
  id: uuid.optional(),
  type: z.enum(NOTIFICATION_TYPES),
  book_id: uuid.nullable().optional(),
  supplier_id: uuid.nullable().optional(),
  message: z.string().min(1),
  is_read: z.boolean().default(false),
});
export type NotificationInput = z.infer<typeof notificationInputSchema>;
