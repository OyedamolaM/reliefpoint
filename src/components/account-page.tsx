import { useState, useId, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAccount } from "./auth-provider";
import { SiteShell } from "./site-shell";
import { api, send, notifyError } from "@/lib/api";
import { formatNaira } from "@/lib/commerce";
import {
  LayoutDashboard,
  ShoppingBag,
  CreditCard,
  UserRound,
  MapPin,
  ShieldCheck,
  Heart,
  Plus,
  ArrowUpRight,
  Pencil,
  LockKeyhole,
  ArrowRight,
} from "lucide-react";
import { WorkspaceShell, WorkspaceModal, EmptyWorkspace } from "./workspace-shell";
import { useCommerce } from "./commerce-provider";

export function AuthForm() {
  const account = useAccount();
  const [mode, setMode] = useState("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section className="mx-auto w-full max-w-md">
      <div className="mb-5 flex items-center gap-3">
        <img src="/reliefpoint-icon-blue.svg" alt="" className="h-10 w-10" />
        <div>
          <p className="text-sm font-bold text-brand">ReliefPoint Pharmacy</p>
          <p className="text-xs text-slate-500">Your everyday care, together.</p>
        </div>
      </div>
      <h1 className="mb-2 pr-5 text-2xl font-bold tracking-tight">
        {mode === "signin"
          ? "Welcome to ReliefPoint"
          : mode === "signup"
            ? "Create your account"
            : mode === "resend"
              ? "Verify your email"
              : "Reset your password"}
      </h1>
      <p className="mb-6 text-sm leading-6 text-slate-500">
        {mode === "signin"
          ? "Sign in to manage your orders and account."
          : mode === "signup"
            ? "Save your details for an easier next visit."
            : "Enter your email and we’ll send you a secure link."}
      </p>
      <div
        className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
        aria-label="Account options"
      >
        {["signin", "signup"].map((option) => (
          <button
            key={option}
            type="button"
            disabled={busy}
            aria-pressed={mode === option}
            aria-label={option === "signin" ? "Switch to sign in" : "Switch to create account"}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-brand ${mode === option ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-brand"}`}
            onClick={() => {
              setMode(option);
              setMessage("");
            }}
          >
            {option === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setMessage("");
          try {
            if (mode === "signup" && data.get("password") !== data.get("confirm")) {
              throw new Error("password_mismatch");
            }
            const result = await send<{ message?: string }>(`auth/${mode}`, {
              email: data.get("email"),
              password: data.get("password"),
              ...(mode === "signup" ? { name: data.get("name") } : {}),
            });
            if (result.message) {
              setMessage(result.message);
              toast.success(result.message);
            } else toast.success("You’re signed in.");
            await account.changed();
          } catch (error) {
            if (error instanceof Error && error.message === "password_mismatch") {
              setMessage("The passwords do not match.");
              toast.error("The passwords do not match.");
            } else setMessage(notifyError(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "signup" && <Field name="name" label="Full name" required minLength={2} />}
        <Field name="email" label="Email address" type="email" required autoComplete="email" />
        {!["reset", "resend"].includes(mode) && (
          <Field
            name="password"
            label="Password"
            type="password"
            minLength={mode === "signup" ? 10 : 1}
            required
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        )}
        {mode === "signup" && (
          <Field name="confirm" label="Confirm password" type="password" required minLength={10} />
        )}
        {message && (
          <p role="status" className="rounded-lg bg-secondary p-3 text-sm">
            {message}
          </p>
        )}
        <button
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60"
          disabled={busy}
          aria-busy={busy}
        >
          {busy
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : mode === "resend"
                  ? "Send verification email"
                  : "Send reset link"}
          {!busy && <ArrowRight size={17} />}
        </button>
      </form>
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-semibold text-brand">
        {["reset", "resend"]
          .filter((m) => m !== mode)
          .map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              className="rounded-lg px-2 py-2 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-brand"
              onClick={() => {
                setMode(m);
                setMessage("");
              }}
            >
              {m === "signin"
                ? "Sign in"
                : m === "signup"
                  ? "Register"
                  : m === "resend"
                    ? "Resend verification"
                    : "Forgot password?"}
            </button>
          ))}
      </div>
      <p className="mt-5 flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <LockKeyhole size={13} />
        Your account details stay private.
      </p>
      <Link
        to="/"
        className="mt-4 block rounded-lg py-2 text-center text-xs font-semibold text-slate-500 hover:text-brand"
      >
        Continue shopping as a guest
      </Link>
    </section>
  );
}
export function Field({
  label,
  onInvalid,
  onChange,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [error, setError] = useState("");
  const id = useId();
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        className="commerce-input mt-2"
        {...props}
        aria-invalid={!!error}
        aria-describedby={error ? id : undefined}
        onInvalid={(e) => {
          setError(e.currentTarget.validationMessage);
          onInvalid?.(e);
        }}
        onChange={(e) => {
          setError("");
          onChange?.(e);
        }}
      />
      {error && (
        <span id={id} className="mt-1 block text-xs text-red-700">
          {error}
        </span>
      )}
    </label>
  );
}
const accountNavigation = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "orders", label: "My orders", icon: ShoppingBag },
  { key: "payments", label: "Pending payments", icon: CreditCard },
  { key: "profile", label: "My profile", icon: UserRound },
  { key: "addresses", label: "Saved addresses", icon: MapPin },
  { key: "wishlist", label: "Wishlist", icon: Heart },
  { key: "security", label: "Security", icon: ShieldCheck },
];
export function AccountPage() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("auth_error"))
      toast.error(
        "This sign-in link has expired or couldn?t be verified. Please request a new one.",
        { id: "auth-link" },
      );
  }, []);
  const account = useAccount();
  const query = useQueryClient();
  const shop = useCommerce();
  const [selectedTab, setTab] = useState("overview");
  const [page, setPage] = useState(0);
  const [editProfile, setEditProfile] = useState(false);
  const [addAddress, setAddAddress] = useState(false);
  const tab = account.user?.recovery ? "security" : selectedTab;
  const orders = useQuery({
    queryKey: ["private", "orders", account.user?.id, page, tab === "payments"],
    queryFn: () =>
      api<{ rows: any[]; more: boolean }>(
        "customer/orders?page=" + page + (tab === "payments" ? "&view=pending" : ""),
      ),
    enabled: !!account.user && ["overview", "orders", "payments"].includes(tab),
    retry: false,
  });
  const addresses = useQuery({
    queryKey: ["private", "addresses", account.user?.id],
    queryFn: () => api<{ rows: any[] }>("customer/addresses"),
    enabled: !!account.user && tab === "addresses",
    retry: false,
  });
  if (account.loading || !account.user)
    return (
      <SiteShell>
        <div className="mx-auto max-w-lg rounded-2xl border bg-white p-6 sm:p-9">
          {account.loading ? <p>Loading your account?</p> : <AuthForm />}
        </div>
      </SiteShell>
    );
  const user = account.user;
  const navigate = (key: string) => {
    setTab(key);
    setPage(0);
  };
  const title = accountNavigation.find((n) => n.key === tab)?.label || "My account";
  return (
    <WorkspaceShell
      items={accountNavigation}
      active={tab}
      onNavigate={navigate}
      title={title}
      subtitle={
        tab === "overview" ? "Your care, orders and account details, all in one place." : undefined
      }
    >
      {tab === "overview" && (
        <>
          <section className="mb-7 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-brand p-7 text-white sm:p-9">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-200">
                My ReliefPoint
              </p>
              <h2 className="text-2xl font-bold sm:text-3xl">
                Hello, {user.name.split(" ")[0] || "there"}.
              </h2>
              <p className="mt-3 text-sm text-blue-100">
                A little more care for you and your family.
              </p>
            </div>
            <Link
              to="/"
              className="flex items-center gap-2 rounded-xl bg-[#B9FF00] px-5 py-3 text-sm font-bold text-brand"
            >
              Continue shopping
              <ArrowUpRight size={16} />
            </Link>
          </section>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                key: "orders",
                title: "Track your orders",
                text: "Follow confirmed purchases and deliveries.",
                icon: ShoppingBag,
              },
              {
                key: "addresses",
                title: "Delivery addresses",
                text: "Keep your favourite delivery details handy.",
                icon: MapPin,
              },
              {
                key: "profile",
                title: "Your profile",
                text: "Manage your name and contact details.",
                icon: UserRound,
              },
            ].map(({ key, title, text, icon: Icon }) => (
              <button
                key={key}
                onClick={() => navigate(key)}
                className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-brand/30"
              >
                <Icon size={24} className="mb-5 text-brand" />
                <h3 className="font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
              </button>
            ))}
          </div>
        </>
      )}
      {["overview", "orders", "payments"].includes(tab) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">
                {tab === "overview"
                  ? "Recent orders"
                  : tab === "payments"
                    ? "Pending payments"
                    : "Your orders"}
              </h2>
              {tab === "payments" && (
                <p className="mt-1 text-sm text-slate-500">
                  We?ll show your purchase in Orders after payment is confirmed.
                </p>
              )}
            </div>
            {tab === "overview" ? (
              <button
                className="text-sm font-semibold text-brand"
                onClick={() => navigate("orders")}
              >
                View all
              </button>
            ) : (
              <button
                className="text-sm font-semibold text-brand"
                onClick={() =>
                  void send("customer/claim-orders", {})
                    .then(() => {
                      toast.success("Your verified guest purchases are linked.");
                      void orders.refetch();
                    })
                    .catch(notifyError)
                }
              >
                Find guest purchases
              </button>
            )}
          </div>
          {orders.error && <Retry error={orders.error} retry={() => void orders.refetch()} />}
          {orders.isLoading && (
            <p role="status" className="py-8 text-center text-sm text-slate-500">
              Loading purchases?
            </p>
          )}
          <div className="space-y-3">
            {orders.data?.rows.slice(0, tab === "overview" ? 4 : 24).map((o) => (
              <Link
                key={o.id}
                to="/orders/$id"
                params={{ id: o.id }}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-100 p-4 transition hover:border-brand/30"
              >
                <span className="rounded-xl bg-blue-50 p-3 text-brand">
                  <ShoppingBag size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-semibold">{o.reference}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(o.created_at).toLocaleDateString("en-NG")}
                  </p>
                </div>
                <div className="text-right">
                  <strong className="text-sm">{formatNaira(o.total / 100)}</strong>
                  <p className="mt-2 text-xs capitalize text-slate-500">
                    {(tab === "payments" ? o.payment_status : o.fulfillment_status).replaceAll(
                      "_",
                      " ",
                    )}
                  </p>
                </div>
                <ArrowUpRight size={17} className="text-slate-400" />
              </Link>
            ))}
          </div>
          {orders.data?.rows.length === 0 && (
            <EmptyWorkspace
              title={tab === "payments" ? "No pending payments" : "Your first order starts here"}
              description={
                tab === "payments"
                  ? "Payment updates will appear here when needed."
                  : "Confirmed purchases and delivery updates will appear here."
              }
            />
          )}
          {tab !== "overview" && (
            <Pagination page={page} more={orders.data?.more ?? false} onChange={setPage} />
          )}
        </section>
      )}
      {tab === "profile" && (
        <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-8 flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-2xl font-bold text-brand">
              {(user.name || user.email).slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{user.name || "My profile"}</h2>
              <p className="mt-1 break-all text-sm text-slate-500">{user.email}</p>
            </div>
            <button
              className="rounded-lg border p-2.5 text-brand"
              aria-label="Edit profile"
              onClick={() => setEditProfile(true)}
            >
              <Pencil size={18} />
            </button>
          </div>
          <dl className="grid gap-6 sm:grid-cols-2">
            {[
              { label: "Full name", value: user.name },
              { label: "Phone number", value: user.phone },
              { label: "Email address", value: user.email },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-slate-500">{item.label}</dt>
                <dd className="mt-2 break-words text-sm font-semibold">
                  {item.value || "Not added"}
                </dd>
              </div>
            ))}
          </dl>
          <button className="action-button mt-8" onClick={() => setEditProfile(true)}>
            Edit profile
          </button>
        </section>
      )}
      {tab === "addresses" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Saved addresses</h2>
            <button className="action-button gap-2" onClick={() => setAddAddress(true)}>
              <Plus size={16} />
              Add address
            </button>
          </div>
          {addresses.error && (
            <Retry error={addresses.error} retry={() => void addresses.refetch()} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {addresses.data?.rows.map((a) => (
              <article key={a.id} className="rounded-xl border border-slate-200 p-5">
                <MapPin size={21} className="mb-4 text-brand" />
                <h3 className="font-bold">{a.name}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  {a.address}
                  <br />
                  {a.lga}, {a.state}
                  <br />
                  {a.phone}
                </p>
                <button
                  className="mt-4 text-xs font-semibold text-red-600"
                  onClick={() =>
                    void send("customer/delete-address", { id: a.id })
                      .then(() => {
                        void query.invalidateQueries({ queryKey: ["private", "addresses"] });
                        toast.success("Address removed.");
                      })
                      .catch(notifyError)
                  }
                >
                  Remove address
                </button>
              </article>
            ))}
          </div>
          {addresses.data?.rows.length === 0 && (
            <EmptyWorkspace
              title="No saved addresses"
              description="Add an address for a quicker checkout next time."
            />
          )}
        </section>
      )}
      {tab === "wishlist" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-7">
          <Heart size={28} className="mb-4 text-brand" />
          <h2 className="text-lg font-bold">Your saved favourites</h2>
          <p className="mt-2 text-sm text-slate-500">
            Keep the health essentials you love close at hand.
          </p>
          <button className="action-button mt-6" onClick={shop.openWishlist}>
            Open wishlist ({shop.wishlist.length})
          </button>
        </section>
      )}
      {tab === "security" && (
        <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <ShieldCheck className="text-brand" />
            <h2 className="text-lg font-bold">Keep your account secure</h2>
          </div>
          <SecurityPanel />
        </section>
      )}
      <WorkspaceModal
        open={editProfile}
        onClose={() => setEditProfile(false)}
        title="Edit your profile"
      >
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            try {
              await send("customer/profile", Object.fromEntries(d));
              await account.refresh();
              setEditProfile(false);
              toast.success("Your profile has been updated.");
            } catch (error) {
              notifyError(error);
            }
          }}
        >
          <Field name="name" label="Full name" defaultValue={user.name} required />
          <Field label="Email address" value={user.email} readOnly />
          <Field name="phone" label="Phone number" defaultValue={user.phone} />
          <button className="action-button">Save profile</button>
        </form>
      </WorkspaceModal>
      <WorkspaceModal
        open={addAddress}
        onClose={() => setAddAddress(false)}
        title="Add a delivery address"
      >
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            try {
              await send("customer/address", Object.fromEntries(new FormData(form)));
              setAddAddress(false);
              void addresses.refetch();
              toast.success("Address saved.");
            } catch (error) {
              notifyError(error);
            }
          }}
        >
          {["name", "phone", "address", "state", "lga"].map((name) => (
            <Field
              key={name}
              name={name}
              label={name === "lga" ? "LGA / city" : name[0]!.toUpperCase() + name.slice(1)}
              required
            />
          ))}
          <button className="action-button">Save address</button>
        </form>
      </WorkspaceModal>
    </WorkspaceShell>
  );
}
export function Retry({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="my-4 rounded-xl border p-4">
      <p>We couldn’t load this information.</p>
      <button
        className="mt-2 underline"
        onClick={() => {
          notifyError(error);
          retry();
        }}
      >
        Try again
      </button>
    </div>
  );
}
export function Pagination({
  page,
  more,
  onChange,
}: {
  page: number;
  more: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="mt-6 flex items-center gap-5">
      <button
        disabled={page === 0}
        className="disabled:opacity-40"
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span>Page {page + 1}</span>
      <button disabled={!more} className="disabled:opacity-40" onClick={() => onChange(page + 1)}>
        Next
      </button>
    </div>
  );
}
export function AuthenticatorPanel() {
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(
    null,
  );
  const [factor, setFactor] = useState("");
  const factors = useQuery({
    queryKey: ["private", "mfa", account.user?.id],
    queryFn: () => send<{ factors: { id: string; name: string }[] }>("auth/mfa-factors", {}),
    enabled: !!account.user && account.user.aal !== "aal2",
    retry: false,
  });
  return (
    <section className="space-y-5">
      {account.user?.aal === "aal2" ? (
        <div className="rounded-xl bg-emerald-50 p-5 text-emerald-800">
          <ShieldCheck className="mb-3" />
          <h2 className="font-bold">Authenticator verified</h2>
          <p className="mt-2 text-sm">Two-step verification is complete for this session.</p>
        </div>
      ) : (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-brand">
            <ShieldCheck />
          </div>
          <h2 className="text-xl font-bold">
            {enrollment || factors.data?.factors.length === 0
              ? "Set up your authenticator"
              : "Enter your verification code"}
          </h2>
          {factors.isLoading && (
            <p role="status" className="text-sm text-slate-500">
              Checking your authenticator…
            </p>
          )}
          {factors.error && <Retry error={factors.error} retry={() => void factors.refetch()} />}
          {!enrollment && !!factors.data?.factors.length && (
            <p className="text-sm leading-6 text-slate-500">
              Open your authenticator app and enter the six-digit code for ReliefPoint.
            </p>
          )}
          {!enrollment && factors.data?.factors.length === 0 && (
            <>
              <p className="text-sm leading-6 text-slate-500">
                Connect an authenticator app once to protect your account.
              </p>
              <button
                className="action-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await send<{ id: string; qr: string; secret: string }>(
                      "auth/mfa-enroll",
                      {},
                    );
                    setEnrollment(r);
                    setFactor(r.id);
                  } catch (error) {
                    notifyError(error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Preparing…" : "Set up authenticator"}
              </button>
            </>
          )}
          {enrollment && (
            <div>
              <img
                src={
                  enrollment.qr.startsWith("data:")
                    ? enrollment.qr
                    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qr)}`
                }
                alt="Scan this code in your authenticator app"
                width="200"
                height="200"
              />
              <p className="mb-3 text-sm text-slate-500">
                Scan the QR code, then enter the code shown in your app.
              </p>
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Can’t scan the code?</summary>
                <p className="mt-3 break-all">Setup key: {enrollment.secret}</p>
              </details>
            </div>
          )}
          {(factor || !!factors.data?.factors.length) && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                try {
                  await send("auth/mfa-verify", {
                    id: factor || factors.data!.factors[0]!.id,
                    code: new FormData(e.currentTarget).get("code"),
                  });
                  await account.changed();
                  setEnrollment(null);
                  setFactor("");
                  toast.success("Your identity has been verified.");
                } catch (error) {
                  notifyError(error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field
                label="Authenticator code"
                name="code"
                pattern="[0-9]{6}"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                minLength={6}
                autoFocus
                required
              />
              {factors.data && factors.data.factors.length > 1 && !enrollment && (
                <label className="block text-sm">
                  Authenticator
                  <select
                    className="commerce-input mt-2"
                    value={factor || factors.data.factors[0]!.id}
                    onChange={(e) => setFactor(e.target.value)}
                  >
                    {factors.data.factors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name || "Authenticator"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button disabled={busy} className="action-button w-full">
                {busy ? "Verifying…" : "Continue"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
export function SecurityPanel() {
  const account = useAccount();
  return (
    <div className="space-y-8">
      {!account.user?.recovery && <AuthenticatorPanel />}
      <section className="space-y-5 border-t border-slate-100 pt-6">
        <h2 className="text-xl font-bold">Password & sessions</h2>
        <details
          open={account.user?.recovery || undefined}
          className="rounded-xl border border-slate-200 p-4"
        >
          <summary className="cursor-pointer text-sm font-semibold">
            {account.user?.recovery ? "Set a new password" : "Change password"}
          </summary>
          <form
            className="mt-5 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              try {
                await send("auth/password", Object.fromEntries(new FormData(form)));
                form.reset();
                await account.refresh();
                toast.success("Your password has been updated.");
              } catch (error) {
                notifyError(error);
              }
            }}
          >
            {!account.user?.recovery && (
              <Field label="Current password" name="current_password" type="password" required />
            )}
            <Field label="New password" name="password" type="password" minLength={10} required />
            <button className="action-button">Update password</button>
          </form>
        </details>
        <button
          className="underline"
          onClick={() =>
            void account
              .logout(true)
              .then(() => toast.success("You’ve been signed out everywhere."))
              .catch(notifyError)
          }
        >
          Sign out all devices
        </button>
      </section>
    </div>
  );
}
