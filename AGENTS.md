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

- The owner has requested Supabase Auth/Postgres/Storage, Paystack and Brevo integrations.
- Backend code lives on `feat/reliefpoint-backend`; do not push or deploy without a separate instruction.
- Keep catalog and cart as presentation data; do not claim live inventory, completed
  payments, created orders, authenticated accounts or earned loyalty points without
  the corresponding services.
- Do not add repeated demo banners to the customer interface. Explain an unavailable
  service only at the point where it is needed.
- Configuration-dependent services must remain honest when credentials are absent.
- Follow `docs/BACKEND_SETUP.md` for migrations, permissions and production launch gates.
- Keep customer-facing errors concise and actionable, using the global toast provider.
- The business goal is to help customers in Nigeria access medicines and health
  products with convenient delivery.
