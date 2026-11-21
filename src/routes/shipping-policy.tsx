import { createFileRoute } from "@tanstack/react-router";
import { BusinessPage } from "@/components/business-page";
import { loadContent } from "@/lib/public-data";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/shipping-policy")({
  loader: () => loadContent({ data: { kind: "settings" } }),
  head: () => ({
    meta: pageMeta(
      "Shipping policy | ReliefPoint Pharmacy",
      "Shipping policy at Relief Point Pharmacy.",
      "/shipping-policy",
    ),
  }),
  component: Page,
});
function Page() {
  const data = Route.useLoaderData();
  return <BusinessPage kind="shipping-policy" settings={data.settings ?? {}} />;
}
