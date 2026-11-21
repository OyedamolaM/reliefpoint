import { createFileRoute } from "@tanstack/react-router";
import { BusinessPage } from "@/components/business-page";
import { loadContent } from "@/lib/public-data";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/privacy-policy")({
  loader: () => loadContent({ data: { kind: "settings" } }),
  head: () => ({
    meta: pageMeta(
      "Privacy policy | ReliefPoint Pharmacy",
      "Privacy policy at Relief Point Pharmacy.",
      "/privacy-policy",
    ),
  }),
  component: Page,
});
function Page() {
  const data = Route.useLoaderData();
  return <BusinessPage kind="privacy-policy" settings={data.settings ?? {}} />;
}
