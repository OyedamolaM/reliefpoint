import { createFileRoute, notFound, redirect, Link } from "@tanstack/react-router";
import { loadContent } from "@/lib/public-data";
import { pageMeta } from "@/lib/seo";
import { SiteShell } from "@/components/site-shell";
import { ProductVisual } from "@/components/product-visual";
import { useCommerce } from "@/components/commerce-provider";
import { formatNaira, whatsapp, type Product } from "@/lib/commerce";
export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params }) => {
    const result = await loadContent({ data: { kind: "product", slug: params.slug } });
    if (result.redirect)
      throw redirect({ to: "/products/$slug", params: { slug: result.redirect }, statusCode: 301 });
    if (!result.item) throw notFound();
    return result.item as Product;
  },
  head: ({ loaderData }) => ({
    meta: pageMeta(
      `${loaderData?.name ?? "Product"} | ReliefPoint Pharmacy`,
      loaderData?.detail ?? "Pharmacy essentials.",
      `/products/${loaderData?.slug ?? ""}`,
      loaderData?.image,
    ),
  }),
  component: Page,
});
function Page() {
  const product = Route.useLoaderData();
  const shop = useCommerce();
  return (
    <SiteShell>
      <nav className="mb-8 text-sm">
        <Link to="/" className="underline">
          Shop
        </Link>{" "}
        / {product.category} / {product.name}
      </nav>
      <div className="grid gap-8 md:grid-cols-2">
        <ProductVisual product={product} />
        <section>
          <p className="text-sm text-brand">{product.category}</p>
          <h1 className="my-4 text-3xl font-bold">{product.name}</h1>
          <p>{product.detail}</p>
          <p className="my-6 text-2xl font-bold">{formatNaira(product.price)}</p>
          {product.originalPrice && (
            <del className="text-sm text-slate-500">{formatNaira(product.originalPrice)}</del>
          )}
          {product.prescription && (
            <p className="mb-4 text-sm">
              Prescription required. Pharmacist approval before dispatch.
            </p>
          )}
          <button
            className="action-button"
            disabled={!product.inStock}
            onClick={() => shop.add(product)}
          >
            {product.inStock ? "Add to cart" : "Currently unavailable"}
          </button>
          <button className="ml-4 underline" onClick={() => shop.toggleWishlist(product.id)}>
            Save to wishlist
          </button>
          <div className="mt-8 space-y-5">
            <h2 className="font-bold">Directions</h2>
            <p className="leading-7">
              {product.directions || "Follow the product label and your pharmacist’s advice."}
            </p>
            <h2 className="font-bold">Storage</h2>
            <p className="leading-7">
              {product.storage ||
                "Keep in the original packaging, away from children. Follow the storage conditions on the pack."}
            </p>
            <a
              className="inline-block underline"
              href={whatsapp(`Hello ReliefPoint, I have a question about ${product.name}.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ask a pharmacist
            </a>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
