// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalUrl, pageMeta } from "@/lib/seo";
const mock = vi.hoisted(() => ({ configured: true, fail: false, calls: [] as unknown[][] }));
vi.mock("@/server/config", () => ({ configured: () => mock.configured }));
vi.mock("@/server/db", () => ({
  database: () => ({
    from: (table: string) => ({
      select: (_columns: string, options?: { head?: boolean }) => ({
        eq: (field: string, value: unknown) => {
          mock.calls.push([table, field, value]);
          if (options?.head)
            return {
              count: table === "products" ? 1001 : 1,
              error: mock.fail ? {} : null,
              data: null,
            };
          return {
            order: () => ({
              range: (start: number, end: number) => {
                mock.calls.push([start, end]);
                return {
                  data: [{ slug: "care&wellness", updated_at: "2026-11-23T00:00:00Z" }],
                  error: mock.fail ? {} : null,
                };
              },
            }),
          };
        },
      }),
    }),
  }),
}));
import { sitemap } from "@/server/sitemap";
import { invalidatePublic } from "@/server/public-cache";
const request = (query = "") => new Request(`https://preview.example/sitemap.xml${query}`);
beforeEach(() => {
  mock.configured = true;
  mock.fail = false;
  mock.calls = [];
  invalidatePublic();
});
describe("search discovery", () => {
  it("uses the canonical host and removes tracking parameters", () => {
    expect(canonicalUrl("/health-tips/?utm_source=x")).toBe(
      "https://www.reliefpointpharmacy.com/health-tips",
    );
    expect(pageMeta("Care", "Health", "/about")).toContainEqual({
      property: "og:url",
      content: "https://www.reliefpointpharmacy.com/about",
    });
  });
  it("partitions listings and escapes XML query separators", async () => {
    const body = await (await sitemap(request())).text();
    expect(body).toContain("section=products&amp;page=2");
    expect(body).toContain("section=posts&amp;page=1");
    expect(body).not.toContain("preview.example");
    expect(mock.calls).toContainEqual(["products", "active", true]);
    expect(mock.calls).toContainEqual(["blog_posts", "status", "published"]);
  });
  it("does not list private pages", async () => {
    const body = await (await sitemap(request("?section=pages"))).text();
    expect(body).toContain("/health-tips</loc>");
    expect(body).not.toMatch(/\/admin|\/account|\/orders|\/preview|\/api\//);
    expect(mock.calls).toHaveLength(0);
  });
  it("reads only one bounded page and caches repeated requests", async () => {
    const url = request("?section=products&page=2");
    const body = await (await sitemap(url)).text();
    await sitemap(url);
    expect(mock.calls.filter((x) => x[0] === "products")).toHaveLength(1);
    expect(mock.calls).toContainEqual([1000, 1999]);
    expect(body).toContain("care%26wellness");
    expect(body).toContain("<lastmod>2026-11-23T00:00:00.000Z</lastmod>");
  });
  it("never advertises preview products when services are absent", async () => {
    mock.configured = false;
    const body = await (await sitemap(request("?section=products"))).text();
    expect(body).not.toContain("<url>");
    expect(mock.calls).toHaveLength(0);
  });
  it("does not cache a database outage as an empty sitemap", async () => {
    mock.fail = true;
    const response = await sitemap(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    mock.fail = false;
    expect((await sitemap(request())).status).toBe(200);
  });
  it.each(["?section=admin", "?section=products&page=-1", "?page=2", "?section=posts&page=1.5"])(
    "rejects invalid sitemap requests %s",
    async (query) => {
      expect((await sitemap(request(query))).status).toBe(404);
      expect(mock.calls).toHaveLength(0);
    },
  );
});
