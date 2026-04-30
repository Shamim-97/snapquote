import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import Papa from "papaparse";
import { authenticate } from "../shopify.server";
import { createQuote } from "../lib/quotes.server";
import { searchVariants } from "../lib/shopify-admin.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type Row = { sku: string; quantity: number; unitPrice?: number };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const csv = form.get("csv");
  const companyName = form.get("companyName");
  const contactEmail = form.get("contactEmail");

  if (typeof csv !== "string" || !csv.trim()) {
    return { ok: false, error: "Paste CSV or upload a file" };
  }

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length) {
    return { ok: false, error: parsed.errors[0].message };
  }

  const rows: Row[] = [];
  for (const r of parsed.data) {
    const sku = (r.sku ?? r.SKU ?? "").trim();
    const qty = parseInt(r.quantity ?? r.qty ?? r.Quantity ?? "0", 10);
    const unit = parseFloat(r.unit_price ?? r.unitPrice ?? r.price ?? "");
    if (!sku || qty <= 0) continue;
    rows.push({
      sku,
      quantity: qty,
      unitPrice: Number.isFinite(unit) ? unit : undefined,
    });
  }
  if (rows.length === 0) {
    return { ok: false, error: "No valid rows. Need columns: sku, quantity[, unit_price]" };
  }

  const items: Array<{
    variantId?: string;
    productId?: string;
    sku?: string;
    title: string;
    variantTitle?: string;
    quantity: number;
    unitPrice: number;
    originalPrice?: number;
    imageUrl?: string;
  }> = [];

  const unmatched: string[] = [];
  for (const row of rows) {
    const variants = await searchVariants(admin, `sku:${row.sku}`);
    const v = variants[0];
    if (!v) {
      unmatched.push(row.sku);
      items.push({
        sku: row.sku,
        title: `Unmatched SKU ${row.sku}`,
        quantity: row.quantity,
        unitPrice: row.unitPrice ?? 0,
      });
      continue;
    }
    const price = row.unitPrice ?? parseFloat(v.price);
    items.push({
      variantId: v.id,
      productId: v.productId,
      sku: v.sku ?? row.sku,
      title: v.productTitle,
      variantTitle: v.title === "Default Title" ? undefined : v.title,
      quantity: row.quantity,
      unitPrice: price,
      originalPrice: parseFloat(v.price),
      imageUrl: v.image ?? undefined,
    });
  }

  const quote = await createQuote({
    shop: session.shop,
    companyName: typeof companyName === "string" ? companyName : null,
    contactEmail: typeof contactEmail === "string" ? contactEmail : null,
    items,
  });

  const url = `/app/quotes/${quote.id}${
    unmatched.length ? `?unmatched=${encodeURIComponent(unmatched.join(","))}` : ""
  }`;
  return redirect(url);
};

export default function ImportPO() {
  const fetcher = useFetcher<typeof action>();
  const [csv, setCsv] = useState(
    "sku,quantity,unit_price\nSKU-001,10,12.50\nSKU-002,5,",
  );
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const busy = fetcher.state !== "idle";

  function submit() {
    fetcher.submit(
      { csv, companyName, contactEmail },
      { method: "POST" },
    );
  }

  function handleFile(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setCsv(reader.result);
    };
    reader.readAsText(file);
  }

  return (
    <s-page heading="Import PO / CSV → Quote">
      <s-button
        slot="primary-action"
        onClick={submit}
        {...(busy ? { loading: true } : {})}
      >
        Build quote from CSV
      </s-button>

      <s-section heading="Customer">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Company name"
            value={companyName}
            onChange={(e: any) => setCompanyName(e.target.value)}
          />
          <s-text-field
            label="Contact email"
            value={contactEmail}
            onChange={(e: any) => setContactEmail(e.target.value)}
          />
        </s-stack>
      </s-section>

      <s-section heading="CSV">
        <s-paragraph>
          Columns: <code>sku,quantity</code> (required), <code>unit_price</code> (optional). SKUs are matched to product variants. Unmatched rows are added as custom lines so you can fix them.
        </s-paragraph>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} />
        <s-text-area
          label="CSV content"
          rows={10}
          value={csv}
          onChange={(e: any) => setCsv(e.target.value)}
        />
      </s-section>

      {fetcher.data?.error && (
        <s-section>
          <s-banner tone="critical">{fetcher.data.error}</s-banner>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
