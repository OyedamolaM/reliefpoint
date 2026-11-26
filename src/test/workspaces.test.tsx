import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within, waitFor, act } from "@testing-library/react";
import { render } from "./render";
const state = vi.hoisted(() => ({
  user: {
    id: "user",
    name: "Amina Bello",
    email: "amina@example.com",
    phone: "08012345678",
    roles: ["admin"],
    aal: "aal2",
    mfaVerified: true,
    mfaExpiresAt: null as string | null,
    recovery: false,
  },
  calls: [] as string[],
  actions: [] as { path: string; input: unknown }[],
  showSettings: false,
  createdOrder: null as any,
  categoryNames: ["Vitamins", "Skincare"],
  factors: [{ id: "factor-1", name: "ReliefPoint" }] as { id: string; name: string }[],
}));
vi.mock("@/components/auth-provider", () => ({
  useAccount: () => ({
    user: state.user,
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
}));
vi.mock("@/components/commerce-provider", () => ({
  useCommerce: () => ({
    wishlist: [],
    openWishlist: vi.fn(),
    openCart: vi.fn(),
    count: 0,
    settings: {},
  }),
}));
vi.mock("@/lib/api", () => ({
  notifyError: vi.fn(),
  send: vi.fn(async (path: string, input: unknown) => {
    state.actions.push({ path, input });
    if (path === "admin/order-quote")
      return {
        quote: {
          subtotal: 250000,
          delivery: 200000,
          processing: 0,
          total: 450000,
          prescription: false,
          eta: "Next day",
        },
      };
    if (path === "admin/order-create") {
      state.createdOrder = {
        id: "00000000-0000-4000-8000-000000000020",
        reference: "RP-example",
        payment_status: "pending",
        fulfillment_status: "awaiting_payment",
        total: 450000,
        created_at: "2026-11-26T09:00:00Z",
      };
      return {
        order: {
          id: "00000000-0000-4000-8000-000000000020",
          reference: "RP-example",
          payment_status: "pending",
        },
        total: 450000,
        url: "https://pharmacy.example/orders/example?token=private",
        expires_at: "2026-11-26T14:00:00Z",
      };
    }
    if (path === "admin/manual-payment") {
      if (state.createdOrder) {
        state.createdOrder.payment_status = "paid";
        state.createdOrder.fulfillment_status = "processing";
      }
      return { status: "paid", message: "Payment recorded." };
    }
    return path === "auth/mfa-factors"
      ? { factors: state.factors }
      : path === "admin/customer-invite" || path === "admin/staff-invite"
        ? { message: "Invitation sent." }
        : {};
  }),
  api: async (path: string) => {
    state.calls.push(path);
    if (path === "zones")
      return {
        zones: [
          {
            id: "00000000-0000-4000-8000-000000000010",
            state: "Lagos",
            lga: "Ikeja",
            area: "Oregun",
            active: true,
          },
        ],
      };
    if (path.startsWith("catalog?"))
      return {
        products: [
          {
            id: "00000000-0000-4000-8000-000000000011",
            name: "Vitamin C",
            price: 2500,
            inStock: true,
          },
        ],
        configured: true,
        more: false,
      };
    if (path.startsWith("admin/staff_roles?"))
      return {
        rows: [
          {
            user_id: "first",
            role: "admin",
            name: "First Administrator",
            email: "first@example.com",
            phone: "08012345678",
          },
          {
            user_id: "second",
            role: "admin",
            name: "Second Administrator",
            email: "second@example.com",
            phone: "",
          },
        ],
        more: false,
      };
    if (path.startsWith("admin/profiles?"))
      return {
        rows: [
          {
            id: "customer-1",
            name: "Buyer One",
            email: "buyer@example.com",
            phone: "08012345678",
            addresses: [{ id: "address", address: "12 Oregun Road", lga: "Ikeja", state: "Lagos" }],
            email_confirmed_at: null,
            created_at: "2026-11-25T10:00:00Z",
          },
        ],
        more: false,
      };
    if (path.startsWith("admin/categories?page=")) {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      return {
        rows: state.categoryNames.slice(page, page + 1).map((name) => ({
          id: `00000000-0000-4000-8000-${String(page + 1).padStart(12, "0")}`,
          name,
        })),
        more: page + 1 < state.categoryNames.length,
      };
    }
    if (path.startsWith("admin/order?id="))
      return {
        order: state.createdOrder,
        items: [],
        events: [],
        prescriptions: [],
        refunds: [],
        payment: null,
        receipt: null,
        staff_notes: [],
        notifications: [],
        can_resume: false,
      };
    if (path.startsWith("admin/orders?")) {
      const pending = path.includes("view=pending");
      return {
        rows:
          state.createdOrder && (state.createdOrder.payment_status === "pending") === pending
            ? [{ ...state.createdOrder }]
            : [],
        more: false,
      };
    }
    if (path.startsWith("admin/summary"))
      return { paid_kobo: 240000, confirmed_orders: 1, pending_payments: 1, prescription_queue: 0 };
    if (path === "admin/checkout-readiness")
      return {
        available: false,
        mode: "test",
        checks: [
          {
            key: "checkout_enabled",
            label: "Enable checkout in Business & checkout",
            ready: false,
          },
        ],
      };
    if (path.startsWith("admin/settings?") && state.showSettings)
      return {
        rows: [
          {
            id: true,
            public_data: {},
            checkout_enabled: false,
            launch_approved: false,
            fee_rate: 150,
            fee_fixed: 10000,
            fee_threshold: 250000,
            fee_cap: 200000,
          },
        ],
        more: false,
      };
    return { rows: [], more: false };
  },
}));
import { AdminPage } from "@/components/admin-page";
import { AccountPage, SecurityPanel } from "@/components/account-page";
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
});
beforeEach(() => {
  state.calls = [];
  state.actions = [];
  state.showSettings = false;
  state.createdOrder = null;
  state.categoryNames = ["Vitamins", "Skincare"];
  state.user.aal = "aal2";
  state.user.mfaVerified = true;
  state.factors = [{ id: "factor-1", name: "ReliefPoint" }];
});
describe("pharmacy workspaces", () => {
  it("keeps product import compact and excludes product export", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Products",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Import products" }));
    const dialog = screen.getByRole("dialog", { name: "Import products" });
    expect(dialog).toHaveClass("max-w-lg");
    expect(within(dialog).queryByRole("button", { name: /Export/ })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Import product file")).toBeInTheDocument();
  });
  it("creates and selects a category inside the product form without losing entered details", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Products",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add products" }));
    const dialog = within(screen.getByRole("dialog"));
    await waitFor(() => expect(dialog.getByRole("combobox", { name: "Category" })).toBeEnabled());
    fireEvent.change(dialog.getByLabelText("Product name"), {
      target: { value: "New care product" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "+ New category" }));
    const categoryModal = screen.getByRole("dialog", { name: "Create category" });
    expect(categoryModal).toHaveClass("max-w-lg");
    fireEvent.change(within(categoryModal).getByLabelText("New category name"), {
      target: { value: "Everyday care" },
    });
    fireEvent.click(within(categoryModal).getByRole("button", { name: "Create category" }));
    await waitFor(() =>
      expect(dialog.getByRole("combobox", { name: "Category" })).toHaveValue("Everyday care"),
    );
    expect(dialog.getByLabelText("Product name")).toHaveValue("New care product");
    expect(state.actions).toContainEqual({
      path: "admin/categories",
      input: { name: "Everyday care" },
    });
  });
  it("uses an explicit tips label instead of Add record", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Health Tips",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add tips" }));
    expect(screen.getByRole("dialog", { name: "Add tips" })).toBeVisible();
    expect(screen.queryByText("Add record")).not.toBeInTheDocument();
  });
  it("creates a manual purchase, reviews server totals and records a confirmed cash payment", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Orders",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add order" }));
    const modal = screen.getByRole("dialog", { name: "Add order" });
    fireEvent.click(within(modal).getByRole("button", { name: "Select customer" }));
    const customers = screen.getByRole("dialog", { name: "Select customer" });
    fireEvent.click(await within(customers).findByRole("button", { name: /Buyer One/ }));
    for (const [label, value] of [
      ["Customer name", "Buyer One"],
      ["Email address", "buyer@example.com"],
      ["Phone number", "08012345678"],
      ["Street address", "12 Oregun Road"],
    ])
      fireEvent.change(within(modal).getByLabelText(label!), { target: { value } });
    await within(modal).findByRole("option", { name: "Lagos" });
    fireEvent.change(within(modal).getByLabelText("State / FCT"), { target: { value: "Lagos" } });
    fireEvent.change(within(modal).getByLabelText("Delivery area"), {
      target: { value: "00000000-0000-4000-8000-000000000010" },
    });
    fireEvent.click(within(modal).getByRole("button", { name: "Add products" }));
    const products = screen.getByRole("dialog", { name: "Select products" });
    fireEvent.click(await within(products).findByRole("checkbox", { name: "Select Vitamin C" }));
    fireEvent.click(within(products).getByRole("button", { name: /Add selected products/ }));
    fireEvent.click(within(modal).getByRole("button", { name: "Review order" }));
    fireEvent.click(await within(modal).findByRole("button", { name: "Create order" }));
    await within(modal).findByText("RP-example");
    expect(state.actions.find((a) => a.path === "admin/order-create")?.input).toMatchObject({
      contact: { name: "Buyer One", email: "buyer@example.com" },
      items: [{ id: "00000000-0000-4000-8000-000000000011", quantity: 1 }],
    });
    expect(within(modal).getByText("Record payment")).toBeVisible();
    expect(within(modal).queryByLabelText(/Receipt \/ transfer reference/)).not.toBeInTheDocument();
    fireEvent.click(
      within(modal).getByRole("checkbox", { name: "I have confirmed receipt of this payment." }),
    );
    fireEvent.click(within(modal).getByRole("button", { name: "Confirm payment received" }));
    await waitFor(() =>
      expect(state.actions.find((a) => a.path === "admin/manual-payment")?.input).toMatchObject({
        payments: [{ method: "cash", amount: 450000, reference: "" }],
      }),
    );
    expect(await within(modal).findByText(/Payment confirmed/)).toBeVisible();
    fireEvent.click(within(modal).getByRole("button", { name: "Close" }));
    expect(await screen.findByText("RP-example")).toBeVisible();
    expect(screen.getByRole("button", { name: "View order" })).toHaveClass("bg-brand");
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });
  it("lets an administrator invite staff by email without an account ID or owner escalation", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Settings",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Staff access" }));
    fireEvent.click(screen.getByRole("button", { name: "Add staff" }));
    const modal = screen.getByRole("dialog", { name: "Add staff" });
    expect(within(modal).queryByLabelText("Customer account ID")).not.toBeInTheDocument();
    expect(within(modal).queryByRole("option", { name: "owner" })).not.toBeInTheDocument();
    fireEvent.change(within(modal).getByLabelText("Full name"), {
      target: { value: "New Administrator" },
    });
    fireEvent.change(within(modal).getByLabelText("Email address"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.click(within(modal).getByRole("button", { name: "Add staff" }));
    await waitFor(() =>
      expect(state.actions).toContainEqual({
        path: "admin/staff-invite",
        input: { name: "New Administrator", email: "admin@example.com", role: "admin" },
      }),
    );
  });
  it("identifies staff by name and email with separately labelled roles", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Settings",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Staff access" }));
    expect(await screen.findByText("First Administrator")).toBeInTheDocument();
    expect(screen.getByText("Second Administrator")).toBeInTheDocument();
    expect(screen.getByText("first@example.com")).toBeInTheDocument();
    expect(screen.getByText("second@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("Role: admin")).toHaveLength(2);
    expect(screen.getByText("Phone: 08012345678")).toBeInTheDocument();
    expect(screen.queryByText("Phone:")).not.toBeInTheDocument();
  });
  it("manages category membership within the category tab instead of linking to product forms", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Products",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    expect(screen.queryByRole("button", { name: "Add product" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View products" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Manage products" }));
    const modal = screen.getByRole("dialog", { name: "Manage category" });
    expect(modal).toHaveClass("max-w-xl");
    expect(within(modal).getByLabelText("Category name")).toHaveValue("Vitamins");
    expect(within(modal).getByText("Products in this category")).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole("button", { name: "Add products to category" }));
    expect(
      within(screen.getByRole("dialog", { name: "Add products to category" })).getByLabelText(
        "Find products",
      ),
    ).toBeInTheDocument();
  });
  it("renders a dedicated order page and opens actions in separate modals", async () => {
    state.createdOrder = {
      id: "order-1",
      reference: "legacy-reference",
      public_reference: "RP-100123",
      payment_status: "paid",
      payment_method: "paystack",
      fulfillment_status: "processing",
      prescription_status: "not_required",
      created_at: "2026-11-26T12:00:00Z",
      subtotal: 250000,
      delivery: 0,
      processing: 0,
      total: 250000,
      contact: { name: "Buyer", phone: "08012345678", address: "12 Road" },
      zone_snapshot: { state: "Lagos", lga: "Ikeja", area: "Oregun", estimate: "Tomorrow" },
    };
    render(<AdminPage selectedOrderId="order-1" />);
    expect(await screen.findByRole("heading", { name: "Order RP-100123" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to orders" })).toHaveAttribute(
      "href",
      "/admin?section=orders",
    );
    expect(screen.queryByLabelText("Delivery status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update order tracking" }));
    const modal = screen.getByRole("dialog", { name: "Update order tracking" });
    expect(within(modal).getByLabelText("Delivery status")).toBeVisible();
    fireEvent.click(within(modal).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(
      within(screen.getByRole("dialog", { name: "Cancel order" })).getByRole("button", {
        name: "Confirm cancellation",
      }),
    ).toBeVisible();
  });
  it("discovers an order created elsewhere without a refresh button", async () => {
    vi.useFakeTimers();
    try {
      render(<AdminPage />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      fireEvent.click(
        within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
          name: "Orders",
        }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      state.createdOrder = {
        id: "external-order",
        reference: "RP-100999",
        payment_status: "paid",
        fulfillment_status: "processing",
        prescription_status: "not_required",
        total: 250000,
        contact: { name: "External buyer" },
        created_at: "2026-11-26T12:00:00Z",
      };
      expect(screen.queryByText("RP-100999")).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(screen.getByText("RP-100999")).toBeVisible();
      expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });
  it("keeps the chosen date filter across order tabs and submits customer or item search", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Orders",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Date filter" }));
    const modal = screen.getByRole("dialog", { name: "Filter by date" });
    fireEvent.change(within(modal).getByLabelText("Sales period"), { target: { value: "custom" } });
    fireEvent.change(within(modal).getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(within(modal).getByLabelText("To"), { target: { value: "2026-10-31" } });
    await waitFor(() => expect(within(modal).getByRole("button", { name: "Apply" })).toBeEnabled());
    fireEvent.click(within(modal).getByRole("button", { name: "Apply" }));
    fireEvent.change(screen.getByLabelText("Search records"), { target: { value: "Vitamin C" } });

    await waitFor(
      () =>
        expect(state.calls).toContain(
          "admin/orders?page=0&q=Vitamin%20C&period=custom&from=2026-10-01&to=2026-10-31",
        ),
      { timeout: 3500 },
    );
    fireEvent.click(screen.getByRole("button", { name: "Pending payments" }));
    await waitFor(() =>
      expect(state.calls).toContain(
        "admin/orders?page=0&q=&view=pending&period=custom&from=2026-10-01&to=2026-10-31",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refunds" }));
    expect(screen.getByRole("button", { name: "Date filter" })).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Products",
      }),
    );
    expect(screen.queryByRole("button", { name: "Date filter" })).not.toBeInTheDocument();
    await waitFor(() => expect(state.calls).toContain("admin/products?page=0&q="));
    expect(
      state.calls
        .filter((path) => path.startsWith("admin/products?"))
        .every((path) => !path.includes("period=")),
    ).toBe(true);
  });
  it("shows clear customer columns and sends an invitation without assigning a password", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Customers",
      }),
    );
    const table = await screen.findByRole("table", { name: "Customers and contact details" });
    expect(within(table).getByRole("columnheader", { name: "Phone number" })).toBeInTheDocument();
    expect(within(table).getByText("buyer@example.com")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "WhatsApp Buyer One" })).toHaveAttribute(
      "href",
      "https://wa.me/2348012345678",
    );
    expect(within(table).getByText("12 Oregun Road, Ikeja, Lagos")).toBeInTheDocument();
    expect(within(table).getByText("Awaiting verification")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
    const modal = screen.getByRole("dialog", { name: "Add customer" });
    fireEvent.change(within(modal).getByLabelText("Full name"), { target: { value: "New Buyer" } });
    fireEvent.change(within(modal).getByLabelText("Email address"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(within(modal).getByLabelText("Phone number"), {
      target: { value: "08012345678" },
    });
    expect(within(modal).queryByLabelText(/password/i)).not.toBeInTheDocument();
    fireEvent.click(within(modal).getByRole("button", { name: "Send invitation" }));
    await waitFor(() =>
      expect(state.actions).toContainEqual({
        path: "admin/customer-invite",
        input: {
          name: "New Buyer",
          email: "new@example.com",
          phone: "08012345678",
          address: "",
          state: "",
          lga: "",
        },
      }),
    );
  });
  it("loads saved categories across pages and refreshes options when reopening the product form", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Products",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add products" }));
    const category = await screen.findByRole("combobox", { name: "Category" });
    await waitFor(() => expect(category).toBeEnabled());
    expect(within(category).getByRole("option", { name: "Skincare" })).toBeInTheDocument();
    fireEvent.change(category, { target: { value: "Vitamins" } });
    expect(category).toHaveValue("Vitamins");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    state.categoryNames.push("Medical devices");
    fireEvent.click(screen.getByRole("button", { name: "Add products" }));
    expect(await screen.findByRole("option", { name: "Medical devices" })).toBeInTheDocument();
  });
  it("opens mobile date filters in a modal and applies a selected period", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render(<AdminPage />);
    await screen.findByText("Confirmed sales");
    expect(screen.queryByLabelText("Sales period")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Date filter" }));
    const modal = screen.getByRole("dialog", { name: "Filter sales by date" });
    fireEvent.change(within(modal).getByLabelText("Sales period"), { target: { value: "all" } });
    expect(state.calls.some((path) => path === "admin/summary?period=all")).toBe(false);
    fireEvent.click(within(modal).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(state.calls).toContain("admin/summary?period=all"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Date filter" }));
    expect(screen.getByLabelText("Sales period")).toHaveValue("all");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows the specific checkout blocker without exposing environment secrets", async () => {
    state.showSettings = true;
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Settings",
      }),
    );
    expect(await screen.findByText("Enable checkout in Business & checkout")).toBeVisible();
    expect(screen.getByText(/Checkout is blocked/)).toHaveTextContent("Paystack test mode");
    expect(screen.getByRole("button", { name: "Recheck" })).toBeVisible();
    expect(
      screen.getByRole("checkbox", {
        name: "Enable checkout (test payments until launch is approved)",
      }),
    ).not.toBeChecked();
  });
  it("shows naira and percentage fees while preserving the server's integer units", async () => {
    state.showSettings = true;
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Settings",
      }),
    );
    const rate = await screen.findByLabelText("Processing rate (%)");
    expect(rate).toHaveValue(1.5);
    expect(screen.getByLabelText("Fixed fee (NGN)")).toHaveValue(100);
    expect(screen.getByLabelText("Fee cap (NGN)")).toHaveValue(2000);
    fireEvent.change(screen.getByLabelText("Fixed fee (NGN)"), { target: { value: "125.25" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save settings" }).closest("form")!);
    await waitFor(() =>
      expect(state.actions.find((a) => a.path === "admin/settings")?.input).toMatchObject({
        fee_rate: 150,
        fee_fixed: 12525,
        fee_threshold: 250000,
        fee_cap: 200000,
      }),
    );
  });
  it("provides state choices when adding the first delivery zone", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Delivery",
      }),
    );
    await screen.findByText("No delivery zones yet");
    fireEvent.click(screen.getByRole("button", { name: "Add delivery zone" }));
    const modal = screen.getByRole("dialog", { name: "Add delivery zone" });
    const state = within(modal).getByLabelText("State / FCT");
    expect(state.tagName).toBe("SELECT");
    expect(state.querySelectorAll("option")).toHaveLength(38);
    expect(within(modal).getByLabelText("Fee (NGN)")).toBeRequired();
    expect(within(modal).getByLabelText("LGA / city")).toBeRequired();
  });
  it("offers setup only to accounts without a registered authenticator", async () => {
    state.user.mfaVerified = false;
    state.factors = [];
    render(<AdminPage />);
    expect(await screen.findByRole("button", { name: "Set up authenticator" })).toBeVisible();
    expect(screen.queryByLabelText("Authenticator code")).not.toBeInTheDocument();
  });
  it("opens administration with remembered verification even after a password-only sign-in", async () => {
    state.user.aal = "aal1";
    render(<AdminPage />);
    expect(await screen.findByText("Confirmed sales")).toBeVisible();
    expect(screen.queryByLabelText("Authenticator code")).not.toBeInTheDocument();
  });
  it("requires a fresh code when browser verification expires even if the token remains aal2", async () => {
    state.user.mfaVerified = false;
    render(<AdminPage />);
    expect(await screen.findByLabelText("Authenticator code")).toBeVisible();
    expect(screen.queryByText("Confirmed sales")).not.toBeInTheDocument();
  });
  it("shows only the code challenge for enrolled staff signing in", async () => {
    state.user.aal = "aal1";
    state.user.mfaVerified = false;
    render(<AdminPage />);
    expect(await screen.findByLabelText("Authenticator code")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Set up authenticator" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
  it("shows verified status and keeps password changes collapsed in settings", () => {
    render(<SecurityPanel />);
    expect(screen.getByText("Authenticator verified")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Set up authenticator" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).not.toBeVisible();
    fireEvent.click(screen.getByText("Change password"));
    expect(screen.getByLabelText("Current password")).toBeVisible();
  });
  it("groups administration and keeps stock history and payments out of the main menu", async () => {
    render(<AdminPage />);
    const nav = screen.getByRole("navigation", { name: "Administration" });
    expect(within(nav).getAllByRole("button")).toHaveLength(7);
    expect(within(nav).queryByText(/stock history|expiry|payments/i)).not.toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Orders" }));
    fireEvent.click(screen.getByRole("button", { name: "Pending payments" }));
    await waitFor(() =>
      expect(
        state.calls.some((p) => p.includes("admin/orders?") && p.includes("view=pending")),
      ).toBe(true),
    );
    expect(await screen.findByText("No pending payments")).toBeInTheDocument();
  });
  it("opens catalog forms in a modal without exposing expiry fields", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Products",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add products" }));
    const modal = screen.getByRole("dialog", { name: "Add products" });
    expect(within(modal).getByLabelText("Product name")).toBeInTheDocument();
    expect(within(modal).getByLabelText("Page name")).not.toBeRequired();
    expect(within(modal).getByLabelText("Photo description")).not.toBeRequired();
    expect(within(modal).getByLabelText("Directions")).not.toBeRequired();
    expect(within(modal).getByLabelText("Storage")).not.toBeRequired();
    expect(within(modal).getByLabelText("Discount price (₦)")).not.toBeRequired();
    expect(within(modal).getByLabelText("Cost price (₦)")).not.toBeRequired();
    expect(within(modal).queryByLabelText("Expiry date")).not.toBeInTheDocument();
    fireEvent.click(within(modal).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows a customer profile and edits it in a modal", () => {
    render(<AccountPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Account" })).getByRole("button", {
        name: "My profile",
      }),
    );
    expect(screen.getByText("08012345678")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit profile" })[0]!);
    expect(screen.getByRole("dialog", { name: "Edit your profile" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Amina Bello");
  });
  it("applies a custom sales period without fetching incomplete dates", async () => {
    render(<AdminPage />);
    await screen.findByText("Confirmed sales");
    fireEvent.click(screen.getByRole("button", { name: "Date filter" }));
    expect(screen.getByRole("dialog", { name: "Filter sales by date" })).toHaveClass("max-w-lg");
    fireEvent.change(screen.getByLabelText("Sales period"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-31" } });
    expect(state.calls.some((path) => path.includes("period=custom"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(state.calls).toContain("admin/summary?period=custom&from=2026-10-01&to=2026-10-31"),
    );
  });
});
