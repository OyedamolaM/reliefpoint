// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ legacy: true, failure: false, calls: [] as unknown[][] }));
vi.mock("@/server/config", () => ({ configured: () => true }));
vi.mock("@/server/db", () => ({
  database: () => ({
    from: (table: string) => {
      let columns = "";
      const q: any = {
        returns: () => q,
        select: (value: string) => {
          columns = value;
          state.calls.push(["select", table, value]);
          return q;
        },
        eq: (...args: unknown[]) => {
          state.calls.push(["eq", ...args]);
          return q;
        },
        lte: (...args: unknown[]) => {
          state.calls.push(["lte", ...args]);
          return q;
        },
        gt: (...args: unknown[]) => {
          state.calls.push(["gt", ...args]);
          return q;
        },
        textSearch: (...args: unknown[]) => {
          state.calls.push(["search", ...args]);
          return q;
        },
        order: (...args: unknown[]) => {
          state.calls.push(["order", ...args]);
          return q;
        },
        range: async (...args: unknown[]) => {
          state.calls.push(["range", ...args]);
          if (state.failure)
            return { data: null, error: { code: "42501", message: "permission denied" } };
          if (state.legacy && columns.includes("regular_price_kobo"))
            return {
              data: null,
              error: { code: "42703", message: "column catalog.regular_price_kobo does not exist" },
            };
          return {
            data: [
              {
                id: "product",
                name: "Vitamin C",
                slug: "vitamin-c",
                category: "Vitamins",
                detail: "Pack",
                price_kobo: 150000,
                ...(!state.legacy ? { regular_price_kobo: 200000 } : {}),
                available: 2,
                active: true,
                image: "photo.webp",
                image_alt: "Vitamin pack",
                prescription: false,
                deal: false,
              },
            ],
            error: null,
          };
        },
      };
      return q;
    },
  }),
}));
import { catalog } from "@/server/content";
import { selectCatalog } from "@/server/catalog-query";
import { invalidatePublic } from "@/server/public-cache";
beforeEach(() => {
  state.legacy = true;
  state.failure = false;
  state.calls = [];
  invalidatePublic();
});
describe("catalog migration compatibility", () => {
  it("loads real products on the previous schema while preserving filters and pagination", async () => {
    const result = await catalog(
      new URLSearchParams("page=1&category=Vitamins&max=200000&stock=1&sort=price-low"),
    );
    expect(result.configured).toBe(true);
    expect(result.products[0]).toMatchObject({ id: "product", price: 1500, live: true });
    expect(result.products[0]).not.toHaveProperty("originalPrice");
    expect(state.calls.filter(([method]) => method === "select")).toHaveLength(2);
    expect(state.calls).toContainEqual(["range", 20, 40]);
    expect(state.calls.filter((call) => call[0] === "eq" && call[1] === "active")).toHaveLength(2);
    expect(state.calls.filter((call) => call[0] === "lte")).toEqual([
      ["lte", "price_kobo", 200000],
      ["lte", "price_kobo", 200000],
    ]);
    expect(state.calls.filter((call) => call[0] === "gt")).toHaveLength(2);
  });
  it("retains discounted prices without a retry when the migration is present", async () => {
    state.legacy = false;
    const result = await catalog();
    expect(result.products[0]).toMatchObject({ price: 1500, originalPrice: 2000 });
    expect(state.calls.filter(([method]) => method === "select")).toHaveLength(1);
  });
  it("keeps unrelated database failures visible instead of substituting presentation data", async () => {
    state.failure = true;
    await expect(catalog()).rejects.toMatchObject({ code: "DATA_UNAVAILABLE" });
    expect(state.calls.filter(([method]) => method === "select")).toHaveLength(1);
  });
  it("also handles a stale schema cache and preserves the requested cart projection", async () => {
    const read = vi.fn(async (columns: string) =>
      columns.includes("regular_price_kobo")
        ? {
            data: null,
            error: {
              code: "PGRST204",
              message: "Could not find regular_price_kobo in the schema cache",
            },
          }
        : { data: [{ id: "saved-product" }], error: null },
    );
    expect(await selectCatalog("id,name,regular_price_kobo,price_kobo", read)).toEqual([
      { id: "saved-product" },
    ]);
    expect(read).toHaveBeenLastCalledWith("id,name,price_kobo");
  });
});
