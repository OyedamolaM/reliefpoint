import { useState, useId, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAccount } from "./auth-provider";
import { SiteShell } from "./site-shell";
import { api, send, notifyError } from "@/lib/api";
import { formatNaira } from "@/lib/commerce";

export function AuthForm() {
  const account = useAccount();
  const [mode, setMode] = useState("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section className="mx-auto max-w-md">
      <h1 className="mb-6 text-3xl font-bold">
        {mode === "signin"
          ? "Welcome to ReliefPoint"
          : mode === "signup"
            ? "Create your account"
            : mode === "resend"
              ? "Verify your email"
              : "Reset your password"}
      </h1>
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
        <button className="action-button w-full" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : mode === "resend"
                  ? "Send verification email"
                  : "Send reset link"}
        </button>
      </form>
      <div className="mt-5 flex flex-wrap gap-5 text-sm font-semibold underline">
        {["signin", "signup", "reset", "resend"]
          .filter((m) => m !== mode)
          .map((m) => (
            <button
              key={m}
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
      <Link to="/" className="mt-6 inline-block text-sm underline">
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
export function AccountPage() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("auth_error"))
      toast.error(
        "This sign-in link has expired or couldn’t be verified. Please request a new one.",
        { id: "auth-link" },
      );
  }, []);
  const account = useAccount();
  const query = useQueryClient();
  const [selectedTab, setTab] = useState("orders");
  const tab = account.user?.recovery ? "security" : selectedTab;
  const [page, setPage] = useState(0);
  const orders = useQuery({
    queryKey: ["private", "orders", account.user?.id, page],
    queryFn: () => api<{ rows: any[]; more: boolean }>(`customer/orders?page=${page}`),
    enabled: !!account.user && tab === "orders",
    retry: false,
  });
  const addresses = useQuery({
    queryKey: ["private", "addresses", account.user?.id],
    queryFn: () => api<{ rows: any[] }>("customer/addresses"),
    enabled: !!account.user && tab === "addresses",
    retry: false,
  });
  return (
    <SiteShell>
      {account.loading ? (
        <p>Loading your account…</p>
      ) : !account.user ? (
        <AuthForm />
      ) : (
        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-3xl font-bold">Hello, {account.user.name || "there"}</h1>
            <button
              className="underline"
              onClick={() =>
                void account
                  .logout()
                  .then(() => toast.success("You’ve been signed out."))
                  .catch(notifyError)
              }
            >
              Sign out
            </button>
          </div>
          <nav className="mb-8 flex flex-wrap gap-3">
            {["orders", "profile", "addresses", "security"].map((t) => (
              <button
                key={t}
                className={tab === t ? "action-button" : "rounded-lg border px-4 py-2 capitalize"}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
            {account.user.roles.length > 0 && (
              <Link to="/admin" className="action-button">
                Administration
              </Link>
            )}
          </nav>
          {tab === "orders" && (
            <section>
              <div className="mb-5 flex flex-wrap justify-between gap-3">
                <h2 className="text-xl font-bold">Orders & prescriptions</h2>
                <button
                  className="underline"
                  onClick={() =>
                    void send("customer/claim-orders", {})
                      .then(() => {
                        toast.success("Your verified guest purchases are linked.");
                        void orders.refetch();
                      })
                      .catch(notifyError)
                  }
                >
                  Find my guest purchases
                </button>
              </div>
              {orders.error && <Retry error={orders.error} retry={() => void orders.refetch()} />}
              <div className="space-y-3">
                {orders.data?.rows.map((o) => (
                  <Link
                    key={o.id}
                    to="/orders/$id"
                    params={{ id: o.id }}
                    className="block rounded-xl border p-5"
                  >
                    <div className="flex flex-wrap justify-between gap-3">
                      <strong>{o.reference}</strong>
                      <span>{formatNaira(o.total / 100)}</span>
                    </div>
                    <p className="mt-3 text-sm capitalize">
                      {o.payment_status.replaceAll("_", " ")} ·{" "}
                      {o.fulfillment_status.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-xs">
                      {new Date(o.created_at).toLocaleDateString("en-NG")}
                    </p>
                  </Link>
                ))}
              </div>
              {orders.data?.rows.length === 0 && <p>You have no orders yet.</p>}
              <Pagination page={page} more={orders.data?.more ?? false} onChange={setPage} />
            </section>
          )}
          {tab === "profile" && (
            <form
              className="max-w-lg space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                try {
                  await send("customer/profile", Object.fromEntries(d));
                  await account.refresh();
                  toast.success("Your profile has been updated.");
                } catch (error) {
                  notifyError(error);
                }
              }}
            >
              <Field name="name" label="Full name" defaultValue={account.user.name} required />
              <Field label="Email" value={account.user.email} readOnly />
              <Field name="phone" label="Phone" defaultValue={account.user.phone} />
              <button className="action-button">Save profile</button>
            </form>
          )}
          {tab === "addresses" && (
            <section className="grid gap-8 md:grid-cols-2">
              <div>
                {addresses.error && (
                  <Retry error={addresses.error} retry={() => void addresses.refetch()} />
                )}
                <div className="space-y-3">
                  {addresses.data?.rows.map((a) => (
                    <div key={a.id} className="rounded-xl border p-4">
                      <strong>{a.name}</strong>
                      <p>
                        {a.address}, {a.lga}, {a.state}
                      </p>
                      <p>{a.phone}</p>
                      <button
                        className="mt-3 text-sm underline"
                        onClick={() =>
                          void send("customer/delete-address", { id: a.id })
                            .then(() => {
                              void query.invalidateQueries({ queryKey: ["private", "addresses"] });
                              toast.success("Address removed.");
                            })
                            .catch(notifyError)
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  try {
                    await send("customer/address", Object.fromEntries(new FormData(form)));
                    form.reset();
                    void addresses.refetch();
                    toast.success("Address saved.");
                  } catch (error) {
                    notifyError(error);
                  }
                }}
              >
                <h2 className="text-xl font-bold">Add an address</h2>
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
            </section>
          )}
          {tab === "security" && <SecurityPanel />}
        </div>
      )}
    </SiteShell>
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
export function SecurityPanel() {
  const account = useAccount();
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(
    null,
  );
  const [factor, setFactor] = useState("");
  const factors = useQuery({
    queryKey: ["private", "mfa", account.user?.id],
    queryFn: () => send<{ factors: { id: string; name: string }[] }>("auth/mfa-factors", {}),
    retry: false,
  });
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Two-step verification</h2>
        <p className="text-sm">Required for staff access.</p>
        {factors.data?.factors.map((f) => (
          <button key={f.id} className="block underline" onClick={() => setFactor(f.id)}>
            Verify {f.name || "authenticator"}
          </button>
        ))}
        <button
          className="action-button"
          onClick={() =>
            void send<{ id: string; qr: string; secret: string }>("auth/mfa-enroll", {})
              .then((r) => {
                setEnrollment(r);
                setFactor(r.id);
              })
              .catch(notifyError)
          }
        >
          Set up authenticator
        </button>
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
            <p className="break-all text-sm">Setup key: {enrollment.secret}</p>
          </div>
        )}
        {factor && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await send("auth/mfa-verify", {
                  id: factor,
                  code: new FormData(e.currentTarget).get("code"),
                });
                await account.changed();
                setEnrollment(null);
                setFactor("");
                void factors.refetch();
                toast.success("Your identity has been verified.");
              } catch (error) {
                notifyError(error);
              }
            }}
          >
            <Field
              label="Authenticator code"
              name="code"
              pattern="[0-9]{6}"
              inputMode="numeric"
              required
            />
            <button className="action-button">Verify code</button>
          </form>
        )}
      </section>
      <section className="space-y-5">
        <h2 className="text-xl font-bold">Password & sessions</h2>
        <form
          className="space-y-4"
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
