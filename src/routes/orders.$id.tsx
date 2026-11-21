import { createFileRoute } from "@tanstack/react-router";
import { OrderPage } from "@/components/order-page";
export const Route = createFileRoute("/orders/$id")({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search["token"] === "string" ? { token: search["token"] } : {},
  head: () => ({
    meta: [
      { title: "Your order | ReliefPoint Pharmacy" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Page,
});
function Page() {
  const token = Route.useSearch().token;
  return <OrderPage id={Route.useParams().id} {...(token ? { token } : {})} />;
}
