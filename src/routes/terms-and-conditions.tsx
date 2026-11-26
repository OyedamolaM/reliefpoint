import { createFileRoute } from "@tanstack/react-router";
import { BusinessPage } from "@/components/business-page";
import { loadContent } from "@/lib/public-data";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/terms-and-conditions")({
  loader: () => loadContent({ data: { kind: "settings" } }),
  head: () => ({
    meta: pageMeta(
      "Terms and Conditions | ReliefPoint Pharmacy",
      "Account and purchase terms for Relief Point Pharmacy.",
      "/terms-and-conditions",
    ),
  }),
  component: Page,
});
function Page() {
  const data = Route.useLoaderData();
  return <BusinessPage kind="terms-and-conditions" settings={data.settings ?? {}} />;
}
