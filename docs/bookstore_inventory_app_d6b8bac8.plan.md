---
name: bookstore inventory app
overview: Build a Hebrew RTL Expo React Native bookstore inventory app backed by a Node + Express + local PostgreSQL API, with mock-seeded data swappable to Excel-imported data, delivered across 6 phases with a written-only WhatsApp plan at the end.
todos:
  - id: p1_repo_bootstrap
    content: "Phase 1: bootstrap npm-workspace monorepo (backend, database, seed, mobile, shared, docs) with TS configs, ESLint, Prettier, .env.example, README"
    status: pending
  - id: p1_db_migrations
    content: "Phase 1: write numbered SQL migrations for all 11 tables with enums, UNIQUE on cells.cell_name, CHECK on shelves(unit_id XOR side_id), plus runMigrations.ts"
    status: pending
  - id: p1_repos
    content: "Phase 1: build backend/src/repos/*.ts with upsertX/findById/findAll/update/softDelete + zod schemas for every table"
    status: pending
  - id: p1_seed
    content: "Phase 1: implement /seed scripts (suppliers, books, shelving_units, unit_sides, shelves, cells, book_locations, orders, notifications) + runSeed.ts in dependency order, all Hebrew, globally unique cell_name"
    status: pending
  - id: p1_api
    content: "Phase 1: Express + TS API with routes for all resources, composed /store-map endpoint, and /books/:id/location implementing the full+short path resolution"
    status: pending
  - id: p1_mobile_bootstrap
    content: "Phase 1: Expo RN app with forced RTL, Hebrew font, Expo Router, react-query, axios, i18n strings file, theme placeholder, 5-tab navigator"
    status: pending
  - id: p1_home_map
    content: "Phase 1: Home Screen with SVG ח-shaped store map, tappable units, visible island split into צד א׳/צד ב׳, global SearchBar + BookDetailModal skeleton"
    status: pending
  - id: p2_unit_view
    content: "Phase 2: Unit Detail screen with island side toggle, shelves->cells->books with supplier color, tap-to-shortage, long-press modal, move-book flow, supplier/price filters"
    status: pending
  - id: p3_shortage_orders
    content: "Phase 3: Shortage List screen + Orders screen with three tabs (inventory/customer/whatsapp), per-supplier PDF export and mailto email"
    status: pending
  - id: p4_add_remove
    content: "Phase 4: Add/Remove/Update Inventory screen with supplier dropdown, qty +/- and price edit, New Book form with is_new flag, soft delete with confirm"
    status: pending
  - id: p5_notifications
    content: "Phase 5: backend cron jobs for low_stock / remove_from_display / supplier_reorder_reminder, Notifications screen, unread badge, expo-notifications local push"
    status: pending
  - id: p5b_excel_import
    content: "Phase 5b: scripts/importExcel.ts that reuses repo upsert functions; supports replace and merge modes; documents the column->field mapping per sheet"
    status: pending
  - id: p6_whatsapp_plan
    content: "Phase 6: write docs/PHASE_6_WHATSAPP_PLAN.md (provider comparison, webhook arch, intent detection, mapping to orders.order_type='whatsapp', references existing whatsapp_sessions table, effort estimate) — no code"
    status: pending
isProject: false
---

## High-level architecture

```mermaid
flowchart LR
  Mobile["Expo RN App<br/>(Hebrew RTL)"] -- HTTPS/JSON --> API["Express REST API<br/>(TypeScript)"]
  API -- pg --> DB[("PostgreSQL<br/>local, via pgAdmin")]
  Seed["/seed scripts"] -- upsert fns --> Repos["Repository layer"]
  Excel["Excel importer<br/>(Phase 5b)"] -- same upsert fns --> Repos
  Repos --> DB
  Stitch["Stitch MCP<br/>(existing project)"] -. tokens .-> Theme["mobile/src/theme"]
```

Key rule: every write path (seed scripts, Excel import, app mutations) goes through the **same repository upsert functions** so swapping mock seed -> Excel -> live UI updates is a no-code-change operation.

## Monorepo layout (npm workspaces)

```
avihay-books-V2/
├── backend/                  # Express + TS
│   └── src/{routes,controllers,services,db,repos,middleware,utils}
├── database/
│   ├── migrations/           # numbered .sql files
│   └── runMigrations.ts
├── seed/                     # mock data scripts (per brief)
│   ├── seed_suppliers.ts  seed_books.ts  seed_shelving_units.ts
│   ├── seed_unit_sides.ts seed_shelves.ts seed_cells.ts
│   ├── seed_book_locations.ts seed_orders.ts seed_notifications.ts
│   └── runSeed.ts
├── shared/                   # shared TS types between mobile & backend
├── mobile/                   # Expo RN (Expo Router)
│   ├── app/(tabs)/...
│   └── src/{components,api,hooks,theme,i18n,types}
├── docs/PHASE_6_WHATSAPP_PLAN.md
├── .env.example   package.json (workspaces)   README.md
```

## Phase 1 — DB schema, seed data, Home Screen store map

### 1a. Database & migrations (`database/migrations/`)
- One numbered SQL file per table, applied in order by `runMigrations.ts` using a `pg.Pool`.
- Key constraints from the brief:
  - `cells.cell_name` -> `UNIQUE`
  - `shelves` -> `CHECK ((unit_id IS NOT NULL AND side_id IS NULL) OR (unit_id IS NULL AND side_id IS NOT NULL))`
  - `unit_sides` only ever holds rows for the island unit (enforced at app layer + seed only).
- Enums via `CREATE TYPE`: `order_type`, `order_status`, `shortage_status`, `notification_type`, `whatsapp_intent`.
- `migrations_history` table to track applied files (id, filename, applied_at).

### 1b. Repository layer (`backend/src/repos/*.ts`)
One file per table exposing **`upsertX(record)`**, `findById`, `findAll`, `update`, `softDelete`. Every seed script and the future Excel importer call only these functions — never raw SQL elsewhere.

Example signature:

```ts
export async function upsertBook(b: BookInput): Promise<Book> { /* INSERT ... ON CONFLICT (id) DO UPDATE */ }
```

### 1c. Seed scripts (`seed/`)
- Each file exports `async function seed(): Promise<void>` and imports the matching repo's `upsertX`.
- `runSeed.ts` calls them strictly in the dependency order from the brief:
  `suppliers -> books -> shelving_units -> unit_sides -> shelves -> cells -> book_locations -> orders -> notifications`.
- Hebrew strings used everywhere (supplier names, unit names "ארון חזית" / "ארון שמאל" / "ארון ימין" / "האי", side labels "צד א׳" / "צד ב׳").
- `cell_name` generated as a globally unique numeric string (e.g. `"58"`) via a running counter so staff can say "go to cell 58".
- 4–5 suppliers, 30–40 books, 4 units (island only with sides), 3–6 shelves each, varying cells per shelf, every book gets at least one `book_locations` row, and `SUM(quantity_in_cell) == books.stock_quantity` is enforced inside `seed_book_locations.ts`.

### 1d. Express API (`backend/src/`)
- TypeScript, `express`, `pg`, `zod` for validation, `cors`, `helmet`, `pino` logging.
- Routes mounted under `/api/v1`:
  - `/suppliers`, `/books`, `/shelving-units` (with nested `/sides`, `/shelves`, `/cells`), `/book-locations`, `/shortage`, `/orders`, `/notifications`.
  - `/store-map` — composed endpoint returning the full nested tree the Home Screen renders (units -> sides? -> shelves -> cells -> books with supplier color).
  - `/books/:id/location` — returns both full path and short path per the **Location Resolution Logic** in the brief.
- `.env` -> `DATABASE_URL`, `PORT`, `CORS_ORIGIN`.

### 1e. Mobile app bootstrap (`mobile/`)
- `npx create-expo-app` with TypeScript + Expo Router.
- Force RTL on launch: `I18nManager.allowRTL(true); I18nManager.forceRTL(true);` in `app/_layout.tsx`, paired with `expo-localization`.
- Hebrew system font (Heebo or Assistant via `expo-font`).
- API client: `axios` + `@tanstack/react-query` for caching + pull-to-refresh.
- `mobile/src/theme/` reads tokens from Stitch (placeholder file now; populated after you share the URL).
- Tab navigator with the 5 top items per the brief: דף ראשי | מלאי | הזמנות | הוספה/הסרה | התראות.

### 1f. Home Screen — Store Map (ח shape)
- Component `StoreMap.tsx` rendered with `react-native-svg`.
- Reads `/store-map` once via React Query.
- ח-shaped layout (right unit + front unit + left unit forming the ח, plus the central island).
  - Position computed from `shelving_units.display_order` + `store_position`.
  - Island drawn as a centered rectangle visibly split into צד א׳ / צד ב׳.
- Each unit is a tappable `<Pressable>` -> `router.push('/unit/[unitId]')` (screen built in Phase 2).
- Top of screen: global `SearchBar` -> opens shared `BookDetailModal` (skeleton in Phase 1, full actions in Phase 2).

## Phase 2 — Unit Detail View
- Route `app/unit/[unitId].tsx`. If `has_sides` -> render a top toggle "צד א׳ / צד ב׳" (segmented control). Else render shelves directly under the unit.
- Each shelf renders a horizontal list of cells; each cell renders its books colored by `suppliers.color_hex`.
- Single tap on a book -> confirm dialog -> POST `/shortage` + optimistic gray-out.
- Long press -> `BookDetailModal` with full info + quick actions.
- "Move Book" modal -> picker for target unit/side/shelf/cell/position -> PATCH `/book-locations/:id`.
- Filter bar: supplier multi-select + price range slider, applied client-side over the loaded unit.

## Phase 3 — Shortage List + Orders
- `app/shortage.tsx`: table with Title | Stock | Restock | Move to Order, filter by supplier, pull-to-refresh.
- `app/(tabs)/orders.tsx`: three tabs (`Tab.Navigator`):
  - Inventory orders, Customer orders, WhatsApp orders — each fed by `/orders?type=...`.
  - Per-supplier grouping with **Export PDF** (`expo-print`) and **Send Email** (`Linking.openURL('mailto:...')` with pre-filled body; SendGrid path documented but not wired).

## Phase 4 — Add/Remove/Update Inventory + New Book flow
- `app/(tabs)/add-remove.tsx`: supplier dropdown -> table of that supplier's books with `+/-` quantity stepper and inline price edit -> PATCH `/books/:id` (also updates `book_locations` quantities if location selected).
- "ספר חדש" form: title, author, supplier, price, initial stock, topic, `is_new` checkbox (sets `is_new=true`, triggers 1-month display reminder logic in Phase 5).
- Soft delete -> PATCH `/books/:id` setting `is_active=false` behind a confirm dialog.

## Phase 5 — Notifications
- Backend cron (`node-cron`) jobs in `backend/src/services/notifications.ts`:
  - `low_stock`: any book where `stock_quantity <= reorder_threshold` and no open notification of same type.
  - `remove_from_display`: any book where `is_new = TRUE AND added_at < now() - interval '1 month'`.
  - `supplier_reorder_reminder`: per supplier where `last_order_date < now() - interval '14 days'`.
- `app/(tabs)/notifications.tsx`: grouped list, swipe-to-mark-read, unread badge on tab icon driven by `/notifications/unread-count`.
- Local push via `expo-notifications` triggered by polling unread-count every X minutes while app is open.

## Phase 5b — Excel importer (one-time initial load)
- `scripts/importExcel.ts` reads workbook (one sheet per table or a single multi-sheet file) via `xlsx`/`exceljs`.
- Per row, validates with the same `zod` schemas from `backend/src/repos/*`, then calls `upsertX` — **identical code path to seed scripts**, so no UI/API changes are required.
- Mode flag `--mode=replace|merge`. Replace mode truncates in reverse-dependency order before importing.

## Phase 6 — WhatsApp bot **(written plan only, no code)**
Deliverable: [docs/PHASE_6_WHATSAPP_PLAN.md](docs/PHASE_6_WHATSAPP_PLAN.md). Will cover:
- Provider comparison: Twilio WhatsApp API vs WhatsApp Business Cloud API (cost, template approval flow, dev ergonomics, Hebrew support).
- Webhook architecture: `POST /webhooks/whatsapp` -> signature verification -> session lookup/create in existing `whatsapp_sessions` -> intent dispatcher -> reply builder.
- Intent detection: start with keyword + regex matcher in Hebrew ("מחיר", "במלאי", "להזמין"); upgrade path to a lightweight NLP layer (e.g. on-device classifier) noted as optional.
- Mapping to `orders.order_type = 'whatsapp'` so they appear in Orders Tab 3.
- Reference existing `whatsapp_sessions` schema (do not redefine).
- Effort estimate + external prerequisites (WABA approval, phone number, template approvals, hosted public webhook URL).

## Cross-cutting requirements (applied throughout)
- Hebrew strings centralized in `mobile/src/i18n/he.ts` — **no hardcoded UI strings in components**.
- All destructive actions go through a shared `ConfirmDialog` component.
- All list screens implement `RefreshControl` for pull-to-refresh.
- Stitch tokens live in `mobile/src/theme/tokens.ts` and are consumed via a `useTheme()` hook; populated once you share the Stitch project URL.
- Shared TS types in `shared/` are imported by both `backend/` and `mobile/` so the API contract stays in sync.

## Resolved inputs (provided by user)
- **Stitch project:** [`https://stitch.withgoogle.com/projects/801500470673603782`](https://stitch.withgoogle.com/projects/801500470673603782?pli=1) — I'll fetch screens/tokens at the start of Phase 1 using the `design-md` skill, generate a `docs/DESIGN.md`, and translate it into `mobile/src/theme/tokens.ts`.
- **Database connection:** `postgres://postgres:postgres@localhost:5432/book-store` — written to `backend/.env` as `DATABASE_URL`. The DB name `book-store` contains a hyphen, so all SQL referencing it will quote the identifier (`"book-store"`); migrations will assume the database already exists in pgAdmin (no `CREATE DATABASE` from the migration runner).

## Pre-flight checks I'll do before writing code
1. Confirm `book-store` database is reachable with the provided URL via a tiny `pg` ping in `database/runMigrations.ts`.
2. Pull design data from the Stitch project; if any screen is missing tokens, fall back to neutral Hebrew RTL defaults (Heebo font, system colors) and flag the gap in `docs/DESIGN.md`.