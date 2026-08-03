# ייבוא מלאי מאקסל (`מלאי שוטף.xlsx`)

## מה הסקריפט עושה

1. מאפס את ה-DB (drop + migrate) — **בלי** seed מוק.
2. מייבא ספקים מלשונית `ספקים` (שורות 2–32).
3. יוצר ספקים חסרים שמופיעים במלאי עם מייל `noam.hasefer@gmail.com`.
4. בונה מבנה חנות (כולל `סטנד חוברות` / `brochure`) ומייבא ספרים + מיקומים.
5. יוצר חוסרים (`store=0`, `warehouse>0`) והזמנות מלאי (`quantity=3` כששני המלאים 0).
6. כותב דוח ל־[`docs/EXCEL_IMPORT_REPORT.json`](EXCEL_IMPORT_REPORT.json).

## הרצה

עותק יציב של הקובץ: `seed/data/malai.xlsx` (מומלץ כשנתיב Downloads בעברית נכשל).

```bash
npm run db:import-excel -- --file "seed/data/malai.xlsx"
```

אם ה-DB כבר ריק אחרי migrate:

```bash
npm run db:import-excel -- --file "seed/data/malai.xlsx" --skip-reset
```

דורש `DATABASE_URL` ב־`backend/.env`.

### Neon (פרודקשן)

1. גיבוי / snapshot לפי הצורך.
2. הגדר `DATABASE_URL` ל־Neon prod (או הרץ עם משתנה זמני).
3. אותה פקודה כמו למעלה.
4. אחרי הייבוא — restart ל־Render אם צריך לרענן חיבורים.

### תוצאות הרצה אחרונה (Neon, 2026-08-02)

| מדד | ערך |
|-----|-----|
| ספרים | 1393 |
| מיקומים | 1395 |
| חוסרים | 235 |
| הזמנות מלאי | 519 |
| ספקים (כולל 5 אוטומטיים) | 36 |
| `???` | 5 |
| אזהרות | 4 (מחסן=`?`, ספק ריק→כללי, 2 התנגשויות שם תא במדף) |

דוח מלא: [`EXCEL_IMPORT_REPORT.json`](EXCEL_IMPORT_REPORT.json).

בדיקת ספירה מהירה:

```bash
npx tsx scripts/smokeImport.ts
```

## מיפוי עמודות

| Excel | DB |
|-------|-----|
| A שם | `books.title` |
| B מחבר | `books.author` (ריק → NULL) |
| C מחיר | `books.price` (ריק → NULL) |
| D נושא | `books.topic` |
| E ספק | `books.supplier_id` |
| F חנות | `book_locations.quantity_in_cell` |
| G מחסן | חלק מ־`stock_quantity` הלא־משובץ |
| H–L | תא / קיר / מדף / תא / מיקום בתא |

`stock_quantity = חנות + מחסן` (אחרי איחוד שורות לאותו ספר).
