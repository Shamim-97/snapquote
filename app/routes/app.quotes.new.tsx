import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { createQuote } from "../lib/quotes.server";
import {
  searchVariants,
  type ProductVariantSearchResult,
} from "../lib/shopify-admin.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (q) {
    const variants = await searchVariants(admin, q);
    return { variants };
  }
  return { variants: [] as ProductVariantSearchResult[] };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const payload = form.get("payload");
  if (typeof payload !== "string") {
    return { error: "Missing payload" };
  }
  const parsed = JSON.parse(payload) as {
    companyName?: string;
    contactEmail?: string;
    contactName?: string;
    currency?: string;
    notes?: string;
    expiresAt?: string;
    depositPercent?: number;
    items: Array<{
      variantId?: string;
      productId?: string;
      sku?: string;
      title: string;
      variantTitle?: string;
      quantity: number;
      unitPrice: number;
      originalPrice?: number;
      imageUrl?: string;
    }>;
  };

  if (!parsed.items || parsed.items.length === 0) {
    return { error: "Add at least one line item" };
  }

  const quote = await createQuote({
    shop: session.shop,
    companyName: parsed.companyName ?? null,
    contactEmail: parsed.contactEmail ?? null,
    contactName: parsed.contactName ?? null,
    currency: parsed.currency ?? "USD",
    notes: parsed.notes ?? null,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
    depositPercent: parsed.depositPercent ?? 0,
    items: parsed.items,
  });

  return redirect(`/app/quotes/${quote.id}`);
};

type Line = {
  key: string;
  variantId?: string;
  productId?: string;
  sku?: string;
  title: string;
  variantTitle?: string;
  quantity: number;
  unitPrice: number;
  originalPrice?: number;
  imageUrl?: string;
};

export default function NewQuote() {
  const { variants } = useLoaderData<typeof loader>();
  const searchFetcher = useFetcher<typeof loader>();
  const submitFetcher = useFetcher<typeof action>();

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [depositPercent, setDepositPercent] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const searchResults = searchFetcher.data?.variants ?? variants;

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  function addVariant(v: ProductVariantSearchResult) {
    setLines((prev) => [
      ...prev,
      {
        key: `${v.id}-${Date.now()}`,
        variantId: v.id,
        productId: v.productId,
        sku: v.sku ?? undefined,
        title: v.productTitle,
        variantTitle: v.title === "Default Title" ? undefined : v.title,
        quantity: 1,
        unitPrice: parseFloat(v.price),
        originalPrice: parseFloat(v.price),
        imageUrl: v.image ?? undefined,
      },
    ]);
  }

  function addCustomLine() {
    setLines((prev) => [
      ...prev,
      {
        key: `custom-${Date.now()}`,
        title: "Custom item",
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function runSearch() {
    if (!searchTerm) return;
    searchFetcher.load(`/app/quotes/new?q=${encodeURIComponent(searchTerm)}`);
  }

  function save() {
    if (lines.length === 0) return;
    const payload = {
      companyName: companyName || undefined,
      contactName: contactName || undefined,
      contactEmail: contactEmail || undefined,
      currency,
      notes: notes || undefined,
      expiresAt: expiresAt || undefined,
      depositPercent,
      items: lines.map((l) => ({
        variantId: l.variantId,
        productId: l.productId,
        sku: l.sku,
        title: l.title,
        variantTitle: l.variantTitle,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        originalPrice: l.originalPrice,
        imageUrl: l.imageUrl,
      })),
    };
    submitFetcher.submit(
      { payload: JSON.stringify(payload) },
      { method: "POST" },
    );
  }

  const isSaving = submitFetcher.state !== "idle";

  return (
    <s-page heading="New quote">
      <s-button
        slot="primary-action"
        onClick={save}
        {...(isSaving ? { loading: true } : {})}
      >
        Save quote
      </s-button>

      <s-section heading="Customer">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Company name"
            value={companyName}
            onChange={(e: any) => setCompanyName(e.target.value)}
          />
          <s-text-field
            label="Contact name"
            value={contactName}
            onChange={(e: any) => setContactName(e.target.value)}
          />
          <s-text-field
            label="Contact email"
            value={contactEmail}
            onChange={(e: any) => setContactEmail(e.target.value)}
          />
        </s-stack>
      </s-section>

      <s-section heading="Line items">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base">
            <s-text-field
              label="Search products"
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value)}
            />
            <s-button onClick={runSearch}>Search</s-button>
            <s-button variant="tertiary" onClick={addCustomLine}>
              Add custom line
            </s-button>
          </s-stack>

          {searchResults.length > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="small-100">
                <s-text>Search results</s-text>
                {searchResults.map((v) => (
                  <s-stack key={v.id} direction="inline" gap="base">
                    <s-text>
                      {v.productTitle}
                      {v.title !== "Default Title" ? ` — ${v.title}` : ""}
                    </s-text>
                    <s-text>${v.price}</s-text>
                    <s-button onClick={() => addVariant(v)}>Add</s-button>
                  </s-stack>
                ))}
              </s-stack>
            </s-box>
          )}

          {lines.length === 0 ? (
            <s-paragraph>No items added yet.</s-paragraph>
          ) : (
            <s-stack direction="block" gap="base">
              {lines.map((l) => (
                <s-box
                  key={l.key}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <s-stack direction="inline" gap="base">
                    <s-text-field
                      label="Title"
                      value={l.title}
                      onChange={(e: any) =>
                        updateLine(l.key, { title: e.target.value })
                      }
                    />
                    <s-number-field
                      label="Qty"
                      value={String(l.quantity)}
                      min={1}
                      onChange={(e: any) =>
                        updateLine(l.key, {
                          quantity: parseInt(e.target.value, 10) || 1,
                        })
                      }
                    />
                    <s-number-field
                      label="Unit price"
                      value={String(l.unitPrice)}
                      min={0}
                      step={0.01}
                      onChange={(e: any) =>
                        updateLine(l.key, {
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <s-text>
                      Line: {(l.quantity * l.unitPrice).toFixed(2)}
                    </s-text>
                    <s-button
                      variant="tertiary"
                      onClick={() => removeLine(l.key)}
                    >
                      Remove
                    </s-button>
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Terms">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Currency"
            value={currency}
            onChange={(e: any) => setCurrency(e.target.value.toUpperCase())}
          />
          <s-text-field
            label="Expires (YYYY-MM-DD)"
            value={expiresAt}
            onChange={(e: any) => setExpiresAt(e.target.value)}
          />
          <s-number-field
            label="Deposit %"
            value={String(depositPercent)}
            min={0}
            max={100}
            onChange={(e: any) =>
              setDepositPercent(parseInt(e.target.value, 10) || 0)
            }
          />
          <s-text-field
            label="Notes"
            value={notes}
            onChange={(e: any) => setNotes(e.target.value)}
          />
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Summary">
        <s-stack direction="block" gap="small-100">
          <s-text>Items: {lines.length}</s-text>
          <s-text>
            Subtotal: {currency} {subtotal.toFixed(2)}
          </s-text>
          {depositPercent > 0 && (
            <s-text>
              Deposit ({depositPercent}%): {currency}{" "}
              {((subtotal * depositPercent) / 100).toFixed(2)}
            </s-text>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
