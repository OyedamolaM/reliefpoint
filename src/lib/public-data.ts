import { createServerFn } from "@tanstack/react-start";
export const loadCatalog = createServerFn({ method: "GET" }).handler(async () =>
  (await import("@/server/content")).catalog(),
);
export const loadStorefront = createServerFn({ method: "GET" }).handler(async () => {
  const content = await import("@/server/content");
  const [catalog, business, departments] = await Promise.all([
    content.catalog(),
    content.publicContent("settings"),
    content.publicContent("categories"),
  ]);
  return {
    ...catalog,
    settings: business.settings ?? {},
    categories: departments.categories ?? [],
  };
});
export const loadContent = createServerFn({ method: "GET" })
  .validator((input: { kind: string; slug?: string }) => input)
  .handler(async ({ data }) =>
    (await import("@/server/content")).publicContent(data.kind, data.slug),
  );
