import { createFileRoute } from "@tanstack/react-router";
import { BusinessPage } from "@/components/business-page";
import { loadContent } from "@/lib/public-data";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/about")({
  loader: () => loadContent({ data: { kind: "settings" } }),
  head: () => ({
    meta: pageMeta(
      "About us | ReliefPoint Pharmacy",
      "About us at Relief Point Pharmacy.",
      "/about",
    ),
  }),
  component: Page,
});
function Page() {
  const data = Route.useLoaderData();
  return <BusinessPage kind="about" settings={data.settings ?? {}} />;
}
