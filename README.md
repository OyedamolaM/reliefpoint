# ReliefPoint Pharmacy

A standalone pharmacy and wellness storefront built with TanStack Start, React,
TypeScript and Tailwind CSS v4.

Repository: https://github.com/OyedamolaM/reliefpoint

## Develop locally

Install Node.js 22.12+ (Node.js 24 LTS recommended) and Bun, then run:

```sh
git clone https://github.com/OyedamolaM/reliefpoint.git
cd reliefpoint
bun install --frozen-lockfile
bun run dev
```

## Validate and build

```sh
bun run test
bunx tsc --noEmit
bun run build
```

## Run the production server

```sh
bun run start
```

The build outputs a standard Node.js server at `.output/server/index.mjs` and
static assets in `.output/public`. Run the project on a Node.js host or in a
container. The server accepts `PORT` and `HOST` environment variables. No editor
platform or proprietary build service is required.

## Frontend features

- Retail storefront with ReliefPoint forest green and electric lime branding.
- Search suggestions, category and price filtering, sorting, mobile filter modal.
- Wishlist, persistent basket, quantity controls and guest checkout.
- Nigerian delivery estimates across all 36 states and the FCT.
- Prescription file selection and payment-method review.
- Sign-in, registration, password-reset and session shopping-profile screens.
- Explicit WhatsApp handoffs for products, prescriptions, services and enquiries.

The existing `/`, `/marketplace` and `/care-studio` routes are available. Product
visuals are neutral illustrations pending approved packshots.

## Integration status

This is a frontend-only project. No customer database, authentication service,
payment gateway, prescription storage or order service is connected. Checkout
does not charge, submit orders or award points. Account screens do not create
accounts, send reset emails or authenticate customers. Optional shopping profiles
last for the current visit only.

Only catalog IDs, quantities and wishlist IDs are saved locally. Contact fields
and selected prescription files stay in memory and clear when checkout closes.
Passwords are not persisted or submitted. Files are not attached to WhatsApp
automatically. Stock, product prices and delivery fees are presentation data.

Delivery estimates are NGN 2,500 for Lagos Island zones, NGN 2,000 for other Lagos
areas, and NGN 4,500 for other states. Baskets over NGN 30,000 qualify for free
delivery. Final availability, pricing and delivery must be confirmed before
fulfillment.

Keep secrets in the deployment host's environment settings, never in source
control or browser bundles. Production services can be added when requested.
