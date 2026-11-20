import { createFileRoute } from "@tanstack/react-router";
import { PharmacyStorefront } from "@/components/pharmacy-storefront";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: pageMeta(
      "Pharmacy Marketplace | ReliefPoint Pharmacy",
      "Explore everyday medicines, vitamins, skincare and medical devices at ReliefPoint Pharmacy Nigeria.",
      "/marketplace",
    ),
  }),
  component: MarketplacePage,
});
function MarketplacePage() {
  return <PharmacyStorefront design="marketplace" />;
}
