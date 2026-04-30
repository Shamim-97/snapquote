import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { listQuotes } from "../lib/quotes.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const quotes = await listQuotes(session.shop);
  return { quotes };
};

export default function QuotesIndex() {
  const { quotes } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Quotes">
      <s-button slot="primary-action" href="/app/quotes/new">
        New quote
      </s-button>

      <s-section>
        {quotes.length === 0 ? (
          <s-paragraph>
            No quotes yet. <s-link href="/app/quotes/new">Create one</s-link>.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base">
              <s-text>#</s-text>
              <s-text>Customer</s-text>
              <s-text>Status</s-text>
              <s-text>Total</s-text>
              <s-text>Created</s-text>
            </s-stack>
            {quotes.map((q) => (
              <s-box
                key={q.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base">
                  <s-link href={`/app/quotes/${q.id}`}>#{q.number}</s-link>
                  <s-text>{q.companyName ?? q.contactEmail ?? "—"}</s-text>
                  <s-badge>{q.status}</s-badge>
                  <s-text>
                    {q.currency} {q.total.toFixed(2)}
                  </s-text>
                  <s-text>{new Date(q.createdAt).toLocaleDateString()}</s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
