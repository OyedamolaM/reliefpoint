import { createFileRoute } from "@tanstack/react-router";
import { PharmacyStorefront } from "@/components/pharmacy-storefront";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: pageMeta(
      "ReliefPoint Pharmacy | A little more care, every day",
      "Everyday wellness, personal care and pharmacy essentials in Nigeria. Discover ReliefPoint Pharmacy and chat with our pharmacy team.",
      "/",
    ),
  }),
  component: Storefront,
});
function Storefront() {
  return <PharmacyStorefront design="flagship" />;
}
