/**
 * מיון עברי זול. `String.prototype.localeCompare(x, "he")` ב־Hermes/Android בונה
 * `ICU collator` חדש בכל קריאה, ולכן מיון של כמה מאות ספרים לקח שניות ארוכות.
 * כאן ה־`collator` נוצר פעם אחת ומשמש את כל ההשוואות.
 */
let collator: { compare: (a: string, b: string) => number } | null = null;

function getCollator(): { compare: (a: string, b: string) => number } {
  if (collator != null) return collator;
  try {
    collator = new Intl.Collator("he", { numeric: true, sensitivity: "base" });
  } catch {
    /** סביבה בלי `Intl` — סדר נקודות הקוד תואם לסדר האלפבית העברי. */
    collator = { compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0) };
  }
  return collator;
}

export function compareHebrew(a: string, b: string): number {
  return getCollator().compare(a, b);
}

/**
 * מיון לפי מפתחות עבריים: כל מפתח מחושב פעם אחת לפריט (ולא `O(n log n)` פעמים),
 * וההשוואה עצמה משתמשת ב־`collator` המשותף.
 */
export function sortByHebrewKeys<T>(
  items: T[],
  keys: (item: T) => string[],
  tieBreak?: (a: T, b: T) => number,
): T[] {
  const compare = getCollator().compare;
  const decorated = items.map((item) => ({ item, keys: keys(item) }));
  decorated.sort((a, b) => {
    for (let i = 0; i < a.keys.length; i++) {
      const diff = compare(a.keys[i]!, b.keys[i]!);
      if (diff !== 0) return diff;
    }
    return tieBreak ? tieBreak(a.item, b.item) : 0;
  });
  return decorated.map((d) => d.item);
}

/** ספרים בתא מדף — מיון א-ב לפי כותרת; `location_id` כשובר שוויון יציב. */
export function sortShelfBooksByTitle<T extends { title: string; location_id: string }>(
  books: readonly T[],
): T[] {
  if (books.length <= 1) return [...books];
  return sortByHebrewKeys([...books], (b) => [b.title], (a, b) =>
    a.location_id < b.location_id ? -1 : a.location_id > b.location_id ? 1 : 0,
  );
}
