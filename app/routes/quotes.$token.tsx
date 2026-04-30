import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { unauthenticated } from "../shopify.server";
import {
  getQuoteByToken,
  isExpired,
  markAccepted,
  markRejected,
} from "../lib/quotes.server";
import { createDraftOrderFromQuote } from "../lib/shopify-admin.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const token = params.token;
  if (!token) throw new Response("Not found", { status: 404 });
  const quote = await getQuoteByToken(token);
  if (!quote) throw new Response("Not found", { status: 404 });
  return { quote, expired: isExpired(quote) };
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const token = params.token;
  if (!token) throw new Response("Not found", { status: 404 });
  const quote = await getQuoteByToken(token);
  if (!quote) throw new Response("Not found", { status: 404 });

  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "reject") {
    await markRejected(quote.id);
    return { ok: true, status: "rejected" as const };
  }

  if (intent === "accept") {
    if (quote.status === "accepted") {
      return { ok: true, status: "accepted" as const, draftOrderName: quote.draftOrderName };
    }
    if (isExpired(quote)) {
      return { ok: false, error: "This quote has expired." };
    }
    const { admin } = await unauthenticated.admin(quote.shop);
    const draft = await createDraftOrderFromQuote(admin, {
      email: quote.contactEmail,
      note: `Quote #${quote.number} accepted by buyer`,
      currency: quote.currency,
      quoteNumber: quote.number,
      lines: quote.items.map((it) => ({
        variantId: it.variantId ?? null,
        title: it.title,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
    });
    await markAccepted(quote.id, draft.id, draft.name);
    return {
      ok: true,
      status: "accepted" as const,
      draftOrderName: draft.name,
      invoiceUrl: draft.invoiceUrl,
    };
  }

  return { ok: false, error: "Unknown intent" };
};

export default function PublicQuote() {
  const { quote, expired } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const accepted =
    quote.status === "accepted" || fetcher.data?.status === "accepted";
  const rejected =
    quote.status === "rejected" || fetcher.data?.status === "rejected";
  const invoiceUrl = (fetcher.data as { invoiceUrl?: string | null } | undefined)
    ?.invoiceUrl;

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 16px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: "#202223",
      }}
    >
      <header style={{ borderBottom: "1px solid #e1e3e5", paddingBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Quote #{quote.number}</h1>
        <p style={{ color: "#6d7175", margin: "8px 0 0" }}>
          {quote.companyName ?? quote.contactName ?? quote.contactEmail ?? ""}
        </p>
      </header>

      {expired && !accepted && (
        <div
          style={{
            background: "#fff4e4",
            color: "#8a6116",
            padding: 12,
            borderRadius: 8,
            marginTop: 16,
          }}
        >
          This quote has expired.
        </div>
      )}

      {accepted && (
        <div
          style={{
            background: "#e3f5e1",
            color: "#1d6f42",
            padding: 12,
            borderRadius: 8,
            marginTop: 16,
          }}
        >
          Quote accepted. {fetcher.data?.draftOrderName ?? quote.draftOrderName}
          {invoiceUrl && (
            <>
              {" — "}
              <a href={invoiceUrl}>Pay now</a>
            </>
          )}
        </div>
      )}

      {rejected && (
        <div
          style={{
            background: "#fde4e4",
            color: "#8b1f1f",
            padding: 12,
            borderRadius: 8,
            marginTop: 16,
          }}
        >
          Quote rejected.
        </div>
      )}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Items</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e1e3e5" }}>
              <th style={{ padding: 8 }}>Item</th>
              <th style={{ padding: 8 }}>Qty</th>
              <th style={{ padding: 8 }}>Unit</th>
              <th style={{ padding: 8, textAlign: "right" }}>Line</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((it) => (
              <tr key={it.id} style={{ borderBottom: "1px solid #f1f2f3" }}>
                <td style={{ padding: 8 }}>
                  {it.title}
                  {it.variantTitle ? ` — ${it.variantTitle}` : ""}
                </td>
                <td style={{ padding: 8 }}>{it.quantity}</td>
                <td style={{ padding: 8 }}>
                  {quote.currency} {it.unitPrice.toFixed(2)}
                </td>
                <td style={{ padding: 8, textAlign: "right" }}>
                  {quote.currency} {it.lineTotal.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ padding: 8, textAlign: "right" }}>
                <strong>Total</strong>
              </td>
              <td style={{ padding: 8, textAlign: "right" }}>
                <strong>
                  {quote.currency} {quote.total.toFixed(2)}
                </strong>
              </td>
            </tr>
            {quote.depositPercent > 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 8, textAlign: "right" }}>
                  Deposit ({quote.depositPercent}%)
                </td>
                <td style={{ padding: 8, textAlign: "right" }}>
                  {quote.currency}{" "}
                  {((quote.total * quote.depositPercent) / 100).toFixed(2)}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </section>

      {quote.notes && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18 }}>Notes</h2>
          <p>{quote.notes}</p>
        </section>
      )}

      {quote.expiresAt && (
        <p style={{ color: "#6d7175", marginTop: 16 }}>
          Expires: {new Date(quote.expiresAt).toLocaleDateString()}
        </p>
      )}

      {!accepted && !rejected && !expired && (
        <section
          style={{
            marginTop: 24,
            display: "flex",
            gap: 12,
          }}
        >
          <button
            disabled={busy}
            onClick={() =>
              fetcher.submit({ intent: "accept" }, { method: "POST" })
            }
            style={{
              background: "#008060",
              color: "white",
              border: "none",
              padding: "12px 20px",
              borderRadius: 8,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            {busy ? "Processing…" : "Accept quote"}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              fetcher.submit({ intent: "reject" }, { method: "POST" })
            }
            style={{
              background: "white",
              color: "#202223",
              border: "1px solid #babfc3",
              padding: "12px 20px",
              borderRadius: 8,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Reject
          </button>
        </section>
      )}

      {fetcher.data?.error && (
        <p style={{ color: "#8b1f1f", marginTop: 16 }}>{fetcher.data.error}</p>
      )}
    </main>
  );
}
