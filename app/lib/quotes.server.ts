import crypto from "node:crypto";
import prisma from "../db.server";

export type QuoteLineInput = {
  productId?: string | null;
  variantId?: string | null;
  sku?: string | null;
  title: string;
  variantTitle?: string | null;
  quantity: number;
  unitPrice: number;
  originalPrice?: number | null;
  imageUrl?: string | null;
};

export function generatePublicToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

async function nextQuoteNumber(shop: string): Promise<number> {
  const counter = await prisma.shopCounter.upsert({
    where: { shop },
    create: { shop, lastQuote: 1 },
    update: { lastQuote: { increment: 1 } },
  });
  return counter.lastQuote;
}

export function computeTotals(
  items: Array<Pick<QuoteLineInput, "quantity" | "unitPrice"> & { discountPercent?: number }>,
) {
  let subtotal = 0;
  let discountTotal = 0;
  for (const it of items) {
    const line = it.quantity * it.unitPrice;
    const disc = (line * (it.discountPercent ?? 0)) / 100;
    subtotal += line;
    discountTotal += disc;
  }
  const total = subtotal - discountTotal;
  return {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    total: round2(total),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function createQuote(params: {
  shop: string;
  companyId?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  currency?: string;
  notes?: string | null;
  expiresAt?: Date | null;
  depositPercent?: number;
  items: QuoteLineInput[];
}) {
  const number = await nextQuoteNumber(params.shop);
  const itemsWithLineTotal = params.items.map((it, idx) => ({
    ...it,
    discountPercent: 0,
    lineTotal: round2(it.quantity * it.unitPrice),
    position: idx,
  }));
  const totals = computeTotals(itemsWithLineTotal);

  const quote = await prisma.quote.create({
    data: {
      shop: params.shop,
      publicToken: generatePublicToken(),
      number,
      status: "draft",
      companyId: params.companyId ?? null,
      companyName: params.companyName ?? null,
      contactName: params.contactName ?? null,
      contactEmail: params.contactEmail ?? null,
      currency: params.currency ?? "USD",
      notes: params.notes ?? null,
      expiresAt: params.expiresAt ?? null,
      depositPercent: params.depositPercent ?? 0,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
      items: { create: itemsWithLineTotal },
      events: { create: { type: "created" } },
    },
    include: { items: true },
  });

  return quote;
}

export async function listQuotes(shop: string) {
  return prisma.quote.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getQuote(shop: string, id: string) {
  return prisma.quote.findFirst({
    where: { shop, id },
    include: { items: { orderBy: { position: "asc" } }, events: { orderBy: { createdAt: "desc" } } },
  });
}

export async function getQuoteByToken(token: string) {
  return prisma.quote.findUnique({
    where: { publicToken: token },
    include: { items: { orderBy: { position: "asc" } } },
  });
}

export async function markSent(shop: string, id: string) {
  await prisma.quote.update({
    where: { id },
    data: { status: "sent", events: { create: { type: "sent" } } },
  });
}

export async function markAccepted(id: string, draftOrderId: string, draftOrderName: string) {
  await prisma.quote.update({
    where: { id },
    data: {
      status: "accepted",
      acceptedAt: new Date(),
      draftOrderId,
      draftOrderName,
      events: { create: { type: "accepted", meta: draftOrderName } },
    },
  });
}

export async function markRejected(id: string) {
  await prisma.quote.update({
    where: { id },
    data: {
      status: "rejected",
      rejectedAt: new Date(),
      events: { create: { type: "rejected" } },
    },
  });
}

export function isExpired(quote: { expiresAt: Date | null }) {
  if (!quote.expiresAt) return false;
  return new Date(quote.expiresAt) < new Date();
}

export function quoteStatusBadgeTone(status: string): "info" | "success" | "warning" | "critical" | "neutral" {
  switch (status) {
    case "draft":
      return "neutral";
    case "sent":
      return "info";
    case "accepted":
      return "success";
    case "rejected":
      return "critical";
    case "expired":
      return "warning";
    default:
      return "neutral";
  }
}
