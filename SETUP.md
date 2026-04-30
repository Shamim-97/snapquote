# ShopIng Quote Pro — Local Setup

B2B Quote-to-Cash Shopify app. Sales reps build line-item quotes with
custom pricing, share a public link, buyer accepts → draft order is
created in Shopify with locked prices. Includes CSV/PO import.

## Prerequisites

- Node.js 22.12+ (you have v24.7 — fine)
- npm 10+
- A Shopify Partner account: https://partners.shopify.com
- A development store (create one inside Partners dashboard)

## First-time setup

```bash
cd shoping-quote-pro
npm install                       # already done
npx prisma migrate dev --name init   # already done; SQLite at prisma/dev.sqlite
```

## Run dev server

```bash
npm run dev
```

This calls `shopify app dev`. It will:

1. Prompt you to log into Partners on first run.
2. Ask which org to use, then create a new app named `shoping-quote-pro`
   in your Partner dashboard (or link to an existing one).
3. Inject `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL` env
   vars + start a Cloudflare tunnel.
4. Print an install URL — open it to install the app on your dev store.

The CLI prompts are interactive, so run `npm run dev` in your own
terminal (not inside Claude Code).

## Project structure

```
app/
  routes/
    app._index.tsx           Dashboard (stats + recent quotes)
    app.quotes._index.tsx    Quote list
    app.quotes.new.tsx       Quote builder (search variants, add lines, set prices)
    app.quotes.$id.tsx       Quote detail + send/accept/reject actions
    app.import.tsx           CSV → Quote importer
    quotes.$token.tsx        PUBLIC buyer-facing quote view + accept
    quotes.$token[.pdf].tsx  PUBLIC PDF download of a quote
  lib/
    quotes.server.ts         DB helpers (create/list/get/markSent etc.)
    shopify-admin.server.ts  GraphQL helpers (variants, companies, draftOrderCreate)
prisma/schema.prisma         Quote, QuoteItem, QuoteVersion, QuoteEvent, ShopCounter
shopify.app.toml             Scopes + webhooks
```

## Scopes requested

- `read_products` — search variants for the quote builder
- `read_customers,write_customers`
- `read_companies,write_companies` — Shopify B2B objects
- `read_draft_orders,write_draft_orders` — convert accepted quote → draft order
- `read_orders,write_orders`
- `read_price_rules,write_price_rules`

## Key flows

### Sales rep builds a quote
`/app/quotes/new` → search variants → add lines → set custom unit prices → save.

### Send to buyer
Open the quote, copy the public URL `/quotes/<token>`, email it. The PDF download
button links to `/quotes/<token>.pdf`.

### Buyer accepts
Public page has Accept / Reject buttons. Accept calls `draftOrderCreate` against
the merchant's shop using `unauthenticated.admin(shop)` (offline token from
session storage), creates a draft order with the locked line prices, returns the
invoice URL.

### Bulk PO import
`/app/import` — paste CSV `sku,quantity,unit_price` (or upload file). SKUs match
to variants, unmatched rows become editable custom lines.

## Roadmap (post-MVP)

- Email send for the public quote link (Resend / SendGrid)
- Deposit collection on accept (Stripe-checkout link or Shopify deposit)
- Quote version history UI
- Approval workflow (manager signs off above $X)
- Theme app extension: storefront "Request quote" button on PDP for B2B customers
- Shopify Functions for line-discount enforcement + cart-transform
- Webhooks: order/created when draft is paid → mark quote "fulfilled"
- Multi-currency price book per company
- Quote → Recurring order (subscription) conversion

## Pricing plan (planned for App Store listing)

- Starter $39/mo — up to 50 quotes/mo, 1 user
- Growth $99/mo — unlimited quotes, 5 users, CSV import, custom branding on PDF
- Scale $249/mo — unlimited users, approval workflow, deposit collection,
  priority support
