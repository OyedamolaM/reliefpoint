import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { paymentMethodLabel, receiptDate, type Receipt } from "@/lib/receipt";

export async function receiptPdf(receipt: Receipt): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Receipt ${receipt.number}`);
  doc.setAuthor("Relief Point Pharmacy");
  doc.setCreationDate(new Date(receipt.paid_at));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.14, 0.2, 0.29),
    blue = rgb(0.09, 0.25, 0.77),
    muted = rgb(0.39, 0.45, 0.54),
    rule = rgb(0.88, 0.91, 0.94),
    pale = rgb(0.95, 0.97, 0.99);
  const left = 44,
    right = 551,
    width = right - left;
  let page = doc.addPage([595.28, 841.89]),
    y = 793;
  const safe = (value: string) =>
    [...value.replace(/₦/g, "NGN ").replace(/[\r\n\t]/g, " ")]
      .map((char) => {
        try {
          font.encodeText(char);
          return char;
        } catch {
          return "?";
        }
      })
      .join("");
  const text = (value: string, x: number, top: number, size = 10, strong = false, color = ink) => {
    page.drawText(safe(value), { x, y: top, size, font: strong ? bold : font, color });
  };
  const wrap = (value: string, maxWidth: number, size = 10, strong = false) => {
    const selected = strong ? bold : font,
      rows: string[] = [];
    let row = "";
    for (const word of safe(value).split(" ")) {
      if (row && selected.widthOfTextAtSize(row + " " + word, size) > maxWidth) {
        rows.push(row);
        row = "";
      }
      for (const char of (row ? " " : "") + word) {
        if (selected.widthOfTextAtSize(row + char, size) > maxWidth) {
          rows.push(row);
          row = "";
        }
        row += char;
      }
    }
    if (row) rows.push(row);
    return rows;
  };
  const rightText = (
    value: string,
    x: number,
    top: number,
    size = 10,
    strong = false,
    maxWidth = 120,
  ) => {
    const selected = strong ? bold : font,
      valueSafe = safe(value);
    const fitted = Math.min(size, maxWidth / Math.max(1, selected.widthOfTextAtSize(valueSafe, 1)));
    text(valueSafe, x - selected.widthOfTextAtSize(valueSafe, fitted), top, fitted, strong);
  };
  const line = (top: number, color = rule) =>
    page.drawLine({ start: { x: left, y: top }, end: { x: right, y: top }, thickness: 1, color });
  const pageHeader = (continued = false) => {
    page.drawRectangle({ x: left, y: 759, width: 34, height: 34, color: blue });
    page.drawRectangle({ x: left + 14, y: 765, width: 6, height: 22, color: rgb(0.73, 1, 0) });
    page.drawRectangle({ x: left + 6, y: 773, width: 22, height: 6, color: rgb(0.73, 1, 0) });
    wrap(receipt.business.name, 245, 16, true)
      .slice(0, 2)
      .forEach((row, i) => text(row, 90, 782 - i * 19, 16, true));
    rightText(continued ? "RECEIPT CONTINUED" : "PAYMENT RECEIPT", right, 784, 10, true, 170);
    rightText(
      receipt.test_mode ? "TEST PAYMENT - no live payment" : "PAID",
      right,
      765,
      9,
      true,
      170,
    );
    line(745, blue);
    y = 722;
  };
  const ensure = (height: number) => {
    if (y - height < 58) {
      page = doc.addPage([595.28, 841.89]);
      pageHeader(true);
      return true;
    }
    return false;
  };
  pageHeader();
  text("RECEIPT DETAILS", left, y, 9, true, muted);
  text("BILLED TO", 318, y, 9, true, muted);
  y -= 20;
  const top = y;
  for (const [label, value] of [
    ["Receipt no.", receipt.number],
    ["Order no.", receipt.reference],
    ["Date paid", receiptDate(receipt.paid_at) + " WAT"],
  ]) {
    text(label!, left, y, 9, false, muted);
    const rows = wrap(value!, 160, 9, true);
    rows.forEach((row, i) => text(row, 123, y - i * 13, 9, true));
    y -= Math.max(18, rows.length * 13 + 5);
  }
  const metaBottom = y;
  y = top;
  [receipt.customer.name, receipt.customer.email, receipt.customer.phone, receipt.customer.address]
    .filter(Boolean)
    .forEach((value, index) => {
      wrap(value, 233, 10, index === 0).forEach((row) => {
        text(row, 318, y, 10, index === 0);
        y -= 14;
      });
      y -= 3;
    });
  y = Math.min(metaBottom, y) - 20;
  const tableHeader = () => {
    page.drawRectangle({ x: left, y: y - 8, width, height: 27, color: pale });
    text("ITEM", left + 8, y + 2, 9, true, muted);
    rightText("QTY", 342, y + 2, 9, true, 30);
    rightText("UNIT PRICE", 437, y + 2, 9, true, 87);
    rightText("AMOUNT", right - 8, y + 2, 9, true, 104);
    y -= 29;
  };
  ensure(60);
  tableHeader();
  const money = (amount: number) =>
    `NGN ${(amount / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  for (const item of receipt.items) {
    const rows = wrap(item.name, 257, 10, true),
      height = Math.max(38, rows.length * 14 + 18);
    if (ensure(height + 28)) tableHeader();
    // Split unusually long names safely, repeating the table header after a page break.
    let rowTop = y;
    rightText(String(item.quantity), 342, rowTop, 10, false, 30);
    rightText(money(item.price_kobo), 437, rowTop, 9, false, 87);
    rightText(money(item.price_kobo * item.quantity), right - 8, rowTop, 9, true, 104);
    for (const row of rows) {
      if (y < 77) {
        page = doc.addPage([595.28, 841.89]);
        pageHeader(true);
        tableHeader();
      }
      text(row, left + 8, y, 10, true);
      y -= 14;
    }
    y = Math.min(y, rowTop - 18) - 9;
    line(y);
    y -= 17;
  }
  const allocations = receipt.payments && receipt.payments.length > 1 ? receipt.payments : [];
  ensure(Math.max(156, allocations.length * 17 + 55));
  y -= 8;
  const summaryTop = y;
  text("PAYMENT METHOD", left, y, 9, true, muted);
  y -= 19;
  text(paymentMethodLabel(receipt.method), left, y, 10);
  for (const part of allocations) {
    y -= 17;
    text(paymentMethodLabel(part.method), left, y, 9);
    rightText(money(part.amount), 277, y, 9, false, 115);
  }
  const paymentBottom = y;
  y = summaryTop;
  for (const [label, amount] of [
    ["Subtotal", receipt.subtotal],
    ["Delivery", receipt.delivery],
    ["Processing fee", receipt.processing],
    ["Total paid", receipt.total],
  ] as const) {
    const total = label === "Total paid";
    if (total) {
      y -= 8;
      page.drawLine({
        start: { x: 318, y: y + 9 },
        end: { x: right, y: y + 9 },
        color: blue,
        thickness: 1,
      });
    }
    text(label, 318, y, total ? 13 : 10, total);
    rightText(money(amount), right, y, total ? 13 : 10, total, 140);
    y -= total ? 25 : 22;
  }
  y = Math.min(paymentBottom, y) - 27;
  const footer = [
    "Thank you for choosing ReliefPoint.",
    receipt.business.address,
    receipt.business.email,
    receipt.business.phone,
    "Payment confirmation does not replace pharmacist approval or confirm delivery.",
    "Refunds are recorded separately.",
  ].filter(Boolean);
  const footerHeight = footer.reduce(
    (n, value, index) => n + wrap(value, width, index === 0 ? 11 : 9).length * 14 + 3,
    12,
  );
  ensure(footerHeight);
  line(y);
  y -= 22;
  footer.forEach((value, index) => {
    wrap(value, width, index === 0 ? 11 : 9, index === 0).forEach((row) => {
      text(row, left, y, index === 0 ? 11 : 9, index === 0, index === 0 ? ink : muted);
      y -= 14;
    });
    y -= 3;
  });
  doc.getPages().forEach((sheet, index) => {
    const label = `${safe(receipt.number)}  |  Page ${index + 1} of ${doc.getPageCount()}`;
    sheet.drawText(label, { x: left, y: 28, font, size: 8, color: muted });
  });
  return doc.save();
}
