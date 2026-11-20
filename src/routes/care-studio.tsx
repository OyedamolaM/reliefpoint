import { createFileRoute } from "@tanstack/react-router";
import { PharmacyStorefront } from "@/components/pharmacy-storefront";

export const Route = createFileRoute("/care-studio")({
  head: () => ({
    meta: [
      { title: "Pharmacy Care Studio | ReliefPoint Pharmacy" },
      {
        name: "description",
        content:
          "A calmer space for everyday wellbeing. Explore ReliefPoint’s wellness edit, skincare, home health and pharmacist care.",
      },
      { property: "og:title", content: "Pharmacy Care Studio | ReliefPoint Pharmacy" },
      {
        property: "og:description",
        content: "Thoughtful rituals, everyday essentials and human care. Find your kind of care.",
      },
    ],
  }),
  component: CareStudioPage,
});
function CareStudioPage() {
  return <PharmacyStorefront design="studio" />;
}
