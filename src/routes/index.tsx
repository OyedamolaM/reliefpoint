import { createFileRoute } from "@tanstack/react-router";
import { PharmacyStorefront } from "@/components/pharmacy-storefront";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ReliefPoint Pharmacy | A little more care, every day" },
      {
        name: "description",
        content:
          "Explore everyday wellness, personal care and pharmacy essentials at ReliefPoint Pharmacy Nigeria. Shop everyday essentials and chat with our pharmacy team.",
      },
      { property: "og:title", content: "ReliefPoint Pharmacy | A little more care, every day" },
      {
        property: "og:description",
        content:
          "Discover thoughtful wellness picks and everyday pharmacy essentials. Personal care, delivered closer to you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Storefront,
});
function Storefront() {
  return <PharmacyStorefront design="flagship" />;
}
