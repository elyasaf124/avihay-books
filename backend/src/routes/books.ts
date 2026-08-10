import { Router } from "express";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import { pool } from "../db/pool.js";
import {
  findAllBooks,
  findBookById,
  searchBooks,
  softDeleteBook,
  upsertBook,
} from "../repos/books.repo.js";
import { findBookLocationsExpandedByBookIds } from "../repos/bookLocations.repo.js";
import { restoreBookShortagesIfNoOpenOrders } from "../repos/shortageList.repo.js";
import { getBookLocationPaths } from "../services/bookLocation.js";
import { reconcileOrdersOnStockArrival } from "../services/orderReconciliation.js";
import { maybePromoteEmptyCellShortagesToOrder } from "../services/shortage.js";
import { invalidateStoreMapCache } from "../services/storeMapCache.js";
import { logger } from "../utils/logger.js";
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
      const books = await searchBooks(q, { supplierId: searchSupplierId });
      if (req.query.expand === "locations") {
        const locsByBook = await findBookLocationsExpandedByBookIds(books.map((b) => b.id));
        const withLocs: BookWithLocations[] = books.map((b) => ({
          ...b,
          locations: locsByBook.get(b.id) ?? [],
        }));
        res.json(withLocs);
        return;
      }
      res.json(books);
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
    res.status(201).json(row);
  }),
);

booksRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await findBookById(req.params.id!);
    if (!existing) throw new HttpError(404, "book_not_found");
    const merged = { ...existing, ...req.body, id: req.params.id };
    const oldStock = Number(existing.stock_quantity);

    // מלאי + ריקונסיליאציית הזמנות באותה טרנזקציה — מונע מצב שבו המלאי עלה וההזמנה נשארה
    const client = await pool.connect();
    let row;
    try {
      await client.query("BEGIN");
      row = await upsertBook(merged, client);
      const arrived = Number(row.stock_quantity) - oldStock;
      if (arrived > 0) {
        await reconcileOrdersOnStockArrival(req.params.id!, arrived, client);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    invalidateStoreMapCache();
    const newStock = Number(row.stock_quantity);
    if (newStock > oldStock) {
      // best-effort אחרי commit — לא מפיל את עדכון המלאי
      await restoreBookShortagesIfNoOpenOrders(req.params.id!).catch(() => {});
    } else if (newStock < oldStock) {
      await maybePromoteEmptyCellShortagesToOrder(req.params.id!).catch((err: unknown) => {
        logger.error(
          { err, bookId: req.params.id },
          "maybePromoteEmptyCellShortagesToOrder failed",
        );
      });
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
