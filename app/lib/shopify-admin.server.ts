import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

type AdminClient = AdminApiContext;

export type Company = {
  id: string;
  name: string;
  mainContact?: {
    customer?: {
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    } | null;
  } | null;
};

export type ProductVariantSearchResult = {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  image: string | null;
  productId: string;
  productTitle: string;
};

export async function searchCompanies(
  admin: AdminClient,
  query: string,
): Promise<Company[]> {
  const resp = await admin.graphql(
    `#graphql
    query searchCompanies($query: String!) {
      companies(first: 20, query: $query) {
        edges {
          node {
            id
            name
            mainContact {
              customer { email firstName lastName }
            }
          }
        }
      }
    }`,
    { variables: { query } },
  );
  const json = (await resp.json()) as {
    data?: { companies?: { edges?: Array<{ node: Company }> } };
    errors?: unknown;
  };
  if (!json.data?.companies) return [];
  return json.data.companies.edges?.map((e) => e.node) ?? [];
}

export async function searchVariants(
  admin: AdminClient,
  query: string,
): Promise<ProductVariantSearchResult[]> {
  const resp = await admin.graphql(
    `#graphql
    query searchVariants($query: String!) {
      productVariants(first: 25, query: $query) {
        edges {
          node {
            id
            title
            sku
            price
            image { url }
            product { id title }
          }
        }
      }
    }`,
    { variables: { query } },
  );
  const json = (await resp.json()) as {
    data?: {
      productVariants?: {
        edges?: Array<{
          node: {
            id: string;
            title: string;
            sku: string | null;
            price: string;
            image: { url: string } | null;
            product: { id: string; title: string };
          };
        }>;
      };
    };
  };
  return (
    json.data?.productVariants?.edges?.map((e) => ({
      id: e.node.id,
      title: e.node.title,
      sku: e.node.sku,
      price: e.node.price,
      image: e.node.image?.url ?? null,
      productId: e.node.product.id,
      productTitle: e.node.product.title,
    })) ?? []
  );
}

export type DraftOrderLine = {
  variantId?: string | null;
  title: string;
  quantity: number;
  unitPrice: number;
};

export async function createDraftOrderFromQuote(
  admin: AdminClient,
  params: {
    email?: string | null;
    note?: string | null;
    currency?: string;
    lines: DraftOrderLine[];
    quoteNumber: number;
  },
): Promise<{ id: string; name: string; invoiceUrl: string | null }> {
  const lineItems = params.lines.map((l) =>
    l.variantId
      ? {
          variantId: l.variantId,
          quantity: l.quantity,
          originalUnitPrice: l.unitPrice.toFixed(2),
        }
      : {
          title: l.title,
          quantity: l.quantity,
          originalUnitPrice: l.unitPrice.toFixed(2),
          requiresShipping: true,
          taxable: true,
        },
  );

  const resp = await admin.graphql(
    `#graphql
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name invoiceUrl }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          email: params.email ?? undefined,
          note: params.note ?? `Created from Quote #${params.quoteNumber}`,
          tags: ["quote", `quote-${params.quoteNumber}`],
          lineItems,
          presentmentCurrencyCode: params.currency ?? undefined,
          useCustomerDefaultAddress: true,
        },
      },
    },
  );
  const json = (await resp.json()) as {
    data?: {
      draftOrderCreate?: {
        draftOrder?: { id: string; name: string; invoiceUrl: string | null };
        userErrors?: Array<{ field?: string[]; message: string }>;
      };
    };
  };
  const errors = json.data?.draftOrderCreate?.userErrors;
  if (errors && errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
  const draft = json.data?.draftOrderCreate?.draftOrder;
  if (!draft) throw new Error("draftOrderCreate returned no draftOrder");
  return draft;
}
