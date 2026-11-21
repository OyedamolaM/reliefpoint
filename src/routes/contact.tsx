import { createFileRoute } from "@tanstack/react-router";
import { BusinessPage } from "@/components/business-page";
import { loadContent } from "@/lib/public-data";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/contact")({
  loader: () => loadContent({ data: { kind: "settings" } }),
  head: () => ({
    meta: pageMeta(
      "Contact us | ReliefPoint Pharmacy",
      "Contact us at Relief Point Pharmacy.",
      "/contact",
    ),
  }),
  component: Page,
});
function Page() {
  const data = Route.useLoaderData();
  return <BusinessPage kind="contact" settings={data.settings ?? {}} />;
}
