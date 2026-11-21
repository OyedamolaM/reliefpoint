import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { Article } from "@/components/blog";
import { SiteShell } from "@/components/site-shell";
import { loadContent } from "@/lib/public-data";
import { pageMeta } from "@/lib/seo";
import type { BlogPost } from "@/lib/contracts";
export const Route = createFileRoute("/health-tips/$slug")({
  loader: async ({ params }) => {
    const result = await loadContent({ data: { kind: "post", slug: params.slug } });
    if (result.redirect)
      throw redirect({
        to: "/health-tips/$slug",
        params: { slug: result.redirect },
        statusCode: 301,
      });
    if (!result.item) throw notFound();
    return result.item as BlogPost;
  },
  head: ({ loaderData }) => ({
    meta: pageMeta(
      `${loaderData?.title ?? "Health Tips"} | ReliefPoint Pharmacy`,
      loaderData?.summary ?? "Health advice from your pharmacy.",
      `/health-tips/${loaderData?.slug ?? ""}`,
      loaderData?.cover,
    ),
  }),
  component: Page,
});
function Page() {
  return (
    <SiteShell>
      <Article post={Route.useLoaderData()} />
    </SiteShell>
  );
}
