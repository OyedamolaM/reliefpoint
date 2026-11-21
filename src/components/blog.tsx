import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { BlogPost } from "@/lib/contracts";
import { api, notifyError } from "@/lib/api";
import { SiteShell } from "./site-shell";
import { Pagination, Retry } from "./account-page";
export function BlogCards({ posts }: { posts: Partial<BlogPost>[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <Link
          key={post.id}
          to="/health-tips/$slug"
          params={{ slug: post.slug! }}
          className="overflow-hidden rounded-2xl border bg-white"
        >
          <img
            src={post.cover}
            alt={post.cover_alt ?? ""}
            loading="lazy"
            width="800"
            height="450"
            className="aspect-video w-full object-cover"
          />
          <div className="p-5">
            <p className="text-xs font-semibold text-brand">{post.category}</p>
            <h2 className="mt-2 text-xl font-bold">{post.title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{post.summary}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
export function HealthTipsPage({ initial }: { initial: { posts: any[]; more: boolean } }) {
  const [page, setPage] = useState(0);
  const posts = useQuery({
    queryKey: ["posts", page],
    queryFn: () => api<typeof initial>(`posts?page=${page}`),
    initialData: page === 0 ? initial : undefined,
    staleTime: 300000,
  });
  return (
    <SiteShell>
      <p className="text-sm font-bold text-brand">FROM YOUR PHARMACY TEAM</p>
      <h1 className="my-4 text-4xl font-bold">Health Tips</h1>
      <p className="mb-8 max-w-xl text-muted-foreground">
        Practical advice for everyday health and wellbeing.
      </p>
      {posts.error && <Retry error={posts.error} retry={() => void posts.refetch()} />}
      <BlogCards posts={posts.data?.posts ?? []} />
      {posts.data?.posts.length === 0 && <p>Our health articles will appear here.</p>}
      <Pagination page={page} more={posts.data?.more ?? false} onChange={setPage} />
    </SiteShell>
  );
}
export function Article({ post }: { post: BlogPost }) {
  return (
    <article className="mx-auto max-w-3xl">
      <p className="text-sm font-bold text-brand">{post.category}</p>
      <h1 className="my-4 text-4xl font-bold leading-tight">{post.title}</h1>
      <p className="text-lg leading-8 text-muted-foreground">{post.summary}</p>
      <p className="my-5 text-sm">
        By {post.author_name}
        {post.published_at
          ? ` · ${new Date(post.published_at).toLocaleDateString("en-NG")}`
          : " · Draft"}
        {post.reviewer_name ? ` · Reviewed by ${post.reviewer_name}` : ""}
      </p>
      <img
        src={post.cover}
        alt={post.cover_alt}
        width="1400"
        height="788"
        className="mb-8 aspect-video w-full rounded-2xl object-cover"
      />
      <div className="space-y-6">
        {post.blocks.map((block, index) =>
          block.type === "heading" ? (
            <h2 key={index} className="pt-3 text-2xl font-bold">
              {block.text}
            </h2>
          ) : block.type === "paragraph" ? (
            <p key={index} className="whitespace-pre-wrap leading-8">
              {block.text}
            </p>
          ) : (
            <figure key={index}>
              <img
                src={block.src}
                alt={block.alt}
                loading="lazy"
                width="800"
                height="600"
                className="w-full rounded-xl object-contain"
              />
              <figcaption className="mt-2 text-sm text-muted-foreground">{block.alt}</figcaption>
            </figure>
          ),
        )}
      </div>
      {post.instagram && (
        <a
          className="mt-8 inline-flex rounded-lg bg-brand px-5 py-3 font-semibold text-white"
          href={post.instagram}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on Instagram ↗
        </a>
      )}
      <p className="mt-10 border-t pt-5 text-sm text-muted-foreground">
        General health information. Ask your pharmacist for advice about your individual care.
      </p>
    </article>
  );
}
export function BlogPreview({ id }: { id: string }) {
  const result = useQuery({
    queryKey: ["private", "post-preview", id],
    queryFn: () => api<{ post: BlogPost }>(`admin/post-preview?id=${id}`),
    retry: false,
  });
  useEffect(() => {
    if (result.error) notifyError(result.error);
  }, [result.error]);
  return (
    <SiteShell>
      <p className="mb-6 rounded-lg bg-secondary p-3 font-semibold">Staff preview</p>
      {result.error ? (
        <Retry error={result.error} retry={() => void result.refetch()} />
      ) : result.data ? (
        <Article post={result.data.post} />
      ) : (
        <p>Loading preview…</p>
      )}
    </SiteShell>
  );
}
export function HealthTipsSection() {
  const posts = useQuery({
    queryKey: ["posts", 0],
    queryFn: () => api<{ posts: any[] }>("posts"),
    staleTime: 300000,
    retry: false,
  });
  if (!posts.data?.posts.length)
    return (
      <section className="retail-container py-10">
        <Link to="/health-tips" className="text-2xl font-bold">
          Health Tips →
        </Link>
      </section>
    );
  return (
    <section className="retail-container py-10">
      <div className="mb-6 flex justify-between">
        <h2 className="text-2xl font-bold">Health Tips</h2>
        <Link to="/health-tips" className="underline">
          Read all
        </Link>
      </div>
      <BlogCards posts={posts.data.posts.slice(0, 3)} />
    </section>
  );
}
