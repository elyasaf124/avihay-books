import "dotenv/config";
import { pool } from "../backend/src/db/pool.js";
import { seed as seedSuppliers } from "./seed_suppliers.js";
import { seed as seedBooks } from "./seed_books.js";
import { seed as seedShelvingUnits } from "./seed_shelving_units.js";
import { seed as seedUnitSides } from "./seed_unit_sides.js";
import { seed as seedShelves } from "./seed_shelves.js";
import { seed as seedCells } from "./seed_cells.js";
import { seed as seedBookLocations } from "./seed_book_locations.js";
import { seed as seedOrders } from "./seed_orders.js";
import { seed as seedNotifications } from "./seed_notifications.js";

async function main(): Promise<void> {
  console.log("[seed] starting in dependency order…");
  await seedSuppliers();
  await seedBooks();
  await seedShelvingUnits();
  await seedUnitSides();
  await seedShelves();
  await seedCells();
  await seedBookLocations();
  await seedOrders();
  await seedNotifications();
  console.log("[seed] done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
