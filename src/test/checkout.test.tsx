import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommerceProvider, useCommerce } from "@/components/commerce-provider";
import { CART_STORAGE_KEY, products } from "@/lib/commerce";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
function Harness() {
  const shop = useCommerce();
  return (
    <>
      <button onClick={() => shop.add(products.find((p) => p.id === "vitamin-c")!)}>
        Add vitamin
      </button>
      <button onClick={() => shop.add(products.find((p) => p.id === "coartem")!)}>
        Add prescription
      </button>
      <button onClick={shop.openCart}>Open cart</button>
      <p data-testid="cart-count">{shop.count}</p>
    </>
  );
}
function deliveryDetails() {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Test Customer" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "customer@example.com" } });
  fireEvent.change(screen.getByLabelText("Nigerian phone number"), {
    target: { value: "08012345678" },
  });
  fireEvent.change(screen.getByLabelText("Street address"), { target: { value: "1 Test Street" } });
  fireEvent.change(screen.getByLabelText("State / FCT"), { target: { value: "Lagos" } });
  fireEvent.change(screen.getByLabelText("LGA / City"), { target: { value: "Ikeja" } });
}
describe("frontend checkout", () => {
  it("reviews delivery and payment without claiming a payment or clearing the basket", () => {
    render(
      <CommerceProvider>
        <Harness />
      </CommerceProvider>,
    );
    fireEvent.click(screen.getByText("Add vitamin"));
    fireEvent.click(screen.getByLabelText("Increase Vitamin C 1000 mg"));
    expect(screen.getAllByText("₦17,800").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Proceed to checkout"));
    deliveryDetails();
    fireEvent.click(screen.getByText("Continue to payment"));
    fireEvent.click(screen.getByLabelText(/Bank transfer/));
    const review = screen.getByText("Review checkout · ₦19,800");
    expect(review).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(review);
    expect(screen.getByText(/no payment has been taken/)).toBeInTheDocument();
    expect(screen.getByTestId("cart-count")).toHaveTextContent("2");
    expect(screen.getByText("Ask our team to confirm this basket")).toHaveAttribute(
      "href",
      expect.stringContaining("bank_transfer"),
    );
    expect(localStorage.getItem(CART_STORAGE_KEY)).not.toContain("customer@example.com");
    fireEvent.click(screen.getByText("Continue shopping"));
    fireEvent.click(screen.getByText("Open cart"));
    fireEvent.click(screen.getByText("Proceed to checkout"));
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });
  it("requires a valid prescription and resets the area after a state change", () => {
    render(
      <CommerceProvider>
        <Harness />
      </CommerceProvider>,
    );
    fireEvent.click(screen.getByText("Add prescription"));
    fireEvent.click(screen.getByText("Proceed to checkout"));
    deliveryDetails();
    fireEvent.change(screen.getByLabelText("State / FCT"), { target: { value: "Rivers" } });
    expect(screen.getByLabelText("LGA / City")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("LGA / City"), { target: { value: "Port Harcourt" } });
    const form = screen.getByText("Continue to payment").closest("form")!;
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toHaveTextContent("Select a prescription");
    fireEvent.change(screen.getByLabelText("Prescription file"), {
      target: { files: [new File(["bad"], "bad.exe", { type: "application/octet-stream" })] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("PDF, JPEG or PNG");
    fireEvent.change(screen.getByLabelText("Prescription file"), {
      target: {
        files: [new File(["prescription"], "prescription.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.submit(form);
    expect(
      screen.getByText("Prescription selected · review required before dispensing"),
    ).toBeInTheDocument();
    expect(screen.getByText("₦9,300")).toBeInTheDocument();
  });
  it("restores quantities across a page remount", () => {
    const first = render(
      <CommerceProvider>
        <Harness />
      </CommerceProvider>,
    );
    fireEvent.click(screen.getByText("Add vitamin"));
    first.unmount();
    render(
      <CommerceProvider>
        <Harness />
      </CommerceProvider>,
    );
    expect(screen.getByTestId("cart-count")).toHaveTextContent("1");
    fireEvent.click(screen.getByText("Open cart"));
    fireEvent.click(screen.getByLabelText("Decrease Vitamin C 1000 mg"));
    expect(screen.getByTestId("cart-count")).toHaveTextContent("0");
  });
});
