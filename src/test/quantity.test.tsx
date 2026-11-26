import { render } from "./render";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CommerceProvider, useCommerce } from "@/components/commerce-provider";
import { ProductPurchase } from "@/components/product-purchase";
import { products } from "@/lib/commerce";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const product = products.find((p) => p.id === "vitamin-c")!;
function Shop() {
  const shop = useCommerce();
  return (
    <>
      <ProductPurchase product={product} onAdd={shop.add} />
      <button onClick={() => shop.inspect(products.find((p) => p.id === "coartem")!)}>
        Inspect medicine
      </button>
      <output data-testid="distinct-count">{shop.count}</output>
    </>
  );
}

it("adds a chosen quantity, edits units in the cart and counts distinct products", () => {
  render(
    <CommerceProvider>
      <Shop />
    </CommerceProvider>,
  );
  fireEvent.change(screen.getByLabelText(`Quantity of ${product.name}`), {
    target: { value: "6" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
  let cart = within(screen.getByRole("dialog"));
  expect(cart.getByLabelText(`Quantity of ${product.name}`)).toHaveValue(6);
  expect(screen.getByTestId("distinct-count")).toHaveTextContent("1");
  fireEvent.change(cart.getByLabelText(`Quantity of ${product.name}`), { target: { value: "12" } });
  fireEvent.click(cart.getByLabelText(`Decrease ${product.name}`));
  expect(cart.getByLabelText(`Quantity of ${product.name}`)).toHaveValue(11);
  fireEvent.click(cart.getByLabelText(`Increase ${product.name}`));
  expect(cart.getByLabelText(`Quantity of ${product.name}`)).toHaveValue(12);
  fireEvent.change(cart.getByLabelText(`Quantity of ${product.name}`), {
    target: { value: "100" },
  });
  fireEvent.blur(cart.getByLabelText(`Quantity of ${product.name}`));
  expect(cart.getByLabelText(`Quantity of ${product.name}`)).toHaveValue(12);
  fireEvent.click(cart.getByText("Continue shopping"));
  fireEvent.click(screen.getByText("Inspect medicine"));
  const modal = within(screen.getByRole("dialog"));
  fireEvent.change(modal.getByLabelText("Quantity of Coartem 20/120 mg"), {
    target: { value: "3" },
  });
  fireEvent.click(modal.getByRole("button", { name: "Add to cart" }));
  cart = within(screen.getByRole("dialog"));
  expect(cart.getByLabelText("Quantity of Coartem 20/120 mg")).toHaveValue(3);
  expect(screen.getByTestId("distinct-count")).toHaveTextContent("2");
  fireEvent.click(cart.getByLabelText(`Remove ${product.name}`));
  expect(screen.getByTestId("distinct-count")).toHaveTextContent("1");
});
