import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, act } from "@testing-library/react";
import { render } from "./render";
import { CookieNotice } from "@/components/cookie-notice";
import { CommerceProvider, useCommerce } from "@/components/commerce-provider";
import { COOKIE_PREFERENCES_KEY, openCookieSettings } from "@/lib/cookie-preferences";
import { CART_STORAGE_KEY, WISHLIST_STORAGE_KEY, products } from "@/lib/commerce";
function Basket() {
  const shop = useCommerce();
  return (
    <>
      <p data-testid="items">{shop.count}</p>
      <button onClick={() => shop.add(products.find((p) => p.id === "vitamin-c")!)}>
        Add vitamin
      </button>
      <button onClick={() => shop.toggleWishlist("vitamin-c")}>Save vitamin</button>
    </>
  );
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);
describe("cookie and browser storage choices", () => {
  it("keeps shopping usable without optional persistence and clears saved lists on withdrawal", async () => {
    render(
      <CommerceProvider>
        <Basket />
        <CookieNotice />
      </CommerceProvider>,
    );
    fireEvent.click(screen.getByText("Add vitamin"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("items")).toHaveTextContent("1");
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Accept optional storage" }));
    expect(localStorage.getItem(CART_STORAGE_KEY)).toContain("vitamin-c");
    expect(screen.queryByRole("region", { name: "Cookie choices" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Save vitamin"));
    expect(localStorage.getItem(WISHLIST_STORAGE_KEY)).toContain("vitamin-c");
    act(() => openCookieSettings());
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(WISHLIST_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId("items")).toHaveTextContent("1");
    fireEvent.click(screen.getByText("Add vitamin"));
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });
  it("remembers essential-only and requests a fresh choice after expiry", () => {
    const first = render(<CookieNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    first.unmount();
    const second = render(<CookieNotice />);
    expect(screen.queryByRole("region", { name: "Cookie choices" })).not.toBeInTheDocument();
    second.unmount();
    localStorage.setItem(
      COOKIE_PREFERENCES_KEY,
      JSON.stringify({ version: 1, rememberBasket: true, expires: Date.now() - 1 }),
    );
    render(<CookieNotice />);
    expect(screen.getByRole("region", { name: "Cookie choices" })).toBeVisible();
  });
});
