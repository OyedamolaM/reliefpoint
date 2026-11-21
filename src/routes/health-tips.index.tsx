import { createFileRoute } from "@tanstack/react-router";
import { HealthTipsPage } from "@/components/blog";
import { loadContent } from "@/lib/public-data";
import { pageMeta } from "@/lib/seo";
export const Route = createFileRoute("/health-tips/")({
  loader: () => loadContent({ data: { kind: "posts" } }),
  head: () => ({
    meta: pageMeta(
      "Health Tips | ReliefPoint Pharmacy",
      "Practical health and wellness advice from ReliefPoint Pharmacy.",
      "/health-tips",
    ),
  }),
  component: Page,
});
function Page() {
  const data = Route.useLoaderData();
  return <HealthTipsPage initial={{ posts: data.posts ?? [], more: data.more ?? false }} />;
}
