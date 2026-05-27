import { Alert, Linking, Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { OrderListItem, OrdersBySupplierGroup } from "@avihay-books/shared";
import { isOpenOrder } from "../api/orders";
import { he } from "../i18n/he";

/** שורות שעדיין לא סומנו כהוזמנו — לייצוא ומייל. */
function unorderedSupplierLines(group: OrdersBySupplierGroup): OrderListItem[] {
  return group.orders.filter((o) => isOpenOrder(o) && o.status !== "sent");
}

/**
 * עיצוב HTML פשוט להזמנת ספק, מתאים ל־`Print` (A4, RTL).
 */
function buildHtml(group: OrdersBySupplierGroup): string {
  const lines = unorderedSupplierLines(group);
  const rows = lines
    .map(
      (o) => `
        <tr>
          <td>${escapeHtml(o.book_title)}</td>
          <td>${escapeHtml(o.book_author)}</td>
          <td style="text-align:center">${o.quantity}</td>
        </tr>`,
    )
    .join("");

  const total = lines.reduce((sum, o) => sum + o.quantity, 0);
  const date = new Date().toLocaleDateString("he-IL");
  const docTitle = escapeHtml(he.orders.pdfDocumentTitle);

  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <title>${docTitle}</title>
  <style>
    body { font-family: -apple-system, Heebo, Arial, sans-serif; color: #0b1c30; padding: 32px; }
    h1 { color: #00236f; font-size: 22px; margin: 0 0 8px; }
    h2 { color: #00236f; font-size: 18px; margin: 0 0 4px; font-weight: 700; }
    .meta { color: #444651; font-size: 12px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 8px; border-bottom: 1px solid #c5c5d3; font-size: 13px; }
    th { background: #eff4ff; color: #00236f; text-align: right; }
    td:first-child, th:first-child { width: 45%; }
    .summary { margin-top: 18px; font-size: 13px; color: #213145; }
    .accent { display: inline-block; width: 12px; height: 12px; border-radius: 999px; background: ${group.supplier_color}; margin-left: 6px; vertical-align: middle; }
  </style>
</head>
<body>
  <h1>${docTitle}</h1>
  <h2><span class="accent"></span>${escapeHtml(group.supplier_name)}</h2>
  <div class="meta">${escapeHtml(group.supplier_email)} · ${date}</div>
  <table>
    <thead>
      <tr>
        <th>${he.orders.bookColumn}</th>
        <th>מחבר</th>
        <th>${he.orders.quantityColumn}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="summary">סך הכול: ${lines.length} כותרים · ${total} עותקים</p>
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

/** בדפדפן `Alert` של `react-native` לעיתים לא מוצג — משתמשים ב־`window.alert`. */
function showPdfUserMessage(title: string, body?: string): void {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(body ? `${title}\n\n${body}` : title);
    return;
  }
  if (body) Alert.alert(title, body);
  else Alert.alert(title);
}

/**
 * הדפסה בדפדפן בלי `expo-print` אמיתי:
 * - `about:blank` + `document.write` לעיתים משאירים לשונית ריקה — לכן טוענים `HTML` מ־`blob:`.
 * - אם `window.open` נחסם — מנסים `iframe` נסתר באותו דף (בלי לשונית חדשה).
 */
function printOrderHtmlInBrowserWindow(html: string): void {
  if (typeof window === "undefined") return;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  const scheduleRevoke = () => {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  };

  let didPrint = false;
  const invokePrint = (target: Window) => {
    if (didPrint) return;
    didPrint = true;
    try {
      target.focus();
      target.print();
    } catch {
      showPdfUserMessage(he.orders.pdf.failedTitle, he.orders.pdf.failedMessage);
    }
    scheduleRevoke();
  };

  const printWindow = window.open(objectUrl, "_blank");
  if (!printWindow) {
    URL.revokeObjectURL(objectUrl);
    printOrderHtmlWithHiddenIframe(html);
    return;
  }

  printWindow.addEventListener("load", () => invokePrint(printWindow));
  window.setTimeout(() => {
    try {
      if (printWindow.document.readyState === "complete") invokePrint(printWindow);
    } catch {
      invokePrint(printWindow);
    }
  }, 400);
  /** אם אירוע `load` לא נורה (דפדפן נדיר) — עדיין מנסים הדפסה */
  window.setTimeout(() => invokePrint(printWindow), 2_000);
}

function printOrderHtmlWithHiddenIframe(html: string): void {
  if (typeof document === "undefined" || !document.body) {
    showPdfUserMessage(he.orders.pdf.webPopupBlockedTitle, he.orders.pdf.webPopupBlockedMessage);
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", he.orders.pdfDocumentTitle);
  iframe.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:-1";
  iframe.srcdoc = html;

  const cleanup = () => {
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
    }, 120_000);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      showPdfUserMessage(he.orders.pdf.webPopupBlockedTitle, he.orders.pdf.webPopupBlockedMessage);
      return;
    }
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {
          showPdfUserMessage(he.orders.pdf.failedTitle, he.orders.pdf.failedMessage);
        } finally {
          cleanup();
        }
      }, 100);
    });
  };

  document.body.appendChild(iframe);
}

/**
 * מייצא את הזמנת הספק כקובץ `PDF` באמצעות `expo-print`, ופותח שיתוף ב־`expo-sharing`.
 */
export async function exportSupplierOrdersToPdf(group: OrdersBySupplierGroup): Promise<void> {
  const lines = unorderedSupplierLines(group);
  if (lines.length === 0) {
    showPdfUserMessage(he.orders.mail.allOrderedTitle, he.orders.mail.allOrderedMessage);
    return;
  }
  const html = buildHtml({ ...group, orders: lines });
  if (Platform.OS === "web") {
    printOrderHtmlInBrowserWindow(html);
    return;
  }
  try {
    const result = await Print.printToFileAsync({ html, base64: false });
    const uri = result?.uri;
    if (!uri) {
      showPdfUserMessage(he.orders.pdf.noPdfUriTitle, he.orders.pdf.noPdfUriMessage);
      return;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        UTI: "com.adobe.pdf",
        mimeType: "application/pdf",
        dialogTitle: he.orders.exportPdf,
      });
    } else {
      showPdfUserMessage(he.orders.exportPdf, uri);
    }
  } catch (e) {
    console.warn("[exportSupplierOrdersToPdf]", e);
    showPdfUserMessage(he.orders.pdf.failedTitle, he.orders.pdf.failedMessage);
  }
}

/**
 * פותח קליינט דוא״ל מקומי עם נושא וגוף מוכנים על בסיס קבוצת ההזמנות.
 */
export async function emailSupplierOrders(group: OrdersBySupplierGroup): Promise<void> {
  const lines = unorderedSupplierLines(group);
  if (lines.length === 0) {
    Alert.alert(he.orders.mail.allOrderedTitle, he.orders.mail.allOrderedMessage);
    return;
  }
  const subject = he.orders.mail.subjectTemplate.replace("{{supplier}}", group.supplier_name);
  const intro = unescapeNewlines(he.orders.mail.bodyIntro);
  const signoff = unescapeNewlines(he.orders.mail.bodySignoff);
  const bodyLines = lines
    .map((o) =>
      he.orders.mail.bodyLine
        .replace("{{title}}", o.book_title)
        .replace("{{author}}", o.book_author)
        .replace("{{quantity}}", String(o.quantity)),
    )
    .join("\n");
  const body = `${intro}\n\n${bodyLines}\n\n${signoff}`;
  const mailto = `mailto:${group.supplier_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const canOpen = Platform.OS === "web" ? true : await Linking.canOpenURL(mailto);
  if (canOpen) await Linking.openURL(mailto);
}

function unescapeNewlines(input: string): string {
  return input.replace(/\\n/g, "\n");
}
