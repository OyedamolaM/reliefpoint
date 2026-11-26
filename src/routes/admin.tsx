import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/admin-page";
export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>): { section?: string } =>
    typeof search["section"] === "string" ? { section: search["section"] } : {},
  head: () => ({
    meta: [
      { title: "admin | ReliefPoint Pharmacy" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const { section } = Route.useSearch();
  return (
    <AdminPage key={section || "overview"} {...(section ? { initialSection: section } : {})} />
  );
}
