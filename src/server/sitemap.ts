import "@tanstack/react-start/server-only";
import { canonicalUrl } from "@/lib/seo";
import { configured } from "./config";
import { database } from "./db";
import { checkDb, requireDb } from "./errors";
import { cachedPublic } from "./public-cache";

const PAGE_SIZE = 1000;
const sections = ["products", "posts"] as const;
type Section = (typeof sections)[number];
const publicPaths = [
  "/",
  "/marketplace",
  "/care-studio",
  "/about",
  "/contact",
  "/privacy-policy",
  "/refund-policy",
  "/shipping-policy",
  "/health-tips",
];
const escapeXml = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!,
  );
const location = (url: string) => `<loc>${escapeXml(url)}</loc>`;
function xml(kind: "urlset" | "sitemapindex", entries: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${kind} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</${kind}>`;
}
function collection(section: Section) {
  return section === "products"
    ? database().from("products").select("slug,updated_at").eq("active", true)
    : database().from("blog_posts").select("slug,updated_at").eq("status", "published");
}
async function counts() {
  if (!configured()) return [0, 0];
  return Promise.all(
    sections.map(async (section) => {
      const result =
        section === "products"
          ? await database()
              .from("products")
              .select("id", { count: "exact", head: true })
              .eq("active", true)
          : await database()
              .from("blog_posts")
              .select("id", { count: "exact", head: true })
              .eq("status", "published");
      checkDb(result);
      if (result.count === null) throw new Error("Sitemap count unavailable");
      return result.count;
    }),
  );
}
export async function sitemap(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const section = params.get("section");
  const rawPage = params.get("page") ?? "1";
  const page = Number(rawPage);
  if (
    (section !== null && section !== "pages" && !sections.includes(section as Section)) ||
    !/^\d+$/.test(rawPage) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 50000 ||
    ((section === null || section === "pages") && page !== 1)
  ) {
    return new Response("Sitemap not found", { status: 404 });
  }
  try {
    const body = await cachedPublic(`sitemap:${section ?? "index"}:${page}`, async () => {
      if (section === null) {
        const totals = await counts();
        const urls = [`${canonicalUrl("/sitemap.xml")}?section=pages`];
        sections.forEach((kind, i) => {
          const pages = Math.ceil(totals[i]! / PAGE_SIZE);
          if (urls.length + pages > 50000) throw new Error("Sitemap index needs partitioning");
          for (let n = 1; n <= pages; n++)
            urls.push(`${canonicalUrl("/sitemap.xml")}?section=${kind}&page=${n}`);
        });
        return xml(
          "sitemapindex",
          urls.map((url) => `<sitemap>${location(url)}</sitemap>`),
        );
      }
      if (section === "pages")
        return xml(
          "urlset",
          publicPaths.map((path) => `<url>${location(canonicalUrl(path))}</url>`),
        );
      // Never advertise presentation products or unpublished posts.
      const rows = configured()
        ? requireDb(
            await collection(section as Section)
              .order("id")
              .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
          )
        : [];
      return xml(
        "urlset",
        rows.map((row) => {
          const path = `/${section === "products" ? "products" : "health-tips"}/${encodeURIComponent(row.slug)}`;
          const modified = Date.parse(row.updated_at);
          return `<url>${location(canonicalUrl(path))}${Number.isFinite(modified) ? `<lastmod>${new Date(modified).toISOString()}</lastmod>` : ""}</url>`;
        }),
      );
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=300",
      },
    });
  } catch {
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "60" },
    });
  }
}
