import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within, waitFor } from "@testing-library/react";
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
    return path === "auth/mfa-factors"
      ? { factors: state.factors }
      : path === "admin/customer-invite"
        ? { message: "Invitation sent." }
        : {};
  }),
  api: async (path: string) => {
    state.calls.push(path);
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
        rows: state.categoryNames.slice(page, page + 1).map((name) => ({ name })),
        more: page + 1 < state.categoryNames.length,
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
  state.categoryNames = ["Vitamins", "Skincare"];
  state.user.aal = "aal2";
  state.user.mfaVerified = true;
  state.factors = [{ id: "factor-1", name: "ReliefPoint" }];
});
describe("pharmacy workspaces", () => {
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
  it("opens a product form directly from a category with that category selected", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Products",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add product" }));
    const category = screen.getByRole("combobox", { name: "Category" });
    expect(category).toHaveValue("Vitamins");
    expect(screen.getByRole("dialog", { name: "Add products" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(state.calls).toContain(
        "admin/orders?page=0&q=Vitamin%20C&period=custom&from=2026-10-01&to=2026-10-31",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pending payments" }));
    await waitFor(() =>
      expect(state.calls).toContain(
        "admin/orders?page=0&q=&view=pending&period=custom&from=2026-10-01&to=2026-10-31",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refunds" }));
    expect(screen.getByRole("button", { name: "Date filter" })).toBeInTheDocument();
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
    expect(within(table).getByText("12 Oregun Road, Ikeja, Lagos")).toBeInTheDocument();
    expect(within(table).getByText("Awaiting verification")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add customer" }));
    const modal = screen.getByRole("dialog", { name: "Add customer" });
    fireEvent.change(within(modal).getByLabelText("Full name"), { target: { value: "New Buyer" } });
    fireEvent.change(within(modal).getByLabelText("Email address"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(within(modal).getByLabelText("Nigerian phone number"), {
      target: { value: "08012345678" },
    });
    expect(within(modal).queryByLabelText(/password/i)).not.toBeInTheDocument();
    fireEvent.click(within(modal).getByRole("button", { name: "Add customer & send invitation" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Add new" }));
    const category = await screen.findByRole("combobox", { name: "Category" });
    await waitFor(() => expect(category).toBeEnabled());
    expect(within(category).getByRole("option", { name: "Skincare" })).toBeInTheDocument();
    fireEvent.change(category, { target: { value: "Vitamins" } });
    expect(category).toHaveValue("Vitamins");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    state.categoryNames.push("Medical devices");
    fireEvent.click(screen.getByRole("button", { name: "Add new" }));
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
  it("provides state choices when adding the first delivery zone", async () => {
    render(<AdminPage />);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Administration" })).getByRole("button", {
        name: "Delivery",
      }),
    );
    await screen.findByText("No delivery zones yet");
    fireEvent.click(screen.getByRole("button", { name: "Add new" }));
    const modal = screen.getByRole("dialog", { name: "Add record" });
    const state = within(modal).getByLabelText("State / FCT");
    expect(state.tagName).toBe("SELECT");
    expect(state.querySelectorAll("option")).toHaveLength(38);
    expect(within(modal).getByLabelText("Delivery fee (₦)")).toBeRequired();
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
    fireEvent.click(screen.getByRole("button", { name: "Add new" }));
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
