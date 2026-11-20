import { fireEvent, render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceProvider } from "@/components/commerce-provider";
import { PharmacyStorefront } from "@/components/pharmacy-storefront";
import { WISHLIST_STORAGE_KEY } from "@/lib/commerce";
beforeEach(() => {
  localStorage.clear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
describe("retail storefront", () => {
  it("searches, sorts and saves a product without repeated demo copy", () => {
    const { container } = render(
      <CommerceProvider>
        <PharmacyStorefront design="flagship" />
      </CommerceProvider>,
    );
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
    const search = within(container.querySelector(".desktop-search") as HTMLElement);
    fireEvent.change(search.getByLabelText("Search products"), { target: { value: "cerave" } });
    fireEvent.click(search.getByLabelText("Search catalog"));
    expect(container.querySelectorAll(".retail-product-grid article")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "price-low" } });
    expect(container.querySelector(".retail-product-grid article h3")).toHaveTextContent(
      "CeraVe Hydrating Cleanser",
    );
    fireEvent.click(screen.getByLabelText("Save CeraVe Hydrating Cleanser"));
    expect(localStorage.getItem(WISHLIST_STORAGE_KEY)).toContain("cleanser");
    fireEvent.click(screen.getByLabelText("Open wishlist, 1 items"));
    expect(screen.getByRole("dialog")).toHaveTextContent("CeraVe Hydrating Cleanser");
  });
  it("opens accessible navigation and filters by a department", () => {
    render(
      <CommerceProvider>
        <PharmacyStorefront design="marketplace" />
      </CommerceProvider>,
    );
    fireEvent.click(screen.getByLabelText("Open navigation"));
    const menu = screen.getByRole("dialog", { name: "Store navigation" });
    fireEvent.click(within(menu).getByText("Oral Care"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Sensodyne Daily Care")).toBeInTheDocument();
    expect(screen.queryByText("Omron M2 BP Monitor")).not.toBeInTheDocument();
  });
  it("moves between featured collections", () => {
    render(
      <CommerceProvider>
        <PharmacyStorefront design="flagship" />
      </CommerceProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Everyday health.");
    fireEvent.click(screen.getByLabelText("Next feature"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Good skin days");
    fireEvent.click(screen.getByLabelText("Previous feature"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Everyday health.");
  });
  it("opens filters in a modal on mobile and keeps selections after applying", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      render(
        <CommerceProvider>
          <PharmacyStorefront design="flagship" />
        </CommerceProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "OTC" }));
      expect(screen.queryByLabelText("Sort by")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Filters" }));
      const modal = screen.getByRole("dialog", { name: "Filter products" });
      fireEvent.change(within(modal).getByLabelText("Sort by"), { target: { value: "price-low" } });
      fireEvent.click(within(modal).getByText("Apply filters"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Sort by")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Filters" }));
      expect(screen.getByLabelText("Sort by")).toHaveValue("price-low");
      fireEvent.click(within(screen.getByRole("dialog")).getByText("Clear filters"));
      expect(screen.getByLabelText("Category")).toHaveValue("All");
      expect(screen.getByLabelText("Sort by")).toHaveValue("featured");
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });
});
