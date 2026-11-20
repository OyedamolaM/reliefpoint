# ReliefPoint Pharmacy

This is a standalone TanStack Start application maintained in
https://github.com/OyedamolaM/reliefpoint.git.

## Repository conventions

- Use TanStack file routes in `src/routes/` and Tailwind CSS v4.
- Do not edit automatically generated files by hand. Let their generators update them.
- Preserve published Git history; do not force push, amend, rebase or squash pushed commits.
- Keep secret values out of source control and browser bundles.
- Build with `bun run build`, check types with `bunx tsc --noEmit`, and run `bun run test`.

## Architecture decisions

- The storefront is frontend-only until the owner requests backend integrations.
- Keep catalog and cart as presentation data; do not claim live inventory, completed
  payments, created orders, authenticated accounts or earned loyalty points without
  the corresponding services.
- Do not add repeated demo banners to the customer interface. Explain an unavailable
  service only at the point where it is needed.
- Customer accounts, payments and prescription uploads are not connected. Do not
  connect them without the owner's request.
- The business goal is to help customers in Nigeria access medicines and health
  products with convenient delivery.
