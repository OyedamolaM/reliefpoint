import { afterEach, describe, it, expect, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { render } from "./render";
import { AuthProvider, useAccount } from "@/components/auth-provider";
import { CommerceProvider, useCommerce } from "@/components/commerce-provider";
import { CART_STORAGE_KEY, type Product } from "@/lib/commerce";
import { saveCookiePreferences } from "@/lib/cookie-preferences";
const userA = "00000000-0000-4000-8000-000000000001",
  userB = "00000000-0000-4000-8000-000000000002";
const product: Product = {
  id: "00000000-0000-4000-8000-000000000003",
  name: "Product",
  detail: "Pack",
  category: "OTC",
  price: 100,
  image: "photo.webp",
  inStock: true,
  prescription: false,
  deal: false,
  live: true,
};
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
function Harness() {
  const shop = useCommerce();
  const account = useAccount();
  return (
    <>
      <p data-testid="basket-count">{shop.count}</p>
      <button onClick={() => void account.changed()}>Refresh account</button>
    </>
  );
}
describe("account basket isolation", () => {
  it("restores an owned basket once and does not merge it into another customer", async () => {
    let current = userA;
    saveCookiePreferences(true);
    localStorage.setItem("reliefpoint.basket.owner.v1", userA);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ id: product.id, quantity: 2 }]));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (path: string) => {
        if (path.includes("auth/session"))
          return Response.json({
            user: {
              id: current,
              name: current === userA ? "Amina" : "Bola",
              email: `${current}@example.com`,
              phone: "",
              roles: [],
              aal: "aal1",
              recovery: false,
            },
          });
        if (path.includes("customer/shopping"))
          return Response.json({
            cart: current === userA ? [{ id: product.id, quantity: 2 }] : [],
            wishlist: [],
          });
        if (path.includes("catalog/resolve"))
          return Response.json({ products: current === userA ? [product] : [] });
        return Response.json({ saved: true });
      }),
    );
    render(
      <AuthProvider enabled>
        <CommerceProvider backendEnabled initialCatalog={[product]}>
          <Harness />
        </CommerceProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("basket-count")).toHaveTextContent(/^2$/));
    current = userB;
    fireEvent.click(screen.getByText("Refresh account"));
    await waitFor(() => expect(screen.getByTestId("basket-count")).toHaveTextContent(/^0$/));
  });
});
