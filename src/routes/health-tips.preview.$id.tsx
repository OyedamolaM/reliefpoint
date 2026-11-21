import { createFileRoute } from "@tanstack/react-router";
import { BlogPreview } from "@/components/blog";
export const Route = createFileRoute("/health-tips/preview/$id")({
  head: () => ({
    meta: [
      { title: "Article preview | ReliefPoint Pharmacy" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Page,
});
function Page() {
  return <BlogPreview id={Route.useParams().id} />;
}
