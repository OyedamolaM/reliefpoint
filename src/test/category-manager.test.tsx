import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "./render";
import { CategoryManager } from "@/components/category-manager";
const state = vi.hoisted(() => ({
  category: "",
  fail: false,
  saved: [] as any[],
  products: [] as { id: string; name: string; category: string }[],
}));
vi.mock("@/lib/api", () => ({
  notifyError: vi.fn(),
  api: vi.fn(async (path: string) => {
    const params = new URLSearchParams(path.split("?")[1]);
    const page = Number(params.get("page") || 0);
    const rows = state.products.filter(
      (product) =>
        (!params.has("category") || product.category === params.get("category")) &&
        product.name.toLowerCase().includes((params.get("q") || "").toLowerCase()),
    );
    return { rows: rows.slice(page, page + 1), more: page + 1 < rows.length };
  }),
  send: vi.fn(async (_path: string, input: any) => {
    if (state.fail) throw new Error("Connection failed");
    state.saved.push(input);
    state.category = input.name;
    state.products.forEach((product) => {
      if (input.product_ids.includes(product.id)) product.category = input.name;
    });
    return { id: "category-1" };
  }),
}));
function Category() {
  const [row, setRow] = useState<{ id?: string; name?: string }>({});
  return <CategoryManager key={row.id || "new"} row={row} onSaved={setRow} />;
}
beforeEach(() => {
  state.category = "";
  state.fail = false;
  state.saved = [];
  state.products = [
    { id: "product-1", name: "Vitamin C", category: "Vitamins" },
    { id: "product-2", name: "Care cream", category: "Skincare" },
  ];
});
afterEach(cleanup);

it("assigns selected products across pages while creating a category", async () => {
  render(<Category />);
  fireEvent.change(screen.getByLabelText("Category name"), { target: { value: "Everyday care" } });
  fireEvent.click(await screen.findByLabelText("Add Vitamin C to category"));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(await screen.findByLabelText("Add Care cream to category"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create category" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create category" }));
  await screen.findByText("Products in this category");
  expect(state.saved[0]).toMatchObject({
    name: "Everyday care",
    product_ids: ["product-1", "product-2"],
  });
  expect(await screen.findByText("Vitamin C")).toBeInTheDocument();
  expect(screen.getByLabelText("Category name")).toHaveValue("Everyday care");
});

it("adds products after creating an empty category and preserves selection when saving fails", async () => {
  render(<Category />);
  fireEvent.change(screen.getByLabelText("Category name"), { target: { value: "Everyday care" } });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create category" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create category" }));
  await screen.findByText("No products assigned yet.");
  fireEvent.click(screen.getByRole("button", { name: "Add products to category" }));
  fireEvent.click(await screen.findByLabelText("Add Vitamin C to category"));
  state.fail = true;
  fireEvent.click(screen.getByRole("button", { name: "Save category" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save category" })).toBeEnabled());
  expect(screen.getByLabelText("Add Vitamin C to category")).toBeChecked();
  expect(screen.getByLabelText("Category name")).toHaveValue("Everyday care");
  state.fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Save category" }));
  await waitFor(() => expect(state.saved).toHaveLength(2));
  expect(state.saved[1]).toMatchObject({ id: "category-1", product_ids: ["product-1"] });
});
