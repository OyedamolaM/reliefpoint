import { createFileRoute } from "@tanstack/react-router";
import { PharmacyStorefront } from "@/components/pharmacy-storefront";

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: [
      { title: "Pharmacy Marketplace | ReliefPoint Pharmacy" },
      {
        name: "description",
        content:
          "Explore ReliefPoint’s pharmacy marketplace: everyday medicines, vitamins, skincare, medical devices and Nigerian delivery estimates.",
      },
      { property: "og:title", content: "Pharmacy Marketplace | ReliefPoint Pharmacy" },
      {
        property: "og:description",
        content:
          "Everyday pharmacy essentials and daily health deals. Health essentials, all in one place.",
      },
    ],
  }),
  component: MarketplacePage,
});
function MarketplacePage() {
  return <PharmacyStorefront design="marketplace" />;
}
