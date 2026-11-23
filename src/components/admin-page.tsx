import { uploadFile } from "@/lib/upload";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { api, send, notifyError } from "@/lib/api";
import { slugify, roles, type StaffRole } from "@/lib/contracts";
import { useAccount } from "./auth-provider";
import { AuthForm, Field, Pagination, Retry, SecurityPanel } from "./account-page";
import { SiteShell } from "./site-shell";
import { formatNaira } from "@/lib/commerce";
import { OrderView } from "./order-page";
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
export function PhotoUpload({
  value,
  onChange,
  label = "Photo",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold">
        {label}
        <input
          type="file"
          accept="image/jpeg,image/png"
          className="mt-2 block w-full text-sm"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const result = await uploadFile<{ images: { medium: string } }>("media", file);
              onChange(result.images.medium);
              toast.success("Photo uploaded.");
            } catch (error) {
              notifyError(error);
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      {busy && <p role="status">Uploading photo…</p>}
      {value && (
        <img src={value} alt="Uploaded preview" className="h-32 w-48 rounded-lg object-cover" />
      )}
    </div>
  );
}
export function AdminPage() {
  const { user, loading } = useAccount();
  const [section, setSection] = useState("overview");
  const [group, setGroup] = useState("overview");
  const [bulk, setBulk] = useState(false);
  const [stockProduct, setStockProduct] = useState<any>(null);
  const [deleteDraft, setDeleteDraft] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [orderId, setOrderId] = useState("");
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
    "blog_posts",
  ].includes(active);
  const enabled = !!user && user.aal === "aal2" && accessible.some((s) => s.key === active);
  const data = useQuery({
    queryKey: ["private", "admin", active, page, query, user?.id],
    queryFn: () =>
      api<{ rows: any[]; more: boolean }>(
        `admin/${active === "pending_orders" ? "orders" : active}?page=${page}&q=${encodeURIComponent(query)}${active === "pending_orders" ? "&view=pending" : ""}`,
      ),
    enabled,
    retry: false,
  });
  const summary = useQuery({
    queryKey: ["private", "admin-summary", user?.id],
    queryFn: () => api<Record<string, number>>("admin/summary"),
    enabled:
      !!user &&
      user.aal === "aal2" &&
      group === "overview" &&
      !!user?.roles.some((r) => ["owner", "admin"].includes(r)),
    retry: false,
  });
  const refresh = () => {
    if (active !== "overview") void data.refetch();
    if (group === "overview" && user?.roles.some((r) => ["owner", "admin"].includes(r)))
      void summary.refetch();
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
    (active !== "staff_roles" || !!user?.roles.includes("owner")) &&
    [
      "products",
      "categories",
      "inventory_batches",
      "shipping_zones",
      "blog_posts",
      "staff_roles",
    ].includes(active);
  if (loading || !user || !user.roles.length || user.aal !== "aal2") {
    return (
      <SiteShell>
        <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6 sm:p-9">
          {loading ? (
            <p>Loading staff access…</p>
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
              <SecurityPanel />
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
        <p>Loading staff access…</p>
      ) : !user ? (
        <AuthForm />
      ) : !user.roles.length ? (
        <p>
          You don’t have staff access.{" "}
          <Link to="/account" className="underline">
            Go to your account
          </Link>
        </p>
      ) : user.aal !== "aal2" ? (
        <div>
          <h1 className="mb-6 text-3xl font-bold">Secure staff access</h1>
          <SecurityPanel />
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
          {group === "overview" && summary.error && <Retry error={summary.error} retry={refresh} />}
          {group === "overview" && summary.isLoading && (
            <p role="status" className="mb-5 text-sm text-slate-500">
              Loading pharmacy overview…
            </p>
          )}
          {group === "overview" && summary.data && (
            <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                  className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-brand/30"
                >
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <strong className="mt-3 block text-3xl font-bold">
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
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-5 text-lg font-bold">Quick actions</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {navigation
                  .filter((g) => g.key !== "overview")
                  .map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => navigate(key)}
                      className="flex items-center gap-4 rounded-xl border border-slate-100 p-4 text-left hover:bg-slate-50"
                    >
                      <span className="rounded-xl bg-blue-50 p-3 text-brand">
                        <Icon size={20} />
                      </span>
                      <span className="flex-1 text-sm font-semibold">{label}</span>
                      <ArrowUpRight size={16} />
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
                  {editable && (
                    <button className="action-button" onClick={() => setEditing({})}>
                      <Plus size={16} className="mr-2" /> Add new
                    </button>
                  )}
                </div>
                <form
                  className="mb-5 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setPage(0);
                    setQuery(search);
                  }}
                >
                  {searchable && (
                    <>
                      <input
                        aria-label="Search records"
                        className="commerce-input"
                        placeholder="Search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <button className="action-button">Search</button>
                    </>
                  )}
                  <button type="button" className="rounded-lg border px-3" onClick={refresh}>
                    Refresh
                  </button>
                </form>
                {data.error && <Retry error={data.error} retry={refresh} />}{" "}
                {data.isLoading && <p>Loading…</p>}
                {active === "products" && (
                  <button
                    onClick={() => setBulk(true)}
                    className="mb-5 text-sm font-semibold text-brand"
                  >
                    Import / export products
                  </button>
                )}
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
                {active === "settings" && data.data?.rows[0] ? (
                  <SettingsForm value={data.data.rows[0]} onSaved={refresh} />
                ) : (
                  <div className="space-y-3">
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
                              {row.title ??
                                row.name ??
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
                                      : "Activity")}
                            </strong>
                          </div>
                          <div className="flex gap-3 text-sm">
                            {["products", "categories", "shipping_zones", "blog_posts"].includes(
                              active,
                            ) &&
                              (active !== "blog_posts" || canWriteBlog) && (
                                <button
                                  className="underline"
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
                                className="underline"
                                onClick={() => setOrderId(row.order_id)}
                              >
                                View order
                              </button>
                            )}
                            {["orders", "pending_orders"].includes(active) && (
                              <button className="underline" onClick={() => setOrderId(row.id)}>
                                {active === "pending_orders" ? "Review payment" : "View order"}
                              </button>
                            )}
                          </div>
                        </div>
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
                            .filter((key) => row[key] !== undefined)
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
                                  {key === "available"
                                    ? `${row[key]} in stock`
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
                                {key.replaceAll("_", " ")}: {formatNaira(row[key] / 100)}
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
                        {active === "staff_roles" && user.roles.includes("owner") && (
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
                          : "Nothing here yet"
                    }
                    description={
                      active === "orders"
                        ? "Purchases appear here after payment is verified."
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
                  {orderId && <OrderView id={orderId} admin onUpdate={refresh} />}
                </WorkspaceModal>
                <WorkspaceModal
                  open={!!editing}
                  onClose={() => setEditing(null)}
                  title={editing?.id ? "Edit record" : "Add record"}
                >
                  {editing && (
                    <AdminEditor
                      key={active + (editing.id || "new")}
                      resource={active}
                      row={editing}
                      onSaved={() => {
                        setEditing(null);
                        refresh();
                      }}
                    />
                  )}
                </WorkspaceModal>
                <WorkspaceModal
                  open={bulk}
                  onClose={() => setBulk(false)}
                  title="Import / export products"
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
  return (
    <div className="mb-6 space-y-3 rounded-xl bg-secondary p-4">
      <div className="flex flex-wrap items-center gap-5">
        <button
          className="underline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const records: any[] = [];
              let page = 0;
              while (page < 100) {
                const data = await api<{ rows: any[]; more: boolean }>(
                  `admin/products?page=${page}&export=1`,
                );
                records.push(...data.rows);
                if (!data.more) break;
                page++;
              }
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "reliefpoint-products.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              toast.success("Product export downloaded.");
            } catch (error) {
              notifyError(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          Export products
        </button>
        <label className="text-sm font-semibold">
          Import product file
          <input
            className="mt-2 block text-sm"
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 1024 * 1024) {
                toast.error("Choose an import file up to 1 MB.");
                return;
              }
              setBusy(true);
              try {
                let records: unknown;
                try {
                  records = JSON.parse(await file.text());
                } catch {
                  toast.error(
                    "This file isn’t valid JSON. Please check the product export format.",
                  );
                  return;
                }
                const result = await send<{ outcomes: { row: number; error?: string }[] }>(
                  "admin/product-import",
                  records,
                );
                setReport(result.outcomes);
                const saved = result.outcomes.filter((r) => !r.error).length;
                toast.success(`${saved} products imported.`);
                onSaved();
              } catch (error) {
                notifyError(error);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
      </div>
      <p className="text-xs">
        Up to 100 products per import. Use the export format; photos must already be uploaded
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
  const [photo, setPhoto] = useState(row.image ?? row.cover ?? "");
  const [blocks, setBlocks] = useState<any[]>(row.blocks ?? [{ type: "paragraph", text: "" }]);
  const [busy, setBusy] = useState(false);
  const product = resource === "products",
    blog = resource === "blog_posts";
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
        fee_kobo: Math.round(Number(d["fee"]) * 100),
        free_over_kobo: d["free"] ? Math.round(Number(d["free"]) * 100) : null,
        active: d["active"] === "on",
      };
    try {
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
    <form className="space-y-5" onSubmit={save}>
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
          <Field
            label="Page name"
            name="slug"
            defaultValue={row.slug ?? ""}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
          />
          <Field label="Category" name="category" defaultValue={row.category ?? ""} required />
          <PhotoUpload
            value={photo}
            onChange={setPhoto}
            label={blog ? "Cover photo" : "Product photo"}
          />
          <Field
            label="Photo description"
            name={blog ? "cover_alt" : "image_alt"}
            defaultValue={row.cover_alt ?? row.image_alt ?? ""}
            required
            minLength={3}
          />
        </>
      )}
      {product && (
        <>
          <Field label="Brand" name="brand" defaultValue={row.brand ?? ""} />
          <Field
            label="Price (₦)"
            name="price"
            type="number"
            min="1"
            step="0.01"
            defaultValue={row.price_kobo ? row.price_kobo / 100 : ""}
            required
          />
          {["detail", "directions", "storage"].map((key) => (
            <label key={key} className="block text-sm font-semibold capitalize">
              {key}
              <textarea
                className="commerce-input mt-2"
                name={key}
                defaultValue={row[key] ?? ""}
                required
              />
            </label>
          ))}
          <div className="flex flex-wrap gap-5">
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
                      onClick={() => setBlocks((current) => current.filter((_, i) => i !== index))}
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
                          current.map((b, i) => (i === index ? { ...b, alt: e.target.value } : b)),
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
      {resource === "categories" && (
        <Field label="Category name" name="name" defaultValue={row.name ?? ""} required />
      )}
      {resource === "inventory_batches" && (
        <>
          <input type="hidden" name="product_id" value={row.product_id} />
          <Field label="Quantity to add" name="quantity" type="number" min="1" required />
        </>
      )}
      {resource === "shipping_zones" && (
        <>
          {["state", "lga", "area", "estimate"].map((key) => (
            <Field
              key={key}
              label={
                key === "lga"
                  ? "LGA / city"
                  : key === "estimate"
                    ? "Delivery estimate"
                    : key[0]!.toUpperCase() + key.slice(1)
              }
              name={key}
              defaultValue={row[key] ?? ""}
              required={key !== "area"}
            />
          ))}
          <Field
            label="Delivery fee (₦)"
            name="fee"
            type="number"
            min="0"
            step="0.01"
            defaultValue={row.fee_kobo ? row.fee_kobo / 100 : 0}
            required
          />
          <Field
            label="Free delivery from (₦, optional)"
            name="free"
            type="number"
            min="0"
            step="0.01"
            defaultValue={row.free_over_kobo ? row.free_over_kobo / 100 : ""}
          />
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
      <button className="action-button" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
function SettingsForm({ value, onSaved }: { value: any; onSaved: () => void }) {
  const [logo, setLogo] = useState(value.public_data?.pcn_logo ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const d = Object.fromEntries(new FormData(e.currentTarget));
        const public_data = Object.fromEntries(
          ["address", "opening_hours", "privacy_text", "refund_text", "shipping_text"].map((k) => [
            k,
            d[k] ?? "",
          ]),
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
              ["fee_rate", "fee_fixed", "fee_threshold", "fee_cap"].map((k) => [k, Number(d[k])]),
            ),
          });
          toast.success("Business settings saved.");
          onSaved();
        } catch (error) {
          notifyError(error);
        } finally {
          setBusy(false);
        }
      }}
    >
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
            ["fee_rate", "Rate in basis points (150 = 1.5%)"],
            ["fee_fixed", "Fixed fee (kobo)"],
            ["fee_threshold", "Fixed fee threshold (kobo)"],
            ["fee_cap", "Fee cap (kobo)"],
          ].map(([key, label]) => (
            <Field
              key={key}
              name={key}
              label={label!}
              type="number"
              min="0"
              defaultValue={value[key!]}
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
