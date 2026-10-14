import { Router } from "express";
import { z } from "zod";
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
import type { Book, BookLocation, BookWithLocations } from "@avihay-books/shared";

export const booksRouter = Router();

const adjustStockSchema = z.object({
  delta: z.number().int().min(-9999).max(9999).refine((value) => value !== 0),
  location_id: z.string().uuid().nullable(),
});

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

/**
 * עדכון מלאי כולל ומיקום באותה טרנזקציה. `location_id: null` משנה מחסן בלבד;
 * כשנבחר תא, אותה דלתא מתווספת/נגרעת גם מהמלאי הכולל וגם מהתא.
 */
booksRouter.post(
  "/:id/adjust-stock",
  asyncHandler(async (req, res) => {
    const { delta, location_id: locationId } = adjustStockSchema.parse(req.body);
    const client = await pool.connect();
    let book!: Book;
    let location: BookLocation | undefined;

    try {
      await client.query("BEGIN");
      const bookResult = await client.query<Book>(
        "SELECT * FROM books WHERE id = $1 FOR UPDATE",
        [req.params.id],
      );
      const currentBook = bookResult.rows[0];
      if (!currentBook) throw new HttpError(404, "book_not_found");

      const nextStock = Number(currentBook.stock_quantity) + delta;
      if (nextStock < 0) {
        throw new HttpError(400, "insufficient_stock", {
          stock_quantity: currentBook.stock_quantity,
        });
      }

      let shelfTotal = 0;
      if (locationId) {
        const locationResult = await client.query<BookLocation>(
          "SELECT * FROM book_locations WHERE id = $1 AND book_id = $2 FOR UPDATE",
          [locationId, req.params.id],
        );
        const currentLocation = locationResult.rows[0];
        if (!currentLocation) throw new HttpError(404, "location_not_found");

        const nextLocationQty = Number(currentLocation.quantity_in_cell) + delta;
        if (nextLocationQty < 0) {
          throw new HttpError(400, "insufficient_location_stock", {
            quantity_in_cell: currentLocation.quantity_in_cell,
          });
        }
        if (nextLocationQty > Number(currentLocation.shelf_stock)) {
          throw new HttpError(400, "quantity_above_shelf_stock", {
            shelf_stock: currentLocation.shelf_stock,
            quantity_in_cell: currentLocation.quantity_in_cell,
          });
        }

        const totalResult = await client.query<{ total: number }>(
          `SELECT COALESCE(SUM(quantity_in_cell), 0)::int AS total
             FROM book_locations
            WHERE book_id = $1`,
          [req.params.id],
        );
        const previousShelfTotal = Number(totalResult.rows[0]?.total ?? 0);
        shelfTotal = previousShelfTotal + delta;
        const previousExcess = Math.max(
          0,
          previousShelfTotal - Number(currentBook.stock_quantity),
        );
        if (shelfTotal - nextStock > previousExcess) {
          throw new HttpError(400, "stock_below_locations", {
            stock_quantity: nextStock,
            locations_quantity: shelfTotal,
          });
        }

        const updatedLocation = await client.query<BookLocation>(
          `UPDATE book_locations SET quantity_in_cell = $2
            WHERE id = $1 RETURNING *`,
          [locationId, nextLocationQty],
        );
        location = updatedLocation.rows[0];
      } else {
        const totalResult = await client.query<{ total: number }>(
          `SELECT COALESCE(SUM(quantity_in_cell), 0)::int AS total
             FROM book_locations
            WHERE book_id = $1`,
          [req.params.id],
        );
        shelfTotal = Number(totalResult.rows[0]?.total ?? 0);
        const previousExcess = Math.max(
          0,
          shelfTotal - Number(currentBook.stock_quantity),
        );
        if (shelfTotal - nextStock > previousExcess) {
          throw new HttpError(400, "stock_below_locations", {
            stock_quantity: nextStock,
            locations_quantity: shelfTotal,
          });
        }
      }

      const updatedBook = await client.query<Book>(
        "UPDATE books SET stock_quantity = $2 WHERE id = $1 RETURNING *",
        [req.params.id, nextStock],
      );
      book = updatedBook.rows[0];
      if (delta > 0) {
        await reconcileOrdersOnStockArrival(req.params.id!, delta, client);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    invalidateStoreMapCache();
    if (delta > 0) {
      await restoreBookShortagesIfNoOpenOrders(req.params.id!).catch(() => {});
    } else {
      await maybePromoteEmptyCellShortagesToOrder(req.params.id!).catch((err: unknown) => {
        logger.error({ err, bookId: req.params.id }, "maybePromoteEmptyCellShortagesToOrder failed");
      });
    }
    res.json({ book, ...(location ? { location } : {}) });
  }),
);

booksRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    // מלאי + ריקונסיליאציית הזמנות באותה טרנזקציה — מונע מצב שבו המלאי עלה וההזמנה נשארה
    const client = await pool.connect();
    let row!: Book;
    let oldStock = 0;
    try {
      await client.query("BEGIN");
      const existingResult = await client.query<Book>(
        "SELECT * FROM books WHERE id = $1 FOR UPDATE",
        [req.params.id],
      );
      const existing = existingResult.rows[0];
      if (!existing) throw new HttpError(404, "book_not_found");
      oldStock = Number(existing.stock_quantity);
      const merged = { ...existing, ...req.body, id: req.params.id };

      if (req.body?.stock_quantity != null) {
        const requestedStock = Number(req.body.stock_quantity);
        const locationsResult = await client.query<{ total: number }>(
          `SELECT COALESCE(SUM(quantity_in_cell), 0)::int AS total
             FROM book_locations
            WHERE book_id = $1`,
          [req.params.id],
        );
        const locationsTotal = Number(locationsResult.rows[0]?.total ?? 0);
        if (Number.isInteger(requestedStock) && requestedStock < locationsTotal) {
          throw new HttpError(400, "stock_below_locations", {
            stock_quantity: requestedStock,
            locations_quantity: locationsTotal,
          });
        }
      }

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
