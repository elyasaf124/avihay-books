import { Router } from "express";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import {
  findAllBooks,
  findBookById,
  searchBooks,
  softDeleteBook,
  upsertBook,
} from "../repos/books.repo.js";
import { findBookLocationsExpandedByBookIds } from "../repos/bookLocations.repo.js";
import { getBookLocationPaths } from "../services/bookLocation.js";
import { notifyLowStockAfterBookChange } from "../services/notifications.js";
import { reconcileOrdersOnStockArrival } from "../services/orderReconciliation.js";
import { invalidateStoreMapCache } from "../services/storeMapCache.js";
import type { BookWithLocations } from "@avihay-books/shared";

export const booksRouter = Router();

booksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length > 0) {
      const searchSupplierId =
        typeof req.query.supplier_id === "string" && req.query.supplier_id.length > 0
          ? req.query.supplier_id
          : undefined;
      res.json(await searchBooks(q, { supplierId: searchSupplierId }));
      return;
    }
    const supplierId =
      typeof req.query.supplier_id === "string" && req.query.supplier_id.length > 0
        ? req.query.supplier_id
        : undefined;
    const expandLocations = req.query.expand === "locations";
    const books = await findAllBooks({
      onlyActive: true,
      ...(supplierId ? { supplierId } : {}),
    });
    if (expandLocations) {
      const locsByBook = await findBookLocationsExpandedByBookIds(books.map((b) => b.id));
      const withLocs: BookWithLocations[] = books.map((b) => ({
        ...b,
        locations: locsByBook.get(b.id) ?? [],
      }));
      res.json(withLocs);
      return;
    }
    res.json(books);
  }),
);

booksRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await findBookById(req.params.id!);
    if (!row) throw new HttpError(404, "book_not_found");
    res.json(row);
  }),
);

booksRouter.get(
  "/:id/location",
  asyncHandler(async (req, res) => {
    const paths = await getBookLocationPaths(req.params.id!);
    res.json({ paths });
  }),
);

booksRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const row = await upsertBook(req.body);
    invalidateStoreMapCache();
    if (Number(row.stock_quantity) <= Number(row.reorder_threshold)) {
      await notifyLowStockAfterBookChange(
        { ...row, stock_quantity: row.stock_quantity + 1 },
        row,
      );
    }
    res.status(201).json(row);
  }),
);

booksRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await findBookById(req.params.id!);
    if (!existing) throw new HttpError(404, "book_not_found");
    const merged = { ...existing, ...req.body, id: req.params.id };
    const row = await upsertBook(merged);
    invalidateStoreMapCache();
    const oldStock = existing.stock_quantity;
    const newStock = row.stock_quantity;
    if (newStock > oldStock) {
      await reconcileOrdersOnStockArrival(req.params.id!, newStock - oldStock);
    } else {
      await notifyLowStockAfterBookChange(existing, row);
    }
    res.json(row);
  }),
);

booksRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await softDeleteBook(req.params.id!);
    invalidateStoreMapCache();
    res.status(204).end();
  }),
);
