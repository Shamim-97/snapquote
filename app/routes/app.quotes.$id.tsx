import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getQuote,
  isExpired,
  markAccepted,
  markRejected,
  markSent,
} from "../lib/quotes.server";
import { createDraftOrderFromQuote } from "../lib/shopify-admin.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const id = params.id;
  if (!id) throw new Response("Not found", { status: 404 });
  const quote = await getQuote(session.shop, id);
  if (!quote) throw new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const publicUrl = `${url.origin}/quotes/${quote.publicToken}`;

  return { quote, publicUrl, expired: isExpired(quote) };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id;
  if (!id) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const intent = form.get("intent");
  const quote = await getQuote(session.shop, id);
  if (!quote) throw new Response("Not found", { status: 404 });

  if (intent === "send") {
    await markSent(session.shop, id);
    return { ok: true };
  }

  if (intent === "reject") {
    await markRejected(id);
    return { ok: true };
  }

  if (intent === "accept") {
    const draft = await createDraftOrderFromQuote(admin, {
      email: quote.contactEmail,
      note: `Quote #${quote.number}${quote.notes ? ` — ${quote.notes}` : ""}`,
      currency: quote.currency,
      quoteNumber: quote.number,
      lines: quote.items.map((it) => ({
        variantId: it.variantId ?? null,
        title: it.title,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
    });
    await markAccepted(id, draft.id, draft.name);
    return redirect(`/app/quotes/${id}`);
  }

  return { ok: false, error: "Unknown intent" };
};

export default function QuoteDetail() {
  const { quote, publicUrl, expired } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  function send() {
    fetcher.submit({ intent: "send" }, { method: "POST" });
  }
  function accept() {
    fetcher.submit({ intent: "accept" }, { method: "POST" });
  }
  function reject() {
    fetcher.submit({ intent: "reject" }, { method: "POST" });
  }

  return (
    <s-page heading={`Quote #${quote.number}`}>
      <s-button
        slot="primary-action"
        onClick={send}
        {...(busy ? { loading: true } : {})}
      >
        Mark as sent
      </s-button>

      <s-section heading="Status">
        <s-stack direction="inline" gap="base">
          <s-badge>{quote.status}</s-badge>
          {expired && <s-badge tone="warning">expired</s-badge>}
          <s-text>
            Total: {quote.currency} {quote.total.toFixed(2)}
          </s-text>
          {quote.draftOrderName && (
            <s-text>Draft order: {quote.draftOrderName}</s-text>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Customer">
        <s-stack direction="block" gap="small-100">
          <s-text>Company: {quote.companyName ?? "—"}</s-text>
          <s-text>Contact: {quote.contactName ?? "—"}</s-text>
          <s-text>Email: {quote.contactEmail ?? "—"}</s-text>
        </s-stack>
      </s-section>

      <s-section heading="Items">
        <s-stack direction="block" gap="base">
          {quote.items.map((it) => (
            <s-box
              key={it.id}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack direction="inline" gap="base">
                <s-text>{it.title}</s-text>
                {it.variantTitle && <s-text>({it.variantTitle})</s-text>}
                <s-text>Qty: {it.quantity}</s-text>
                <s-text>
                  Unit: {quote.currency} {it.unitPrice.toFixed(2)}
                </s-text>
                <s-text>
                  Line: {quote.currency} {it.lineTotal.toFixed(2)}
                </s-text>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Public link">
        <s-paragraph>
          Send this link to the buyer. They can review and accept the quote.
        </s-paragraph>
        <s-box padding="base" background="subdued" borderRadius="base">
          <s-text>{publicUrl}</s-text>
        </s-box>
      </s-section>

      <s-section slot="aside" heading="Actions">
        <s-stack direction="block" gap="base">
          <s-button
            onClick={accept}
            disabled={quote.status === "accepted" || busy}
          >
            Accept &amp; create draft order
          </s-button>
          <s-button
            variant="tertiary"
            onClick={reject}
            disabled={quote.status === "rejected" || busy}
          >
            Reject
          </s-button>
          <s-button
            variant="tertiary"
            href={`/quotes/${quote.publicToken}.pdf`}
            target="_blank"
          >
            Download PDF
          </s-button>
        </s-stack>
      </s-section>

      {quote.draftOrderId && (
        <s-section slot="aside" heading="Draft order">
          <s-paragraph>
            Linked draft order: {quote.draftOrderName}
          </s-paragraph>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
