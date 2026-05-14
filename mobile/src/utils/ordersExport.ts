import { Alert, Linking, Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { OrdersBySupplierGroup } from "@avihay-books/shared";
import { he } from "../i18n/he";

/**
 * עיצוב HTML פשוט להזמנת ספק, מתאים ל־`Print` (A4, RTL).
 */
function buildHtml(group: OrdersBySupplierGroup): string {
  const rows = group.orders
    .map(
      (o) => `
        <tr>
          <td>${escapeHtml(o.book_title)}</td>
          <td>${escapeHtml(o.book_author)}</td>
          <td style="text-align:center">${o.quantity}</td>
          <td style="text-align:left">${he.orders.pricePrefix} ${escapeHtml(o.book_price)}</td>
        </tr>`,
    )
    .join("");

  const total = group.orders.reduce((sum, o) => sum + o.quantity, 0);
  const date = new Date().toLocaleDateString("he-IL");

  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <title>${he.orders.subjectPdfSafe}</title>
  <style>
    body { font-family: -apple-system, Heebo, Arial, sans-serif; color: #0b1c30; padding: 32px; }
    h1 { color: #00236f; font-size: 22px; margin: 0 0 4px; }
    .meta { color: #444651; font-size: 12px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 8px; border-bottom: 1px solid #c5c5d3; font-size: 13px; }
    th { background: #eff4ff; color: #00236f; text-align: right; }
    td:first-child, th:first-child { width: 40%; }
    .summary { margin-top: 18px; font-size: 13px; color: #213145; }
    .accent { display: inline-block; width: 12px; height: 12px; border-radius: 999px; background: ${group.supplier_color}; margin-left: 6px; vertical-align: middle; }
  </style>
</head>
<body>
  <h1><span class="accent"></span>${escapeHtml(group.supplier_name)}</h1>
  <div class="meta">${escapeHtml(group.supplier_email)} · ${date}</div>
  <table>
    <thead>
      <tr>
        <th>${he.orders.bookColumn}</th>
        <th>מחבר</th>
        <th>${he.orders.quantityColumn}</th>
        <th>מחיר ליחידה</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="summary">סך הכול: ${group.orders.length} כותרים · ${total} עותקים</p>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * מייצא את הזמנת הספק כקובץ `PDF` באמצעות `expo-print`, ופותח שיתוף ב־`expo-sharing`.
 * ב־`web` אין `Print.printToFileAsync` ולכן אנו נופלים להתראה עם הודעה ידידותית.
 */
export async function exportSupplierOrdersToPdf(group: OrdersBySupplierGroup): Promise<void> {
  if (Platform.OS === "web") {
    Alert.alert(he.orders.pdf.missingTitle, he.orders.pdf.missingMessage);
    return;
  }
  try {
    const { uri } = await Print.printToFileAsync({ html: buildHtml(group), base64: false });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        UTI: "com.adobe.pdf",
        mimeType: "application/pdf",
        dialogTitle: he.orders.exportPdf,
      });
    } else {
      Alert.alert(he.orders.exportPdf, uri);
    }
  } catch {
    Alert.alert(he.orders.pdf.failedTitle, he.orders.pdf.failedMessage);
  }
}

/**
 * פותח קליינט דוא״ל מקומי עם נושא וגוף מוכנים על בסיס קבוצת ההזמנות.
 */
export async function emailSupplierOrders(group: OrdersBySupplierGroup): Promise<void> {
  const subject = `${he.orders.mail.subjectPrefix} ${group.supplier_name}`;
  const intro = unescapeNewlines(he.orders.mail.bodyIntro);
  const signoff = unescapeNewlines(he.orders.mail.bodySignoff);
  const lines = group.orders
    .map((o) =>
      he.orders.mail.bodyLine
        .replace("{{title}}", o.book_title)
        .replace("{{author}}", o.book_author)
        .replace("{{quantity}}", String(o.quantity)),
    )
    .join("\n");
  const body = `${intro}\n\n${lines}\n\n${signoff}`;
  const mailto = `mailto:${group.supplier_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const canOpen = Platform.OS === "web" ? true : await Linking.canOpenURL(mailto);
  if (canOpen) await Linking.openURL(mailto);
}

function unescapeNewlines(input: string): string {
  return input.replace(/\\n/g, "\n");
}
