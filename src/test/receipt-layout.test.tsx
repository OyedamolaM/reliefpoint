import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ReceiptDocument } from "@/components/receipt-document";
import type { Receipt } from "@/lib/receipt";

afterEach(cleanup);
const receipt: Receipt = {
  version: 1,
  number: "RCP-100123",
  reference: "RP-100123",
  paid_at: "2026-11-26T09:00:00Z",
  business: {
    name: "Relief Point Pharmacy",
    address: "Ikeja, Lagos",
    email: "support@reliefpointpharmacy.com",
    phone: "+234 706 784 1607",
  },
  customer: {
    name: "Amina <script>unsafe</script>",
    email: "amina@example.com",
    phone: "08012345678",
    address: "12 Oregun Road",
  },
  items: [{ name: "A product with a long descriptive name", quantity: 2, price_kobo: 125000 }],
  subtotal: 250000,
  delivery: 250000,
  processing: 0,
  total: 500000,
  method: "mixed",
  payments: [
    { method: "cash", amount: 200000 },
    { method: "bank_transfer", amount: 300000 },
  ],
  currency: "NGN",
  test_mode: false,
};
it("organises the receipt into labelled details, customer, item columns and payment totals", () => {
  const { container } = render(<ReceiptDocument receipt={receipt} />);
  expect(screen.getByRole("heading", { name: "Receipt details" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Billed to" })).toBeVisible();
  const table = screen.getByRole("table", { name: "Purchased items" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual(["Item", "Qty", "Unit price", "Amount"]);
  expect(within(table).getByText("A product with a long descriptive name")).toBeVisible();
  expect(screen.getByText("Total paid")).toBeVisible();
  expect(screen.getByText("Bank transfer")).toBeVisible();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText(receipt.customer.name)).toBeVisible();
});
it("clearly identifies test receipts", () => {
  render(<ReceiptDocument receipt={{ ...receipt, test_mode: true }} />);
  expect(screen.getByText("Test receipt — no live payment was received.")).toBeVisible();
  expect(screen.queryByText("Paid", { exact: true })).not.toBeInTheDocument();
});
