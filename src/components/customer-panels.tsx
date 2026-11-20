import { useState } from "react";
import {
  Eye,
  EyeOff,
  UserRound,
  Upload,
  MapPin,
  PackageSearch,
  CalendarDays,
  HeartHandshake,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { nigerianStates, whatsapp } from "@/lib/commerce";

export type CustomerPanel =
  "account" | "prescription" | "tracking" | "stores" | "service" | "loyalty";
export type ShoppingProfile = { name: string; email: string };
export function CustomerPanels({
  panel,
  onClose,
  profile,
  onProfile,
}: {
  panel: CustomerPanel | null;
  onClose: () => void;
  profile: ShoppingProfile | null;
  onProfile: (profile: ShoppingProfile | null) => void;
}) {
  return (
    <Dialog
      open={!!panel}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl">
        {panel === "account" ? (
          <AccountPanel profile={profile} onProfile={onProfile} onClose={onClose} />
        ) : panel === "prescription" ? (
          <PrescriptionPanel />
        ) : panel === "tracking" ? (
          <TrackingPanel />
        ) : panel === "stores" ? (
          <StorePanel />
        ) : panel === "service" ? (
          <ServicePanel />
        ) : panel === "loyalty" ? (
          <>
            <HeartHandshake className="size-10 text-forest" />
            <DialogTitle className="text-2xl font-bold">Care that gives back.</DialogTitle>
            <DialogDescription>ReliefPoints · our customer loyalty programme</DialogDescription>
            <p className="text-sm leading-7">
              We’re preparing a loyalty programme that rewards your everyday care. Membership and
              rewards will be available when customer accounts are connected.
            </p>
            <Button asChild>
              <a
                href={whatsapp(
                  "Hello ReliefPoint, please tell me more about your loyalty programme.",
                )}
                target="_blank"
                rel="noreferrer"
              >
                Ask about ReliefPoints
              </a>
            </Button>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
function AccountPanel({
  profile,
  onProfile,
  onClose,
}: {
  profile: ShoppingProfile | null;
  onProfile: (profile: ShoppingProfile | null) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "register" | "reset" | "profile">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const changeMode = (next: typeof mode) => {
    setMode(next);
    setMessage("");
    setPassword("");
    setConfirm("");
  };
  if (profile)
    return (
      <>
        <UserRound className="size-10 text-forest" />
        <DialogTitle className="text-2xl font-bold">Hi, {profile.name.split(" ")[0]}</DialogTitle>
        <DialogDescription>Your shopping profile for this visit</DialogDescription>
        <div className="space-y-2 rounded-xl bg-secondary p-4 text-sm">
          <p className="font-bold">{profile.name}</p>
          <p>{profile.email}</p>
          <p className="pt-2 text-muted-foreground">
            Guest profile · available until this page is refreshed.
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <h3 className="font-bold">Orders</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            No orders to show. Online order history will be available with your connected account.
          </p>
        </div>
        <Button onClick={onClose}>Continue shopping</Button>
        <Button variant="ghost" onClick={() => onProfile(null)}>
          <LogOut className="size-4" />
          Clear shopping profile
        </Button>
      </>
    );
  return (
    <>
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-leaf">
        <UserRound className="size-6" />
      </span>
      <DialogTitle className="text-2xl font-bold">
        {mode === "register"
          ? "Create your account"
          : mode === "reset"
            ? "Forgot your password?"
            : mode === "profile"
              ? "Make yourself at home."
              : "Welcome to ReliefPoint"}
      </DialogTitle>
      <DialogDescription>
        {mode === "profile"
          ? "Save your name and email for checkout during this visit."
          : mode === "reset"
            ? "Enter the email associated with your account."
            : "Your everyday care starts here."}
      </DialogDescription>
      {mode !== "profile" && mode !== "reset" && (
        <div className="grid grid-cols-2 rounded-lg bg-secondary p-1">
          {(["signin", "register"] as const).map((tab) => (
            <button
              key={tab}
              className={`rounded-md py-2.5 text-sm font-semibold ${mode === tab ? "bg-white shadow-sm" : ""}`}
              onClick={() => changeMode(tab)}
            >
              {tab === "signin" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "profile") {
            if (!name.trim()) {
              setMessage("Enter your name.");
              return;
            }
            onProfile({ name: name.trim(), email: email.trim() });
            return;
          }
          if (mode === "register" && password !== confirm) {
            setMessage("The passwords do not match.");
            return;
          }
          setPassword("");
          setConfirm("");
          setMessage(
            mode === "reset"
              ? "Password reset is not connected yet. No email has been sent."
              : mode === "register"
                ? "Account registration is not connected yet. Your account has not been created."
                : "Online sign-in is not connected yet. Continue as a guest or use a shopping profile.",
          );
        }}
      >
        {(mode === "register" || mode === "profile") && (
          <label className="block text-sm font-semibold">
            Full name
            <input
              className="commerce-input mt-1"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        )}
        <label className="block text-sm font-semibold">
          Email address
          <input
            className="commerce-input mt-1"
            type="email"
            required
            maxLength={150}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        {(mode === "signin" || mode === "register") && (
          <label className="block text-sm font-semibold">
            Password
            <div className="relative">
              <input
                className="commerce-input mt-1 pr-12"
                type={showPassword ? "text" : "password"}
                minLength={8}
                maxLength={128}
                required
                value={password}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </label>
        )}
        {mode === "register" && (
          <label className="block text-sm font-semibold">
            Confirm password
            <input
              className="commerce-input mt-1"
              required
              type={showPassword ? "text" : "password"}
              minLength={8}
              maxLength={128}
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        )}
        {mode === "signin" && (
          <button
            type="button"
            className="block text-sm font-semibold underline"
            onClick={() => changeMode("reset")}
          >
            Forgot password?
          </button>
        )}
        {message && (
          <p role="status" className="rounded-lg bg-secondary p-3 text-sm leading-6">
            {message}
          </p>
        )}
        <Button className="h-12 w-full" type="submit">
          {mode === "register"
            ? "Create account"
            : mode === "reset"
              ? "Send reset link"
              : mode === "profile"
                ? "Use shopping profile"
                : "Sign in"}
        </Button>
      </form>
      {mode !== "profile" && (
        <button className="text-sm font-semibold underline" onClick={() => changeMode("profile")}>
          Use a shopping profile for this visit
        </button>
      )}
      {(mode === "profile" || mode === "reset") && (
        <button className="text-sm" onClick={() => changeMode("signin")}>
          Back to sign in
        </button>
      )}
      <Button variant="ghost" onClick={onClose}>
        Continue as guest
      </Button>
    </>
  );
}
function PrescriptionPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  return (
    <>
      <Upload className="size-10 text-forest" />
      <DialogTitle className="text-2xl font-bold">Have a prescription?</DialogTitle>
      <DialogDescription>Let our pharmacy team help with your next refill.</DialogDescription>
      <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-forest/20 bg-secondary/50 px-4 py-8 text-center">
        <Upload className="size-7" />
        <strong>Choose your prescription</strong>
        <span className="text-sm text-muted-foreground">PDF, PNG or JPEG · maximum 5 MB</span>
        <input
          aria-label="Choose prescription file"
          className="max-w-full text-sm"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            setFile(null);
            if (!selected) return;
            if (
              selected.size > 5242880 ||
              !["application/pdf", "image/png", "image/jpeg"].includes(selected.type)
            ) {
              setError("Choose a PDF, PNG or JPEG under 5 MB.");
              e.target.value = "";
              return;
            }
            setFile(selected);
            setError("");
          }}
        />
      </label>
      {file && <p className="break-all text-sm font-semibold">Selected: {file.name}</p>}
      <label className="text-sm font-semibold">
        Note for the pharmacist (optional)
        <textarea
          className="commerce-input mt-1"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p className="text-sm leading-6 text-muted-foreground">
        Your file stays on this device; secure uploads are not connected yet. Contact our team for
        the next step. Files are not attached to WhatsApp automatically.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button asChild>
        <a
          href={whatsapp(
            `Hello ReliefPoint, I'd like help with a prescription refill.${note ? ` Note: ${note}` : ""} Please advise how I can share my prescription securely.`,
          )}
          target="_blank"
          rel="noreferrer"
        >
          Speak to the pharmacy team
        </a>
      </Button>
    </>
  );
}
function TrackingPanel() {
  const [reference, setReference] = useState("");
  const [show, setShow] = useState(false);
  return (
    <>
      <PackageSearch className="size-10 text-forest" />
      <DialogTitle className="text-2xl font-bold">Track your order</DialogTitle>
      <DialogDescription>
        Have your order reference ready? Let’s help you find it.
      </DialogDescription>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setShow(true);
        }}
      >
        <label className="block text-sm font-semibold">
          Order reference
          <input
            className="commerce-input mt-1"
            required
            minLength={3}
            maxLength={80}
            value={reference}
            placeholder="Enter your order reference"
            onChange={(e) => {
              setReference(e.target.value);
              setShow(false);
            }}
          />
        </label>
        <Button className="w-full" type="submit">
          Check order
        </Button>
      </form>
      {show && (
        <div role="status" className="space-y-3 rounded-xl bg-secondary p-4 text-sm leading-6">
          <p>
            Live tracking is not connected yet. Our team can check reference{" "}
            <strong>{reference}</strong> for you.
          </p>
          <a
            className="font-semibold underline"
            href={whatsapp(`Hello ReliefPoint, please help me check order reference ${reference}.`)}
            target="_blank"
            rel="noreferrer"
          >
            Ask about this order on WhatsApp
          </a>
        </div>
      )}
    </>
  );
}
function StorePanel() {
  const [location, setLocation] = useState("");
  return (
    <>
      <MapPin className="size-10 text-forest" />
      <DialogTitle className="text-2xl font-bold">Find care near you</DialogTitle>
      <DialogDescription>Ask our team about your nearest ReliefPoint location.</DialogDescription>
      <label className="block text-sm font-semibold">
        Your city or neighbourhood
        <input
          className="commerce-input mt-1"
          value={location}
          maxLength={100}
          placeholder="e.g. Lekki, Lagos"
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>
      <p className="text-sm leading-6 text-muted-foreground">
        Contact us for location details, opening hours and available services before visiting.
      </p>
      <Button asChild>
        <a
          href={whatsapp(
            `Hello ReliefPoint, please share your nearest location and opening hours${location.trim() ? ` near ${location.trim()}` : ""}.`,
          )}
          target="_blank"
          rel="noreferrer"
        >
          Ask for a nearby location
        </a>
      </Button>
      <a className="text-center text-sm font-semibold" href="tel:+2347067841607">
        Call +234 706 784 1607
      </a>
    </>
  );
}
function ServicePanel() {
  const [service, setService] = useState("Pharmacist consultation");
  const [date, setDate] = useState("");
  const [state, setState] = useState("Lagos");
  const [ready, setReady] = useState(false);
  const localToday = new Date().toLocaleDateString("en-CA");
  return (
    <>
      <CalendarDays className="size-10 text-forest" />
      <DialogTitle className="text-2xl font-bold">A little more personal care</DialogTitle>
      <DialogDescription>
        Tell us what you need. Our team will confirm availability.
      </DialogDescription>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setReady(true);
        }}
      >
        <label className="block text-sm font-semibold">
          Service
          <select
            className="commerce-input mt-1"
            value={service}
            onChange={(e) => {
              setService(e.target.value);
              setReady(false);
            }}
          >
            {[
              "Pharmacist consultation",
              "Prescription refill",
              "Blood pressure check",
              "Health screening",
              "Vaccination enquiry",
              "Skincare consultation",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Preferred date
          <input
            className="commerce-input mt-1"
            type="date"
            required
            min={localToday}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setReady(false);
            }}
          />
        </label>
        <label className="block text-sm font-semibold">
          State
          <select
            className="commerce-input mt-1"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setReady(false);
            }}
          >
            {nigerianStates.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <Button className="w-full" type="submit">
          Review request
        </Button>
      </form>
      {ready && (
        <div role="status" className="space-y-3 rounded-xl bg-secondary p-4 text-sm leading-6">
          <p>
            {service} · {date} · {state}
          </p>
          <p>No appointment is booked yet. Send your preference to our team for confirmation.</p>
          <Button asChild className="w-full">
            <a
              href={whatsapp(
                `Hello ReliefPoint, I'd like to ask about ${service} in ${state} on ${date}. Please confirm availability and any fees.`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Send request on WhatsApp
            </a>
          </Button>
        </div>
      )}
      <p className="flex gap-2 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        For emergencies, contact local emergency services. This form is for routine care enquiries.
      </p>
    </>
  );
}
