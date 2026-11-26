import { z } from "zod";
import { configured } from "./config";
import { database } from "./db";
import { AppError, checkDb, requireDb } from "./errors";
import { products as previewProducts, type Product } from "@/lib/commerce";
import { slugify } from "@/lib/contracts";
import { cachedPublic } from "./public-cache";
import { selectCatalog } from "./catalog-query";

export type CatalogRow = {
  id: string;
  slug: string;
  name: string;
  detail: string;
  category: string;
  price_kobo: number;
  regular_price_kobo?: number;
  image: string;
  image_alt: string;
  directions?: string;
  storage?: string;
  available: number;
  prescription: boolean;
  deal: boolean;
};
export function toProduct(row: CatalogRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    detail: row.detail,
    category: row.category,
    price: Number(row.price_kobo) / 100,
    ...(Number(row.regular_price_kobo) > Number(row.price_kobo)
      ? { originalPrice: Number(row.regular_price_kobo) / 100 }
      : {}),
    image: row.image,
    imageAlt: row.image_alt,
    ...(row.directions ? { directions: row.directions } : {}),
    ...(row.storage ? { storage: row.storage } : {}),
    inStock: Number(row.available) > 0,
    prescription: row.prescription,
    deal: row.deal,
    live: true,
  };
}
export const catalog = (params = new URLSearchParams()) =>
  cachedPublic(`catalog:${params.toString()}`, () => readCatalog(params));
async function readCatalog(params: URLSearchParams) {
  if (!configured())
    return {
      products: previewProducts.map((p) => ({ ...p, slug: slugify(p.name) })),
      configured: false,
      page: 0,
      more: false,
    };
  const page = Math.max(0, Math.min(10000, Number(params.get("page")) || 0));
  const sort = params.get("sort");
  const search = params.get("q")?.trim().slice(0, 100);
  if (search) {
    const rows = requireDb(
      await database().rpc("search_catalog", {
        p_query: search,
        p_category: params.get("category") || "All",
        p_max: params.get("max")
          ? z.coerce.number().min(0).max(100000000).parse(params.get("max"))
          : null,
        p_stock: params.get("stock") === "1",
        p_deals: params.get("deals") === "1",
        p_sort: sort || "featured",
        p_page: page,
      }),
    ) as CatalogRow[];
    return {
      products: rows.slice(0, 20).map(toProduct),
      configured: true,
      page,
      more: rows.length > 20,
    };
  }
  const rows = await selectCatalog(
    "id,name,slug,detail,category,price_kobo,regular_price_kobo,image,image_alt,prescription,deal,available",
    async (columns) => {
      let query = database().from("catalog").select(columns).eq("active", true);
      const search = params.get("q")?.trim().slice(0, 100);
      if (search) query = query.textSearch("fts", search, { type: "websearch", config: "simple" });
      if (params.get("category") && params.get("category") !== "All")
        query = query.eq("category", params.get("category")!);
      if (params.get("max"))
        query = query.lte(
          "price_kobo",
          z.coerce.number().min(0).max(100000000).parse(params.get("max")),
        );
      if (params.get("stock") === "1") query = query.gt("available", 0);
      if (params.get("deals") === "1") query = query.eq("deal", true);
      query =
        sort === "name"
          ? query.order("name")
          : sort?.startsWith("price")
            ? query.order("price_kobo", { ascending: sort === "price-low" })
            : query.order("deal", { ascending: false });
      return await query
        .returns<CatalogRow[]>()
        .order("id")
        .range(page * 20, page * 20 + 20);
    },
  );
  return {
    products: rows.slice(0, 20).map(toProduct),
    configured: true,
    page,
    more: rows.length > 20,
  };
}
export const publicContent = (kind: string, slug?: string, category = "") =>
  cachedPublic(`content:${kind}:${slug ?? ""}:${category}`, () =>
    readContent(kind, slug, category),
  );
async function readContent(kind: string, slug?: string, category = "") {
  if (!configured())
    return kind === "posts"
      ? { posts: [], more: false }
      : kind === "settings"
        ? { settings: {} }
        : kind === "categories"
          ? { categories: [] }
          : kind === "zones"
            ? { zones: [] }
            : {
                item:
                  kind === "product"
                    ? (previewProducts
                        .map((p) => ({ ...p, slug: slugify(p.name) }))
                        .find((p) => p.slug === slug) ?? null)
                    : null,
                redirect: null,
              };
  const db = database();
  if (kind === "categories")
    return {
      categories: requireDb(
        await db.from("categories").select("name").order("name").limit(100),
      ).map((c) => c.name as string),
    };
  if (kind === "settings")
    return {
      settings: requireDb(await db.from("settings").select("public_data").eq("id", true).single())
        .public_data,
    };
  if (kind === "zones")
    return {
      zones: requireDb(
        await db
          .from("shipping_zones")
          .select("id,state,lga,area,fee_kobo,free_over_kobo,estimate,active,fulfillment_method")
          .eq("active", true)
          .order("state")
          .limit(500),
      ),
    };
  if (kind === "posts") {
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(slug ?? 0);
    let postQuery = db
      .from("blog_posts")
      .select("id,title,slug,summary,category,cover,cover_alt,author_name,published_at,updated_at");
    const categories = requireDb(
      await db.from("blog_posts").select("category").eq("status", "published").order("category"),
    );
    const categoryNames = [
      ...new Set(categories.map((row) => String(row.category)).filter(Boolean)),
    ];
    if (category) postQuery = postQuery.eq("category", category.slice(0, 100));
    const rows = requireDb(
      await postQuery
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .order("id")
        .range(page * 12, page * 12 + 12),
    );
    return { posts: rows.slice(0, 12), more: rows.length > 12, categories: categoryNames };
  }
  if (!slug || slug.length > 200)
    throw new AppError("NOT_FOUND", "This page couldn’t be found.", 404);
  const table = kind === "product" ? "catalog" : "blog_posts";
  let query = db.from(table).select("*").eq("slug", slug);
  query = kind === "product" ? query.eq("active", true) : query.eq("status", "published");
  const item = checkDb(await query.maybeSingle());
  if (item) return { item: kind === "product" ? toProduct(item) : item, redirect: null };
  const old = checkDb(
    await db
      .from("slug_redirects")
      .select("target_id")
      .eq("kind", kind === "product" ? "product" : "post")
      .eq("slug", slug)
      .maybeSingle(),
  );
  let redirect: string | null = null;
  if (old) {
    let targetQuery = db.from(table).select("slug").eq("id", old.target_id);
    targetQuery =
      kind === "product" ? targetQuery.eq("active", true) : targetQuery.eq("status", "published");
    redirect = checkDb(await targetQuery.maybeSingle())?.slug ?? null;
  }
  if (!item && kind === "product" && !configured())
    return { item: previewProducts.find((p) => slugify(p.name) === slug), redirect: null };
  return { item: null, redirect };
}
