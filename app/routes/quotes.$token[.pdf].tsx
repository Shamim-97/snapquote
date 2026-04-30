import type { LoaderFunctionArgs } from "react-router";
import PDFDocument from "pdfkit";
import { getQuoteByToken } from "../lib/quotes.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const token = params.token;
  if (!token) throw new Response("Not found", { status: 404 });
  const quote = await getQuoteByToken(token);
  if (!quote) throw new Response("Not found", { status: 404 });

  const buffers: Buffer[] = [];
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  doc.on("data", (chunk) => buffers.push(chunk));
  const finished: Promise<Buffer> = new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });

  doc.fontSize(22).text(`Quote #${quote.number}`, { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#6d7175");
  if (quote.companyName) doc.text(`Company: ${quote.companyName}`);
  if (quote.contactName) doc.text(`Contact: ${quote.contactName}`);
  if (quote.contactEmail) doc.text(`Email: ${quote.contactEmail}`);
  if (quote.expiresAt)
    doc.text(`Expires: ${new Date(quote.expiresAt).toLocaleDateString()}`);
  doc.moveDown(1);

  doc.fillColor("#202223").fontSize(12);
  const colX = { item: 48, qty: 320, unit: 380, line: 470 };
  doc.text("Item", colX.item, doc.y, { continued: false });
  doc.text("Qty", colX.qty, doc.y - 14);
  doc.text("Unit", colX.unit, doc.y - 14);
  doc.text("Line", colX.line, doc.y - 14, { width: 80, align: "right" });
  doc
    .moveTo(48, doc.y + 4)
    .lineTo(548, doc.y + 4)
    .strokeColor("#e1e3e5")
    .stroke();
  doc.moveDown(0.5);

  for (const it of quote.items) {
    const y = doc.y;
    const label = it.variantTitle ? `${it.title} — ${it.variantTitle}` : it.title;
    doc.text(label, colX.item, y, { width: 260 });
    doc.text(String(it.quantity), colX.qty, y);
    doc.text(`${quote.currency} ${it.unitPrice.toFixed(2)}`, colX.unit, y);
    doc.text(
      `${quote.currency} ${it.lineTotal.toFixed(2)}`,
      colX.line,
      y,
      { width: 80, align: "right" },
    );
    doc.moveDown(0.5);
  }

  doc
    .moveTo(48, doc.y + 4)
    .lineTo(548, doc.y + 4)
    .strokeColor("#e1e3e5")
    .stroke();
  doc.moveDown(0.5);

  doc.fontSize(12).text(
    `Total: ${quote.currency} ${quote.total.toFixed(2)}`,
    { align: "right" },
  );

  if (quote.depositPercent > 0) {
    doc.fontSize(10).fillColor("#6d7175").text(
      `Deposit (${quote.depositPercent}%): ${quote.currency} ${(
        (quote.total * quote.depositPercent) /
        100
      ).toFixed(2)}`,
      { align: "right" },
    );
  }

  if (quote.notes) {
    doc.moveDown(1).fillColor("#202223").fontSize(11).text("Notes");
    doc.fontSize(10).fillColor("#6d7175").text(quote.notes);
  }

  doc.end();
  const buffer = await finished;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="quote-${quote.number}.pdf"`,
    },
  });
};
