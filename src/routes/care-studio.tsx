import { createFileRoute } from "@tanstack/react-router";
import { PharmacyStorefront } from "@/components/pharmacy-storefront";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/care-studio")({
  head: () => ({
    meta: pageMeta(
      "Pharmacy Care Studio | ReliefPoint Pharmacy",
      "A calmer space for wellbeing. Discover wellness essentials, skincare and pharmacist support from ReliefPoint Pharmacy.",
      "/care-studio",
    ),
  }),
  component: CareStudioPage,
});
function CareStudioPage() {
  return <PharmacyStorefront design="studio" />;
}
