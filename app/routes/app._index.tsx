import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [draft, sent, accepted, rejected, totalValue, recent] = await Promise.all([
    prisma.quote.count({ where: { shop, status: "draft" } }),
    prisma.quote.count({ where: { shop, status: "sent" } }),
    prisma.quote.count({ where: { shop, status: "accepted" } }),
    prisma.quote.count({ where: { shop, status: "rejected" } }),
    prisma.quote.aggregate({
      where: { shop, status: "accepted" },
      _sum: { total: true },
    }),
    prisma.quote.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    stats: {
      draft,
      sent,
      accepted,
      rejected,
      acceptedValue: totalValue._sum.total ?? 0,
    },
    recent,
  };
};

export default function Dashboard() {
  const { stats, recent } = useLoaderData<typeof loader>();

  return (
    <s-page heading="ShopIng Quote Pro">
      <s-button slot="primary-action" href="/app/quotes/new">
        New quote
      </s-button>

      <s-section heading="At a glance">
        <s-stack direction="inline" gap="base">
          <StatCard label="Drafts" value={String(stats.draft)} />
          <StatCard label="Sent" value={String(stats.sent)} />
          <StatCard label="Accepted" value={String(stats.accepted)} />
          <StatCard label="Rejected" value={String(stats.rejected)} />
          <StatCard
            label="Accepted value"
            value={`$${stats.acceptedValue.toFixed(2)}`}
          />
        </s-stack>
      </s-section>

      <s-section heading="Recent quotes">
        {recent.length === 0 ? (
          <s-paragraph>
            No quotes yet. <s-link href="/app/quotes/new">Create your first quote</s-link>.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {recent.map((q) => (
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
                  <s-text>${q.total.toFixed(2)}</s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Why ShopIng Quote Pro">
        <s-paragraph>
          Build B2B quotes with custom pricing, send to buyers, accept by link,
          auto-create draft orders with locked prices.
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>Negotiated line-item pricing</s-list-item>
          <s-list-item>One-click accept → draft order</s-list-item>
          <s-list-item>CSV / PO upload to cart</s-list-item>
          <s-list-item>Quote expiry + version history</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="subdued"
    >
      <s-stack direction="block" gap="small-100">
        <s-text>{label}</s-text>
        <s-heading>{value}</s-heading>
      </s-stack>
    </s-box>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
