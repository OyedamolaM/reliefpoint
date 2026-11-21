import { createFileRoute } from "@tanstack/react-router";
import { BusinessPage } from "@/components/business-page";
import { loadContent } from "@/lib/public-data";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/refund-policy")({
  loader: () => loadContent({ data: { kind: "settings" } }),
  head: () => ({
    meta: pageMeta(
      "Refund policy | ReliefPoint Pharmacy",
      "Refund policy at Relief Point Pharmacy.",
      "/refund-policy",
    ),
  }),
  component: Page,
});
function Page() {
  const data = Route.useLoaderData();
  return <BusinessPage kind="refund-policy" settings={data.settings ?? {}} />;
}
