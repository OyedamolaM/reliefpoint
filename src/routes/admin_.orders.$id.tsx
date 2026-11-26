import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/admin-page";

export const Route = createFileRoute("/admin_/orders/$id")({
  head: () => ({
    meta: [
      { title: "Order details | ReliefPoint administration" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: Page,
});
function Page() {
  return <AdminPage selectedOrderId={Route.useParams().id} />;
}
