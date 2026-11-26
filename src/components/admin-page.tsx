import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { SearchInput } from "./search-input";
import { SectionLoading } from "./section-loading";
import { invalidateOrderData } from "@/lib/order-updates";
import { receiptDate, trackingLabel } from "@/lib/receipt";
import { customerWhatsApp, socialProfiles } from "@/lib/contact-links";
import { CustomerForm as CustomerInvite } from "./customer-form";
import { CategoryManager } from "./category-manager";
import { hasMfaAccess } from "@/lib/session-policy";
import { uploadFile } from "@/lib/upload";
import { useState, useEffect, useId, useRef, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { api, send, notifyError } from "@/lib/api";
import { slugify, roles, productSchema, type StaffRole } from "@/lib/contracts";
import { nigeriaDate, salesPeriod } from "@/lib/sales-period";
import { nigerianStates, deliveryState } from "@/lib/nigeria";
import type { CheckoutReadiness } from "@/lib/checkout-status";
import { importProductBatches } from "@/lib/product-import";
import { useAccount } from "./auth-provider";
import { AuthForm, Field, Pagination, Retry, AuthenticatorPanel } from "./account-page";
import { SiteShell } from "./site-shell";
import { formatNaira } from "@/lib/commerce";
import { OrderView } from "./order-page";
import { AdminOrderForm } from "./admin-order-form";
import { policyDefaults } from "@/lib/business";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Truck,
  BookOpen,
  Settings,
  ArrowUpRight,
  Plus,
  CalendarDays,
  ImagePlus,
  Upload,
} from "lucide-react";
import { WorkspaceShell, WorkspaceModal, EmptyWorkspace } from "./workspace-shell";

const sections: { key: string; label: string; roles: StaffRole[] }[] = [
  {
    key: "orders",
    label: "Orders",
    roles: ["owner", "admin", "pharmacist", "fulfillment", "support"],
  },
  { key: "products", label: "Products", roles: ["owner", "admin", "pharmacist"] },
  { key: "categories", label: "Categories", roles: ["owner", "admin", "pharmacist"] },
  { key: "prescriptions", label: "Prescriptions", roles: ["owner", "admin", "pharmacist"] },
  { key: "shipping_zones", label: "Delivery zones", roles: ["owner", "admin", "fulfillment"] },
  { key: "blog_posts", label: "Health Tips", roles: ["owner", "admin", "editor", "pharmacist"] },
  { key: "contact_messages", label: "Enquiries", roles: ["owner", "admin", "support"] },
  { key: "profiles", label: "Customers", roles: ["owner", "admin", "support"] },
  { key: "pending_orders", label: "Pending payments", roles: ["owner", "admin", "support"] },
  { key: "refunds", label: "Refunds", roles: ["owner", "admin"] },
  { key: "notification_outbox", label: "Notifications", roles: ["owner", "admin"] },
  { key: "webhook_events", label: "Payment events", roles: ["owner", "admin"] },
  { key: "staff_roles", label: "Staff access", roles: ["owner", "admin"] },
  { key: "settings", label: "Business & checkout", roles: ["owner", "admin"] },
  { key: "audit_log", label: "Audit log", roles: ["owner", "admin"] },
];
const workspaceGroups = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, resources: [] as string[] },
  {
    key: "orders",
    label: "Orders",
    icon: ShoppingBag,
    resources: ["orders", "pending_orders", "prescriptions", "refunds"],
  },
  { key: "products", label: "Products", icon: Package, resources: ["products", "categories"] },
  {
    key: "customers",
    label: "Customers",
    icon: Users,
    resources: ["profiles", "contact_messages"],
  },
  { key: "delivery", label: "Delivery", icon: Truck, resources: ["shipping_zones"] },
  { key: "content", label: "Health Tips", icon: BookOpen, resources: ["blog_posts"] },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    resources: ["settings", "staff_roles", "notification_outbox", "webhook_events", "audit_log"],
  },
];
const summaryCards = [
  { key: "paid_kobo", label: "Confirmed sales", section: "orders" },
  { key: "confirmed_orders", label: "Confirmed orders", section: "orders" },
  { key: "prescription_queue", label: "Prescription reviews", section: "prescriptions" },
  { key: "pending_payments", label: "Pending payments", section: "pending_orders" },
];
const dateFilteredSections = [
  "orders",
  "pending_orders",
  "prescriptions",
  "refunds",
  "profiles",
  "blog_posts",
  "contact_messages",
  "notification_outbox",
  "webhook_events",
  "audit_log",
];
const recordNames: Record<string, string> = {
  products: "products",
  categories: "category",
  inventory_batches: "product stock",
  shipping_zones: "delivery zone",
  blog_posts: "tips",
  staff_roles: "staff",
  profiles: "customer",
  orders: "order",
  pending_orders: "order",
};
export function PhotoUpload({
  value,
  onChange,
  label = "Photo",
  onUploadingChange,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file || !["image/jpeg", "image/png"].includes(file.type)) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-brand/25 bg-white text-brand/60">
          {preview || value ? (
            <img
              src={preview || value}
              alt={label + " preview"}
              className="h-full w-full object-contain"
            />
          ) : (
            <ImagePlus size={28} aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            disabled={busy}
            aria-describedby={id + "-info"}
            onChange={async (e) => {
              const input = e.currentTarget;
              const selected = input.files?.[0];
              if (!selected) return;
              setFile(selected);
              setBusy(true);
              onUploadingChange?.(true);
              try {
                const result = await uploadFile<{ images: { medium: string } }>("media", selected);
                onChange(result.images.medium);
                toast.success("Photo uploaded.");
              } catch (error) {
                setFile(null);
                setPreview("");
                notifyError(error);
              } finally {
                setBusy(false);
                onUploadingChange?.(false);
                input.value = "";
              }
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-brand/20 bg-white px-3 py-2 text-sm font-semibold text-brand hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60"
          >
            <Upload size={15} aria-hidden="true" />{" "}
            {busy ? "Uploading…" : value ? "Change photo" : "Choose photo"}
          </button>
          <p id={id + "-info"} className="truncate text-xs text-slate-500" title={file?.name}>
            {file?.name || (value ? "Photo uploaded" : "No photo chosen")}
          </p>
          <p className="text-xs text-slate-500">JPEG or PNG · Up to 10 MB</p>
        </div>
      </div>
      {busy && (
        <div
          role="progressbar"
          aria-label={"Uploading " + label.toLowerCase()}
          aria-valuetext="Uploading and processing photo"
          className="h-1.5 overflow-hidden rounded-full bg-blue-100"
        >
          <div className="h-full w-2/3 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
        </div>
      )}
    </div>
  );
}
export function AdminPage() {
  const queryClient = useQueryClient();
  const { user, loading } = useAccount();
  const [section, setSection] = useState("overview");
  const [group, setGroup] = useState("overview");
  const [bulk, setBulk] = useState(false);
  const [stockProduct, setStockProduct] = useState<any>(null);
  const [deleteDraft, setDeleteDraft] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const debouncedSearch = useDebouncedSearch(search);
  useEffect(() => {
    setQuery(debouncedSearch);
    setPage(0);
  }, [debouncedSearch]);
  const [editing, setEditing] = useState<any>(null);
  const [orderId, setOrderId] = useState("");
  const [listFilter, setListFilter] = useState("period=all");
  const [salesFilter, setSalesFilter] = useState(
    () => `period=month&month=${nigeriaDate().slice(0, 7)}`,
  );
  const salesRange = salesPeriod(new URLSearchParams(salesFilter));
  const displaySalesDate = (date: string | number) =>
    new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(
      new Date(date),
    );
  const accessible = sections.filter((s) => user?.roles.some((r) => s.roles.includes(r)));
  const navigation = workspaceGroups.filter(
    (g) => g.key === "overview" || accessible.some((s) => g.resources.includes(s.key)),
  );
  const tabs = accessible.filter((s) =>
    workspaceGroups.find((g) => g.key === group)?.resources.includes(s.key),
  );
  const navigate = (key: string) => {
    setGroup(key);
    setSection(
      workspaceGroups
        .find((g) => g.key === key)
        ?.resources.find((r) => accessible.some((s) => s.key === r)) || "overview",
    );
    setPage(0);
    setSearch("");
    setQuery("");
    setEditing(null);
    setOrderId("");
  };
  const active = section || accessible[0]?.key || "orders";
  const searchable = [
    "products",
    "categories",
    "profiles",
    "orders",
    "pending_orders",
    "prescriptions",
    "refunds",
    "blog_posts",
  ].includes(active);
  const enabled = !!user && hasMfaAccess(user) && accessible.some((s) => s.key === active);
  const activeDateFilter = dateFilteredSections.includes(active) ? listFilter : "period=all";
  const data = useQuery({
    queryKey: ["private", "admin", active, page, query, user?.id, activeDateFilter],
    queryFn: () =>
      api<{ rows: any[]; more: boolean }>(
        `admin/${active === "pending_orders" ? "orders" : active}?page=${page}&q=${encodeURIComponent(query)}${active === "pending_orders" ? "&view=pending" : ""}${activeDateFilter === "period=all" ? "" : `&${activeDateFilter}`}`,
      ),
    enabled,
    retry: false,
  });
  const summary = useQuery({
    queryKey: ["private", "admin-summary", user?.id, salesFilter],
    queryFn: () => api<Record<string, number>>(`admin/summary?${salesFilter}`),
    enabled:
      !!user &&
      hasMfaAccess(user) &&
      group === "overview" &&
      !!user?.roles.some((r) => ["owner", "admin"].includes(r)),
    retry: false,
  });
  const refresh = () => {
    void invalidateOrderData(queryClient);
  };
  const action = async (name: string, input: unknown) => {
    try {
      await send(`admin/actions/${name}`, input);
      toast.success("Changes saved.");
      refresh();
    } catch (error) {
      notifyError(error);
    }
  };
  const canWriteBlog = !!user?.roles.some((r) => ["owner", "admin", "editor"].includes(r));
  const editable =
    (active !== "blog_posts" || canWriteBlog) &&
    [
      "products",
      "categories",
      "inventory_batches",
      "shipping_zones",
      "blog_posts",
      "staff_roles",
    ].includes(active);
  if (loading || !user || !user.roles.length || !hasMfaAccess(user)) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6 sm:p-9">
          {loading ? (
            <SectionLoading label="Loading staff access" />
          ) : !user ? (
            <AuthForm />
          ) : !user.roles.length ? (
            <>
              <h1 className="text-2xl font-bold">Staff access required</h1>
              <Link to="/account" className="mt-5 inline-block text-brand underline">
                Go to my account
              </Link>
            </>
          ) : (
            <>
              <h1 className="mb-3 text-2xl font-bold">Secure your workspace</h1>
              <p className="mb-7 text-sm text-slate-500">
                Use your authenticator app to access administration.
              </p>
              <AuthenticatorPanel />
            </>
          )}
        </div>
      </SiteShell>
    );
  }
  return (
    <WorkspaceShell
      admin
      items={navigation}
      active={group}
      onNavigate={navigate}
      title={workspaceGroups.find((g) => g.key === group)?.label || "Administration"}
      subtitle={
        group === "overview"
          ? "Your pharmacy, organised. Everything you need to take care of today’s customers."
          : undefined
      }
    >
      {loading ? (
        <SectionLoading label="Loading staff access" />
      ) : !user ? (
        <AuthForm />
      ) : !user.roles.length ? (
        <p>
          You don’t have staff access.{" "}
          <Link to="/account" className="underline">
            Go to your account
          </Link>
        </p>
      ) : !hasMfaAccess(user) ? (
        <div>
          <h1 className="mb-6 text-3xl font-bold">Secure staff access</h1>
          <AuthenticatorPanel />
        </div>
      ) : (
        <div>
          {group === "overview" && (
            <div className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-brand p-6 text-white sm:p-8">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-200">
                  ReliefPoint workspace
                </p>
                <h2 className="text-2xl font-bold">
                  Welcome back, {user.name.split(" ")[0] || "there"}.
                </h2>
                <p className="mt-2 text-sm text-blue-100">A little more care, every day.</p>
              </div>
              {accessible.some((s) => s.key === "orders") && (
                <button
                  className="flex items-center gap-2 rounded-xl bg-[#B9FF00] px-5 py-3 text-sm font-bold text-brand"
                  onClick={() => navigate("orders")}
                >
                  View orders
                  <ArrowUpRight size={16} />
                </button>
              )}
            </div>
          )}
          {group === "overview" && user.roles.some((r) => ["owner", "admin"].includes(r)) && (
            <SalesDateFilter
              filter={salesFilter}
              onApply={setSalesFilter}
              busy={summary.isFetching}
            >
              <p className="mt-3 text-sm font-semibold">
                Showing:{" "}
                {salesRange.from && salesRange.to
                  ? `${displaySalesDate(salesRange.from)} – ${displaySalesDate(new Date(salesRange.to).getTime() - 1)}`
                  : "All time"}
              </p>
            </SalesDateFilter>
          )}
          {group === "overview" && summary.error && <Retry error={summary.error} retry={refresh} />}
          {group === "overview" && summary.isLoading && (
            <SectionLoading label="Loading pharmacy overview" />
          )}
          {group === "overview" && summary.data && (
            <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <button
                  key={card.key}
                  onClick={() => {
                    navigate(
                      workspaceGroups.find((g) => g.resources.includes(card.section))?.key ||
                        "orders",
                    );
                    setSection(card.section);
                  }}
                  className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand/30 sm:p-6"
                >
                  <p className="min-h-9 text-xs text-slate-500 sm:min-h-0 sm:text-sm">
                    {card.label}
                  </p>
                  <strong className="mt-2 block break-words text-xl font-bold sm:mt-3 sm:text-3xl">
                    {card.key === "paid_kobo"
                      ? formatNaira((summary.data[card.key] || 0) / 100)
                      : summary.data[card.key] || 0}
                  </strong>
                  <span className="mt-5 flex items-center gap-1 text-xs font-semibold text-brand">
                    View details
                    <ArrowUpRight size={13} />
                  </span>
                </button>
              ))}
            </div>
          )}
          {group === "overview" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
              <h2 className="mb-5 text-lg font-bold">Quick actions</h2>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                {navigation
                  .filter((g) => g.key !== "overview")
                  .map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => navigate(key)}
                      className="relative flex min-w-0 flex-col items-start gap-3 rounded-xl border border-slate-100 p-3 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
                    >
                      <span className="shrink-0 rounded-xl bg-blue-50 p-2.5 text-brand sm:p-3">
                        <Icon size={20} />
                      </span>
                      <span className="flex-1 text-sm font-semibold">{label}</span>
                      <ArrowUpRight
                        size={16}
                        className="absolute right-3 top-3 sm:static sm:shrink-0"
                      />
                    </button>
                  ))}
              </div>
            </section>
          )}
          {group !== "overview" && (
            <div className="space-y-6">
              <nav
                aria-label="Section tabs"
                className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5"
              >
                {tabs.map((s) => (
                  <button
                    key={s.key}
                    className={`shrink-0 rounded-lg px-4 py-2.5 text-left text-sm font-semibold ${active === s.key ? "bg-blue-50 text-brand" : "text-slate-500"}`}
                    onClick={() => {
                      setSection(s.key);
                      setPage(0);
                      setEditing(null);
                      setOrderId("");
                      setQuery("");
                      setSearch("");
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </nav>
              <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-bold">
                    {sections.find((s) => s.key === active)?.label}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {active === "products" &&
                      user.roles.some((r) => ["owner", "admin"].includes(r)) && (
                        <button
                          type="button"
                          className="flex items-center gap-2 rounded-lg border border-brand/20 px-4 py-2.5 text-sm font-semibold text-brand"
                          onClick={() => setBulk(true)}
                        >
                          <Upload size={16} /> Import products
                        </button>
                      )}
                    {(editable ||
                      active === "profiles" ||
                      (["orders", "pending_orders"].includes(active) &&
                        user.roles.some((r) => ["owner", "admin"].includes(r)))) && (
                      <button className="action-button" onClick={() => setEditing({})}>
                        <Plus size={16} className="mr-2" /> {`Add ${recordNames[active]}`}
                      </button>
                    )}
                  </div>
                </div>
                {dateFilteredSections.includes(active) && (
                  <SalesDateFilter
                    filter={listFilter}
                    onApply={(filter) => {
                      setPage(0);
                      setListFilter(filter);
                    }}
                    busy={data.isFetching}
                    title="Filter by date"
                  >
                    <p className="mt-2 text-xs text-slate-500">
                      {listFilter === "period=all"
                        ? "All dates"
                        : `Filtered by ${new URLSearchParams(listFilter).get("period")}`}
                      {active === "blog_posts" ? " · Last updated" : ""}
                    </p>
                  </SalesDateFilter>
                )}
                <form
                  className="mb-5 flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setPage(0);
                    // Searching is applied after the debounce.
                  }}
                >
                  {searchable && (
                    <>
                      <SearchInput
                        aria-label="Search records"
                        className="commerce-input min-w-0 flex-1 basis-40"
                        placeholder={
                          ["orders", "pending_orders", "prescriptions", "refunds"].includes(active)
                            ? "Search item, customer, email or reference"
                            : "Search"
                        }
                        value={search}
                        onValueChange={setSearch}
                      />
                    </>
                  )}
                </form>
                {data.error && <Retry error={data.error} retry={refresh} />}{" "}
                {active === "contact_messages" && (
                  <p className="mb-5 text-sm text-slate-500">
                    Messages submitted through your Contact page.
                  </p>
                )}
                {active === "pending_orders" && (
                  <p className="mb-5 text-sm text-slate-500">
                    Awaiting confirmation or payment review. These are not confirmed orders.
                  </p>
                )}
                {data.isLoading ? (
                  <SectionLoading label="Loading records" />
                ) : active === "settings" && data.data?.rows[0] ? (
                  <SettingsForm value={data.data.rows[0]} onSaved={refresh} />
                ) : active === "profiles" ? (
                  <CustomerTable rows={data.data?.rows ?? []} />
                ) : (
                  <div
                    className={
                      ["products", "shipping_zones"].includes(active)
                        ? "grid gap-4 md:grid-cols-2"
                        : "space-y-3"
                    }
                  >
                    {data.data?.rows.map((row, index) => (
                      <article
                        key={row.id ?? `${row.user_id}-${row.role}-${index}`}
                        className="rounded-xl border border-slate-100 bg-white p-4 transition hover:border-slate-200"
                      >
                        <div className="flex flex-wrap justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-4">
                            {active === "products" && row.image && (
                              <img
                                src={row.image}
                                alt=""
                                className="h-14 w-14 rounded-lg bg-slate-50 object-contain"
                              />
                            )}
                            <strong className="break-words">
                              {active === "staff_roles"
                                ? row.name || row.email || "Staff member"
                                : (row.title ??
                                  row.name ??
                                  row.public_reference ??
                                  row.reference ??
                                  row.subject ??
                                  row.email ??
                                  row.lot ??
                                  row.action ??
                                  row.role ??
                                  (active === "shipping_zones"
                                    ? [row.state, row.lga, row.area].filter(Boolean).join(" · ")
                                    : active === "prescriptions"
                                      ? "Prescription"
                                      : active === "refunds"
                                        ? "Refund request"
                                        : "Activity"))}
                            </strong>
                          </div>
                          <div className="flex gap-3 text-sm">
                            {active === "categories" && (
                              <button
                                className="font-semibold text-brand"
                                onClick={() => setEditing({ ...row, pickProducts: true })}
                              >
                                Manage products
                              </button>
                            )}
                            {["products", "shipping_zones", "blog_posts"].includes(active) &&
                              (active !== "blog_posts" || canWriteBlog) && (
                                <button
                                  className="inline-flex min-h-10 items-center rounded-lg border border-brand/20 bg-blue-50 px-4 py-2 text-sm font-semibold text-brand hover:bg-blue-100"
                                  onClick={() =>
                                    void api<{ row: any }>(
                                      `admin/record?resource=${active}&id=${row.id}`,
                                    )
                                      .then((result) => setEditing(result.row))
                                      .catch(notifyError)
                                  }
                                >
                                  Edit
                                </button>
                              )}
                            {row.order_id && (
                              <button
                                className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:brightness-110"
                                onClick={() => setOrderId(row.order_id)}
                              >
                                View order
                              </button>
                            )}
                            {["orders", "pending_orders"].includes(active) && (
                              <button
                                className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:brightness-110"
                                onClick={() => setOrderId(row.id)}
                              >
                                {active === "pending_orders" ? "Review payment" : "View order"}
                              </button>
                            )}
                          </div>
                        </div>
                        {active === "staff_roles" && row.email && row.name && (
                          <p className="mt-1 break-all text-sm text-slate-500">{row.email}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                          {[
                            "status",
                            "payment_status",
                            "provider_status",
                            "fulfillment_status",
                            "prescription_status",
                            "category",
                            "state",
                            "lga",
                            "area",
                            "estimate",
                            "quantity",
                            "available",
                            "phone",
                            "role",
                            "created_at",
                            "attempts",
                            "reason",
                          ]
                            .filter(
                              (key) =>
                                row[key] !== undefined &&
                                !(active === "staff_roles" && key === "phone" && !row[key]) &&
                                !(key === "prescription_status" && row[key] === "not_required"),
                            )
                            .map((key) => (
                              <span
                                key={key}
                                className={
                                  key === "expires_on" &&
                                  row[key] <=
                                    new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
                                    ? "font-semibold text-red-700"
                                    : ""
                                }
                              >
                                <span className="inline-block rounded-full bg-slate-50 px-2.5 py-1 text-xs capitalize">
                                  {key === "created_at"
                                    ? receiptDate(row[key]) + " WAT"
                                    : key === "fulfillment_status"
                                      ? trackingLabel(row[key])
                                      : key === "prescription_status"
                                        ? "Prescription: " + String(row[key]).replaceAll("_", " ")
                                        : key === "available"
                                          ? `${row[key]} in stock`
                                          : active === "staff_roles" &&
                                              ["role", "phone"].includes(key)
                                            ? `${key === "role" ? "Role" : "Phone"}: ${String(row[key]).replaceAll("_", " ")}`
                                            : String(row[key]).replaceAll("_", " ")}
                                </span>
                              </span>
                            ))}
                          {[
                            "expected_amount",
                            "received_amount",
                            "provider_fee",
                            "amount",
                            "fee_kobo",
                          ]
                            .filter((key) => row[key] != null)
                            .map((key) => (
                              <span key={key}>
                                {key === "fee_kobo" ? "Fee" : key.replaceAll("_", " ")}:{" "}
                                {formatNaira(row[key] / 100)}
                              </span>
                            ))}
                          {row.total !== undefined && <span>{formatNaira(row.total / 100)}</span>}
                          {row.price_kobo !== undefined && (
                            <span>{formatNaira(row.price_kobo / 100)}</span>
                          )}
                        </div>
                        {row.contact && (
                          <p className="mt-3 text-sm">
                            {row.contact.name} · {row.contact.email} · {row.contact.phone}
                          </p>
                        )}
                        {row.message && (
                          <p className="mt-3 whitespace-pre-wrap text-sm">{row.message}</p>
                        )}
                        {active === "blog_posts" && (
                          <Link
                            to="/health-tips/preview/$id"
                            params={{ id: row.id }}
                            className="mt-3 inline-block text-sm underline"
                          >
                            Preview article
                          </Link>
                        )}
                        {active === "blog_posts" &&
                          row.reviewer_id === user.id &&
                          user.roles.includes("pharmacist") &&
                          !row.reviewed_at && (
                            <button
                              className="ml-4 underline"
                              onClick={() => void action("approve-post-review", { id: row.id })}
                            >
                              Approve pharmacist review
                            </button>
                          )}
                        {active === "products" && (
                          <button
                            className="mt-3 mr-4 text-sm font-semibold text-brand"
                            onClick={() => setStockProduct(row)}
                          >
                            Add stock
                          </button>
                        )}
                        {active === "products" &&
                          !row.active &&
                          user.roles.some((r) => ["owner", "admin"].includes(r)) && (
                            <button
                              className="mt-3 text-sm underline"
                              onClick={() => setDeleteDraft(row)}
                            >
                              Delete unused draft
                            </button>
                          )}
                        {active === "prescriptions" && (
                          <button
                            className="mt-3 underline"
                            onClick={() =>
                              void send<{ url: string }>("admin/actions/prescription-view", {
                                id: row.id,
                              })
                                .then((r) => window.open(r.url, "_blank", "noopener,noreferrer"))
                                .catch(notifyError)
                            }
                          >
                            View prescription securely
                          </button>
                        )}
                        {active === "contact_messages" && (
                          <button
                            className="mt-3 underline"
                            onClick={() =>
                              void send("admin/contact_messages", {
                                id: row.id,
                                resolved: !row.resolved,
                              })
                                .then(() => {
                                  refresh();
                                  toast.success("Inbox updated.");
                                })
                                .catch(notifyError)
                            }
                          >
                            {row.resolved ? "Reopen" : "Mark resolved"}
                          </button>
                        )}
                        {active === "notification_outbox" && row.status === "failed" && (
                          <button
                            className="mt-3 underline"
                            onClick={() => void action("retry-mail", { id: row.id })}
                          >
                            Retry email
                          </button>
                        )}
                        {active === "staff_roles" &&
                          row.user_id !== user.id &&
                          (user.roles.includes("owner") || row.role !== "owner") && (
                            <button
                              className="mt-3 underline"
                              onClick={() =>
                                void send("admin/staff_roles", {
                                  user_id: row.user_id,
                                  role: row.role,
                                  remove: true,
                                })
                                  .then(() => {
                                    refresh();
                                    toast.success("Staff access updated.");
                                  })
                                  .catch(notifyError)
                              }
                            >
                              Remove this role
                            </button>
                          )}
                      </article>
                    ))}
                  </div>
                )}
                {data.data?.rows.length === 0 && (
                  <EmptyWorkspace
                    title={
                      active === "orders"
                        ? "No confirmed orders yet"
                        : active === "pending_orders"
                          ? "No pending payments"
                          : active === "shipping_zones"
                            ? "No delivery zones yet"
                            : "Nothing here yet"
                    }
                    description={
                      active === "orders"
                        ? "Purchases appear here after payment is verified."
                        : active === "shipping_zones"
                          ? "Add a zone with a state, LGA, delivery fee and estimate to make its area available at checkout."
                          : "New records will appear in this section."
                    }
                  />
                )}
                {active !== "settings" && (
                  <Pagination page={page} more={data.data?.more ?? false} onChange={setPage} />
                )}
                <WorkspaceModal
                  open={!!deleteDraft}
                  onClose={() => setDeleteDraft(null)}
                  title="Delete unused draft?"
                  description="Products with stock or purchase history will stay archived."
                >
                  <button
                    className="action-button"
                    onClick={async () => {
                      try {
                        await send("admin/actions/delete-draft", { id: deleteDraft.id });
                        setDeleteDraft(null);
                        refresh();
                        toast.success("Draft deleted.");
                      } catch (error) {
                        notifyError(error);
                      }
                    }}
                  >
                    Delete draft
                  </button>
                </WorkspaceModal>
                <WorkspaceModal
                  open={!!orderId}
                  onClose={() => setOrderId("")}
                  title={active === "pending_orders" ? "Payment details" : "Order details"}
                >
                  {orderId && (
                    <OrderView
                      id={orderId}
                      admin
                      onUpdate={(status) => {
                        refresh();
                        if (status && ["paid", "partially_refunded", "refunded"].includes(status)) {
                          setSection("orders");
                          setPage(0);
                          setSearch("");
                          setQuery("");
                          setListFilter("period=all");
                        }
                      }}
                    />
                  )}
                </WorkspaceModal>
                <WorkspaceModal
                  open={!!editing}
                  onClose={() => setEditing(null)}
                  size={
                    active === "shipping_zones"
                      ? "compact"
                      : ["categories", "profiles", "orders", "pending_orders"].includes(active)
                        ? "medium"
                        : "wide"
                  }
                  title={`${active === "categories" && editing?.id ? "Manage" : editing?.id ? "Edit" : "Add"} ${active === "products" && editing?.id ? "product" : recordNames[active] || sections.find((s) => s.key === active)?.label.toLowerCase()}`}
                >
                  {editing && ["orders", "pending_orders"].includes(active) ? (
                    <AdminOrderForm
                      onCreated={(status) => {
                        refresh();
                        setSection(
                          ["paid", "partially_refunded", "refunded"].includes(status)
                            ? "orders"
                            : "pending_orders",
                        );
                        setPage(0);
                        setSearch("");
                        setQuery("");
                        setListFilter("period=all");
                      }}
                      onView={(id, status) => {
                        setEditing(null);
                        setSection(
                          ["paid", "partially_refunded", "refunded"].includes(status)
                            ? "orders"
                            : "pending_orders",
                        );
                        setPage(0);
                        setOrderId(id);
                      }}
                    />
                  ) : editing && active === "categories" ? (
                    <CategoryManager
                      key={editing.id || "new"}
                      row={editing}
                      onSaved={(row) => {
                        setEditing(row);
                        refresh();
                      }}
                    />
                  ) : editing && active === "staff_roles" ? (
                    <StaffInvite
                      onSaved={() => {
                        setEditing(null);
                        refresh();
                      }}
                      canGrantOwner={user.roles.includes("owner")}
                    />
                  ) : editing && active === "profiles" ? (
                    <CustomerInvite
                      onSaved={() => {
                        setEditing(null);
                        refresh();
                      }}
                    />
                  ) : (
                    editing && (
                      <AdminEditor
                        key={active + (editing.id || "new")}
                        resource={active}
                        row={editing}
                        onSaved={() => {
                          setEditing(null);
                          refresh();
                        }}
                      />
                    )
                  )}
                </WorkspaceModal>
                <WorkspaceModal
                  open={bulk}
                  onClose={() => setBulk(false)}
                  title="Import products"
                  size="compact"
                >
                  <BulkProducts onSaved={refresh} />
                </WorkspaceModal>
                <WorkspaceModal
                  open={!!stockProduct}
                  onClose={() => setStockProduct(null)}
                  title="Add product stock"
                  description={stockProduct?.name}
                >
                  {stockProduct && (
                    <AdminEditor
                      resource="inventory_batches"
                      row={{ product_id: stockProduct.id }}
                      onSaved={() => {
                        setStockProduct(null);
                        refresh();
                      }}
                    />
                  )}
                </WorkspaceModal>
              </section>
            </div>
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}
function BulkProducts({ onSaved }: { onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ row: number; error?: string }[]>([]);
  const [importProgress, setImportProgress] = useState<{ completed: number; total: number } | null>(
    null,
  );
  return (
    <div className="mb-6 space-y-3 rounded-xl bg-secondary p-4">
      <div className="flex flex-wrap items-center gap-5">
        <label className="text-sm font-semibold">
          Import product file
          <input
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:font-semibold file:text-white"
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                toast.error("Choose an import file up to 10 MB.");
                return;
              }
              setBusy(true);
              try {
                let records: unknown;
                try {
                  records = JSON.parse(await file.text());
                } catch {
                  toast.error("This file isn’t valid JSON. Please check the product file format.");
                  return;
                }
                if (!Array.isArray(records)) {
                  toast.error("Choose a JSON file containing a list of products.");
                  return;
                }
                const outcomes = await importProductBatches(
                  records,
                  (batch) => send("admin/product-import", batch),
                  (outcomes, total) => {
                    setReport(outcomes);
                    setImportProgress({ completed: outcomes.length, total });
                  },
                );
                const saved = outcomes.filter((r) => !r.error).length;
                toast.success(`${saved} products imported.`);
                onSaved();
              } catch (error) {
                notifyError(error);
                onSaved();
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
      </div>
      {importProgress && (
        <div className="space-y-2">
          <p role="status" className="text-sm">
            {importProgress.completed} of {importProgress.total} products checked
          </p>
          <progress
            aria-label="Product import"
            className="h-2 w-full accent-brand"
            max={importProgress.total || 1}
            value={importProgress.completed}
          />
        </div>
      )}
      <p className="text-xs">
        JSON files up to 10 MB. Products import in batches of 20. Use photos already uploaded
        through this store.
      </p>
      {report
        .filter((r) => r.error)
        .map((r) => (
          <p key={r.row} className="text-sm text-red-700">
            Row {r.row}: {r.error}
          </p>
        ))}
    </div>
  );
}

function AdminEditor({
  resource,
  row,
  onSaved,
}: {
  resource: string;
  row: any;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState(row.category ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"delivery" | "pickup">(
    row.fulfillment_method ?? "delivery",
  );
  const [photo, setPhoto] = useState(row.image ?? row.cover ?? "");
  const [blocks, setBlocks] = useState<any[]>(row.blocks ?? [{ type: "paragraph", text: "" }]);
  const [priceError, setPriceError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const product = resource === "products",
    blog = resource === "blog_posts";
  const categories = useQuery({
    queryKey: ["private", "product-category-options"],
    enabled: product,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const names = new Set<string>();
      let page = 0;
      let more: boolean;
      do {
        const result = await api<{ rows: { name: string }[]; more: boolean }>(
          `admin/categories?page=${page}`,
        );
        result.rows.forEach((category) => names.add(category.name));
        more = result.more;
        page += 1;
      } while (more);
      return [...names].sort((a, b) => a.localeCompare(b));
    },
  });
  const createCategory = async () => {
    if (categorySaving) return;
    const name = newCategory.trim();
    if (name.length < 2 || name.length > 80) {
      toast.error("Enter a category name between 2 and 80 characters.");
      return;
    }
    setCategorySaving(true);
    try {
      await send("admin/categories", { name });
      queryClient.setQueryData<string[]>(["private", "product-category-options"], (current = []) =>
        [...new Set([...current, name])].sort(),
      );
      setSelectedCategory(name);
      setNewCategory("");
      setShowNewCategory(false);
      void queryClient.invalidateQueries({ queryKey: ["private", "admin", "categories"] });
      toast.success("Category created and selected.");
    } catch (error) {
      notifyError(error);
    } finally {
      setCategorySaving(false);
    }
  };
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPriceError("");
    if (photoUploading) return;
    if ((product || blog) && !photo) {
      toast.error(
        product ? "Upload a product photo before saving." : "Upload a cover photo before saving.",
      );
      return;
    }
    if (blog && (!blocks.length || blocks.some((b) => b.type === "image" && !b.src))) {
      toast.error("Add article content and upload a photo for each image block.");
      return;
    }
    setBusy(true);
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form));
    let input: any = { ...d };
    if (row.id) input.id = row.id;
    if (product)
      input = {
        ...input,
        price_kobo: Math.round(Number(d["price"]) * 100),
        discount_price_kobo: d["discount_price"]
          ? Math.round(Number(d["discount_price"]) * 100)
          : null,
        cost_price_kobo: d["cost_price"] ? Math.round(Number(d["cost_price"]) * 100) : null,
        image: photo,
        active: d["active"] === "on",
        prescription: d["prescription"] === "on",
        deal: d["deal"] === "on",
      };
    if (blog) input = { ...input, cover: photo, blocks, reviewer_id: d["reviewer_id"] || null };
    if (resource === "inventory_batches") input.quantity = Number(d["quantity"]);
    if (resource === "shipping_zones")
      input = {
        ...input,
        fulfillment_method: fulfillmentMethod,
        state: fulfillmentMethod === "pickup" ? "Pickup" : d["state"],
        lga: fulfillmentMethod === "pickup" ? "Pharmacy" : d["lga"],
        fee_kobo: fulfillmentMethod === "pickup" ? 0 : Math.round(Number(d["fee"]) * 100),
        free_over_kobo:
          fulfillmentMethod !== "pickup" && d["free"] ? Math.round(Number(d["free"]) * 100) : null,
        active: d["active"] === "on",
      };
    try {
      if (product) {
        const validated = productSchema.safeParse(input);
        if (!validated.success) {
          form.querySelector("details")?.setAttribute("open", "");
          setPriceError(
            validated.error.issues.find((issue) => issue.path[0] === "discount_price_kobo")
              ?.message ?? "",
          );
          toast.error(
            validated.error.issues[0]?.message ?? "Check the product details and try again.",
          );
          return;
        }
        input = validated.data;
      }
      await send(`admin/${resource}`, input);
      toast.success("Changes saved.");
      onSaved();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <form
        className={product ? "grid items-start gap-5 md:grid-cols-2" : "space-y-5"}
        onSubmit={save}
      >
        {(product || blog) && (
          <>
            <Field
              label={blog ? "Title" : "Product name"}
              name={blog ? "title" : "name"}
              defaultValue={row.title ?? row.name ?? ""}
              required
              onBlur={(e) => {
                const slug = e.currentTarget.form?.elements.namedItem(
                  "slug",
                ) as HTMLInputElement | null;
                if (slug && !slug.value) slug.value = slugify(e.target.value);
              }}
            />
            {blog && (
              <Field
                label="Page name"
                name="slug"
                defaultValue={row.slug ?? ""}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            )}
            {product ? (
              <div className="space-y-2">
                <label className="block text-sm font-semibold">
                  Category
                  <select
                    aria-label="Category"
                    name="category"
                    className="commerce-input mt-2"
                    value={selectedCategory}
                    onChange={(event) => setSelectedCategory(event.target.value)}
                    disabled={categorySaving || categories.isPending || !!categories.error}
                    required
                  >
                    <option value="">
                      {categories.isPending ? "Loading categories…" : "Select category"}
                    </option>
                    {[
                      ...new Set([
                        ...(categories.data ?? []),
                        ...(selectedCategory ? [selectedCategory as string] : []),
                      ]),
                    ].map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                {categories.error && (
                  <Retry error={categories.error} retry={() => void categories.refetch()} />
                )}
                <button
                  type="button"
                  className="text-sm font-semibold text-brand underline"
                  disabled={categorySaving}
                  onClick={() => setShowNewCategory(true)}
                >
                  + New category
                </button>
              </div>
            ) : (
              <Field label="Category" name="category" defaultValue={row.category ?? ""} required />
            )}
            <PhotoUpload
              value={photo}
              onChange={setPhoto}
              label={blog ? "Cover photo" : "Product photo"}
              onUploadingChange={setPhotoUploading}
            />
            {blog && (
              <Field
                label="Photo description"
                name={blog ? "cover_alt" : "image_alt"}
                defaultValue={row.cover_alt ?? row.image_alt ?? ""}
                required
                minLength={3}
              />
            )}
          </>
        )}
        {product && (
          <>
            <div className="space-y-4">
              <Field
                label="Price (₦)"
                name="price"
                type="number"
                min="1"
                step="0.01"
                defaultValue={row.price_kobo ? row.price_kobo / 100 : ""}
                required
              />
              <Field
                label="Cost price (₦)"
                name="cost_price"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                defaultValue={row.cost_price_kobo == null ? "" : row.cost_price_kobo / 100}
              />
            </div>
            <details className="rounded-xl border border-slate-200 p-4 md:col-span-2">
              <summary className="cursor-pointer text-sm font-semibold">
                More details (optional)
              </summary>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div className="grid gap-5 sm:grid-cols-2 md:col-span-2">
                  <div>
                    <Field
                      label="Discount price (₦)"
                      name="discount_price"
                      type="number"
                      min="1"
                      max="1000000"
                      step="0.01"
                      aria-invalid={!!priceError}
                      aria-describedby={priceError ? "discount-price-error" : undefined}
                      defaultValue={
                        row.discount_price_kobo == null ? "" : row.discount_price_kobo / 100
                      }
                    />
                    {priceError && (
                      <p id="discount-price-error" className="mt-2 text-sm text-red-700">
                        {priceError}
                      </p>
                    )}
                  </div>
                </div>
                <Field label="Brand" name="brand" defaultValue={row.brand ?? ""} maxLength={80} />
                <Field
                  label="Page name"
                  name="slug"
                  defaultValue={row.slug ?? ""}
                  placeholder="Created from product name"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                />
                <Field
                  label="Photo description"
                  name="image_alt"
                  defaultValue={row.image_alt ?? ""}
                  placeholder="Uses product name if left blank"
                  minLength={3}
                  maxLength={250}
                />
                {["detail", "directions", "storage"].map((key) => (
                  <label key={key} className="block text-sm font-semibold capitalize">
                    {key === "detail"
                      ? "Description / pack size"
                      : key === "directions"
                        ? "Directions"
                        : "Storage"}
                    <textarea
                      className="commerce-input mt-2"
                      name={key}
                      defaultValue={row[key] ?? ""}
                      maxLength={key === "directions" ? 4000 : 2000}
                    />
                  </label>
                ))}
              </div>
            </details>
            <div className="flex flex-wrap gap-5 md:col-span-2">
              {["active", "prescription", "deal"].map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm capitalize">
                  <input name={key} type="checkbox" defaultChecked={row[key] ?? false} />
                  {key === "active"
                    ? "Visible in store"
                    : key === "prescription"
                      ? "Prescription required"
                      : "Featured deal"}
                </label>
              ))}
            </div>
          </>
        )}
        {blog && (
          <>
            <label className="block text-sm font-semibold">
              Summary
              <textarea
                name="summary"
                className="commerce-input mt-2"
                defaultValue={row.summary ?? ""}
                required
                minLength={10}
                maxLength={400}
              />
            </label>
            <Field
              label="Instagram post or reel (optional)"
              name="instagram"
              type="url"
              defaultValue={row.instagram ?? ""}
            />
            <Field
              label="Pharmacist reviewer ID (optional)"
              name="reviewer_id"
              defaultValue={row.reviewer_id ?? ""}
            />
            <div className="space-y-4">
              <h3 className="font-bold">Article</h3>
              {blocks.map((block, index) => (
                <div key={index} className="space-y-3 rounded-xl border bg-white p-4">
                  <div className="flex justify-between">
                    <strong className="capitalize">{block.type}</strong>
                    <div className="flex gap-3 text-sm">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() =>
                          setBlocks((current) => {
                            const next = [...current];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            return next;
                          })
                        }
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setBlocks((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {block.type === "image" ? (
                    <>
                      <PhotoUpload
                        value={block.src}
                        onChange={(value) =>
                          setBlocks((current) =>
                            current.map((b, i) => (i === index ? { ...b, src: value } : b)),
                          )
                        }
                      />
                      <Field
                        label="Image description"
                        value={block.alt}
                        required
                        onChange={(e) =>
                          setBlocks((current) =>
                            current.map((b, i) =>
                              i === index ? { ...b, alt: e.target.value } : b,
                            ),
                          )
                        }
                      />
                    </>
                  ) : (
                    <textarea
                      aria-label={`${block.type} ${index + 1}`}
                      className="commerce-input min-h-28"
                      value={block.text}
                      required
                      onChange={(e) =>
                        setBlocks((current) =>
                          current.map((b, i) => (i === index ? { ...b, text: e.target.value } : b)),
                        )
                      }
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-4">
                {["paragraph", "heading", "image"].map((type) => (
                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    key={type}
                    type="button"
                    onClick={() =>
                      setBlocks((current) => [
                        ...current,
                        type === "image" ? { type, src: "", alt: "" } : { type, text: "" },
                      ])
                    }
                  >
                    Add {type}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-sm font-semibold">
              Publication status
              <select
                name="status"
                className="commerce-input mt-2"
                defaultValue={row.status ?? "draft"}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </>
        )}
        {resource === "inventory_batches" && (
          <>
            <input type="hidden" name="product_id" value={row.product_id} />
            <Field label="Quantity to add" name="quantity" type="number" min="1" required />
          </>
        )}
        {resource === "shipping_zones" && (
          <>
            <label className="block text-sm font-semibold">
              Fulfillment method
              <select
                aria-label="Fulfillment method"
                className="commerce-input mt-2"
                value={fulfillmentMethod}
                onChange={(event) =>
                  setFulfillmentMethod(event.target.value as "delivery" | "pickup")
                }
              >
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup</option>
              </select>
            </label>
            {fulfillmentMethod === "delivery" && (
              <>
                <label className="block text-sm font-semibold">
                  State / FCT
                  <select
                    aria-label="State / FCT"
                    className="commerce-input mt-2"
                    name="state"
                    defaultValue={deliveryState(row.state ?? "")}
                    required
                  >
                    <option value="">Select state</option>
                    {nigerianStates.map((state) => (
                      <option key={state}>{state}</option>
                    ))}
                  </select>
                </label>
                <Field label="LGA / city" name="lga" defaultValue={row.lga ?? ""} required />
              </>
            )}
            <Field
              label={fulfillmentMethod === "pickup" ? "Pickup location" : "Area"}
              name="area"
              defaultValue={row.area ?? ""}
              required={fulfillmentMethod === "pickup"}
              maxLength={100}
            />
            <Field
              label={
                fulfillmentMethod === "pickup"
                  ? "Estimated collection time"
                  : "Estimated Delivery Time"
              }
              name="estimate"
              defaultValue={row.estimate ?? ""}
              required
            />
            {fulfillmentMethod === "delivery" && (
              <>
                <Field
                  label="Fee (NGN)"
                  name="fee"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={row.fee_kobo ? row.fee_kobo / 100 : 0}
                  required
                />
                <Field
                  label="Free delivery from (NGN, optional)"
                  name="free"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={row.free_over_kobo ? row.free_over_kobo / 100 : ""}
                />
              </>
            )}
            <label className="flex gap-2">
              <input name="active" type="checkbox" defaultChecked={row.active ?? true} />
              Available at checkout
            </label>
          </>
        )}
        {resource === "staff_roles" && (
          <>
            <Field label="Customer account ID" name="user_id" required />
            <label className="block">
              Role
              <select name="role" className="commerce-input mt-2">
                {roles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <button
          className="action-button justify-self-start"
          disabled={
            busy ||
            photoUploading ||
            categorySaving ||
            (product && (categories.isPending || !!categories.error))
          }
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        {busy && (
          <div className={product ? "space-y-2 md:col-span-2" : "space-y-2"}>
            <p role="status" className="text-xs text-slate-500">
              Saving changes…
            </p>
            <div
              role="progressbar"
              aria-label="Saving changes"
              className="h-1.5 overflow-hidden rounded-full bg-blue-100"
            >
              <div className="h-full w-2/3 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
            </div>
          </div>
        )}
      </form>
      {product && (
        <WorkspaceModal
          open={showNewCategory}
          onClose={() => {
            if (!categorySaving) setShowNewCategory(false);
          }}
          title="Create category"
          size="compact"
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void createCategory();
            }}
          >
            <Field
              label="New category name"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              required
              minLength={2}
              maxLength={80}
              disabled={categorySaving}
              autoFocus
            />
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="action-button" disabled={categorySaving}>
                {categorySaving ? "Creating..." : "Create category"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-secondary"
                disabled={categorySaving}
                onClick={() => setShowNewCategory(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </WorkspaceModal>
      )}
    </>
  );
}
function CustomerTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <EmptyWorkspace title="No customers found" />;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[780px] text-left text-sm">
        <caption className="sr-only">Customers and contact details</caption>
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            {[
              "Customer",
              "Email address",
              "Phone number",
              "Delivery addresses",
              "Account",
              "Joined",
            ].map((name) => (
              <th key={name} scope="col" className="px-4 py-3 font-semibold">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="px-4 py-4 font-semibold">{row.name || "Name not provided"}</td>
              <td className="px-4 py-4">
                {row.email ? (
                  <a className="text-brand hover:underline" href={`mailto:${row.email}`}>
                    {row.email}
                  </a>
                ) : (
                  "Not provided"
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-4">
                {customerWhatsApp(row.phone) ? (
                  <a
                    href={customerWhatsApp(row.phone)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline"
                    aria-label={`WhatsApp ${row.name || row.phone}`}
                  >
                    {row.phone}
                  </a>
                ) : (
                  row.phone || "Not provided"
                )}
              </td>
              <td className="min-w-52 px-4 py-4">
                {row.addresses?.length
                  ? row.addresses.map((address: any) => (
                      <p key={address.id} className="mb-2 last:mb-0">
                        {[address.address, address.lga, address.state].filter(Boolean).join(", ")}
                      </p>
                    ))
                  : row.last_delivery?.address
                    ? [row.last_delivery.address, row.last_delivery.lga, row.last_delivery.state]
                        .filter(Boolean)
                        .join(", ")
                    : "No delivery address"}
              </td>
              <td className="px-4 py-4">
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-1 text-xs ${row.email_confirmed_at ? "bg-blue-50 text-brand" : "bg-amber-50 text-amber-800"}`}
                >
                  {row.email_confirmed_at ? "Email verified" : "Awaiting verification"}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-4">
                {new Intl.DateTimeFormat("en-NG", {
                  dateStyle: "medium",
                  timeZone: "Africa/Lagos",
                }).format(new Date(row.created_at))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffInvite({ onSaved, canGrantOwner }: { onSaved: () => void; canGrantOwner: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-5 md:grid-cols-2"
      onInvalidCapture={() =>
        toast.error("Check the highlighted staff details.", { id: "staff-validation" })
      }
      onSubmit={async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.currentTarget));
        setBusy(true);
        try {
          const result = await send<{ message: string }>("admin/staff-invite", values);
          toast.success(result.message);
          onSaved();
        } catch (error) {
          notifyError(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Full name" name="name" required minLength={2} maxLength={100} />
      <Field label="Email address" name="email" type="email" required maxLength={180} />
      <label className="block text-sm font-semibold">
        Role
        <select name="role" className="commerce-input mt-2 capitalize" defaultValue="admin">
          {roles
            .filter((role) => canGrantOwner || role !== "owner")
            .map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
        </select>
      </label>
      <p className="text-sm text-slate-500 md:col-span-2">
        Existing verified accounts receive access. New staff receive an email invitation and must
        set up an authenticator.
      </p>
      <button className="action-button justify-self-start" disabled={busy}>
        {busy ? "Adding staff…" : "Add staff"}
      </button>
    </form>
  );
}

function SettingsForm({ value, onSaved }: { value: any; onSaved: () => void }) {
  const [logo, setLogo] = useState(value.public_data?.pcn_logo ?? "");
  const [busy, setBusy] = useState(false);
  const readiness = useQuery({
    queryKey: ["private", "admin-checkout-readiness"],
    queryFn: () => api<CheckoutReadiness>("admin/checkout-readiness"),
    staleTime: 60000,
    retry: false,
  });
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const d = Object.fromEntries(new FormData(e.currentTarget));
        const public_data = Object.fromEntries(
          [
            "address",
            "opening_hours",
            "instagram_url",
            "facebook_url",
            "tiktok_url",
            "privacy_text",
            "refund_text",
            "shipping_text",
            "terms_text",
          ].map((k) => [k, d[k] ?? ""]),
        );
        try {
          await send("admin/settings", {
            public_data: { ...public_data, pcn_logo: logo },
            checkout_enabled: d["checkout_enabled"] === "on",
            launch_approved: d["launch_approved"] === "on",
            refund_fee_policy: d["refund_fee_policy"] || null,
            prescription_retention_days: d["prescription_retention_days"]
              ? Number(d["prescription_retention_days"])
              : null,
            ...Object.fromEntries(
              ["fee_rate", "fee_fixed", "fee_threshold", "fee_cap"].map((k) => [
                k,
                Math.round(Number(d[k]) * 100),
              ]),
            ),
          });
          toast.success("Business settings saved.");
          void readiness.refetch();
          onSaved();
        } catch (error) {
          notifyError(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      <section className="rounded-xl border border-slate-200 p-4" aria-label="Checkout status">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">Checkout status</h3>
          <button
            type="button"
            className="text-sm font-semibold text-brand underline"
            disabled={readiness.isFetching}
            onClick={() => void readiness.refetch()}
          >
            Recheck
          </button>
        </div>
        {readiness.isPending && <SectionLoading label="Checking checkout" compact />}
        {readiness.error && (
          <Retry error={readiness.error} retry={() => void readiness.refetch()} />
        )}
        {readiness.data && (
          <>
            <p className="mt-3 text-sm font-semibold">
              {readiness.data.available ? "Ready for checkout" : "Checkout is blocked"}
              {readiness.data.mode !== "unconfigured"
                ? ` · Paystack ${readiness.data.mode} mode`
                : ""}
            </p>
            {readiness.data.available && (
              <p className="mt-2 text-sm text-slate-500">
                {readiness.data.mode === "test"
                  ? "Test payments only. No live charges."
                  : "Configuration checks passed. Verify email delivery and a controlled payment/refund before opening unrestricted purchases."}
              </p>
            )}
            {!readiness.data.available && (
              <ul className="mt-3 space-y-2 text-sm" aria-label="Checkout requirements">
                {readiness.data.checks
                  .filter((check) => !check.ready)
                  .map((check) => (
                    <li key={check.key} className="flex gap-2">
                      <span aria-hidden="true" className="text-amber-700">
                        •
                      </span>
                      <span>{check.label}</span>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </section>
      <p className="rounded-xl bg-secondary p-4 text-sm">
        Live checkout requires completed business information, approved policies and launch
        approval.
      </p>
      {[
        ["address", "Business address"],
        ["opening_hours", "Opening hours"],
        ["privacy_text", "Privacy policy"],
        ["refund_text", "Refund policy"],
        ["shipping_text", "Shipping policy"],
        ["terms_text", "Terms and Conditions"],
      ].map(([key, label]) => (
        <details
          key={key}
          open={key === "address" || key === "opening_hours"}
          className="rounded-xl border border-slate-200 px-4 py-3"
        >
          <summary className="cursor-pointer text-sm font-semibold">{label}</summary>
          <label className="mt-3 block text-sm">
            <span className="sr-only">{label}</span>
            <textarea
              name={key}
              defaultValue={
                value.public_data?.[key!] || (policyDefaults as Record<string, string>)[key!] || ""
              }
              className="commerce-input mt-2 min-h-28"
            />
          </label>
        </details>
      ))}
      <section className="grid gap-4 sm:grid-cols-2" aria-label="Social profiles">
        {socialProfiles.map((profile) => (
          <Field
            key={profile.key}
            name={profile.key}
            label={`${profile.label} link`}
            type="url"
            defaultValue={value.public_data?.[profile.key] ?? profile.url}
          />
        ))}
      </section>
      <PhotoUpload value={logo} onChange={setLogo} label="Authorised PCN artwork" />
      <label className="block text-sm font-semibold">
        Refund treatment of processing fees
        <select
          name="refund_fee_policy"
          defaultValue={value.refund_fee_policy ?? ""}
          className="commerce-input mt-2"
        >
          <option value="">Awaiting approval</option>
          <option value="refund">Include processing fee in full refunds</option>
          <option value="retain">Retain processing fee</option>
        </select>
      </label>
      <Field
        label="Prescription retention (days after upload, completed orders only)"
        name="prescription_retention_days"
        type="number"
        min="1"
        max="3650"
        defaultValue={value.prescription_retention_days ?? ""}
      />
      <details className="rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Payment fee schedule</summary>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {[
            ["fee_rate", "Processing rate (%)"],
            ["fee_fixed", "Fixed fee (NGN)"],
            ["fee_threshold", "Fixed fee threshold (NGN)"],
            ["fee_cap", "Fee cap (NGN)"],
          ].map(([key, label]) => (
            <Field
              key={key}
              name={key}
              label={label!}
              type="number"
              min="0"
              step="0.01"
              defaultValue={value[key!] / 100}
              required
            />
          ))}
        </div>
      </details>
      <label className="flex gap-2">
        <input type="checkbox" name="checkout_enabled" defaultChecked={value.checkout_enabled} />
        Enable checkout (test payments until launch is approved)
      </label>
      <label className="flex gap-2">
        <input type="checkbox" name="launch_approved" defaultChecked={value.launch_approved} />I
        approve the business information, policies and live launch requirements
      </label>
      <button className="action-button" disabled={busy}>
        {busy ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

function SalesDateFilter({
  filter,
  onApply,
  busy,
  children,
  title = "Filter sales by date",
}: {
  filter: string;
  onApply: (filter: string) => void;
  busy: boolean;
  children?: import("react").ReactNode;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const applied = new URLSearchParams(filter);
  const [period, setPeriod] = useState(applied.get("period") || "month");
  const form = (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const values = new FormData(e.currentTarget);
        const params = new URLSearchParams();
        values.forEach((value, key) => params.set(key, String(value)));
        try {
          salesPeriod(params);
          onApply(params.toString());
          setOpen(false);
        } catch {
          toast.error("Choose a valid sales period and date range.");
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label
          className={
            period === "custom" || period === "all"
              ? "text-sm font-semibold sm:col-span-2"
              : "text-sm font-semibold"
          }
        >
          Sales period
          <select
            aria-label="Sales period"
            name="period"
            className="commerce-input mt-2"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="custom">Custom period</option>
            <option value="all">All time</option>
          </select>
        </label>
        {period === "month" && (
          <Field
            label="Month"
            name="month"
            type="month"
            defaultValue={applied.get("month") || nigeriaDate().slice(0, 7)}
            min="2000-01"
            max="2100-12"
            required
          />
        )}
        {period === "week" && (
          <Field
            label="Week containing"
            name="week"
            type="date"
            defaultValue={applied.get("week") || nigeriaDate()}
            min="2000-01-01"
            max="2100-12-31"
            required
          />
        )}
        {period === "custom" && (
          <>
            <Field
              label="From"
              name="from"
              defaultValue={applied.get("from") || ""}
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              required
            />
            <Field
              label="To"
              name="to"
              defaultValue={applied.get("to") || ""}
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              required
            />
          </>
        )}
        <button className="action-button sm:col-span-2" disabled={busy}>
          Apply
        </button>
      </div>
    </form>
  );
  return (
    <section
      aria-label="Sales date filter"
      className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      {
        <>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => {
              setPeriod(applied.get("period") || "month");
              setOpen(true);
            }}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-brand/20 bg-blue-50 px-4 py-2 text-sm font-semibold text-brand"
          >
            <CalendarDays size={18} aria-hidden="true" /> Date filter
          </button>
          <WorkspaceModal open={open} onClose={() => setOpen(false)} title={title} size="compact">
            {form}
          </WorkspaceModal>
        </>
      }
      {children}
    </section>
  );
}
