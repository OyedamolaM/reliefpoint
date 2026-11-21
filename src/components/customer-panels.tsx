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
import { AuthForm } from "./account-page";
import { send, notifyError } from "@/lib/api";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useAccount } from "./auth-provider";
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
          <AccountDialog onClose={onClose} />
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
            <HeartHandshake className="size-10 text-brand" />
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
function AccountDialog({ onClose }: { onClose: () => void }) {
  const account = useAccount();
  return (
    <>
      <DialogTitle className="sr-only">Your account</DialogTitle>
      <DialogDescription className="sr-only">Manage your ReliefPoint account</DialogDescription>
      {account.user ? (
        <div className="space-y-5">
          <h2 className="text-2xl font-bold">Hello, {account.user.name || "there"}</h2>
          <p>{account.user.email}</p>
          <Button asChild>
            <Link to="/account" onClick={onClose}>
              Orders & account
            </Link>
          </Button>
          {account.user.roles.length > 0 && (
            <Link to="/admin" onClick={onClose} className="block underline">
              Administration
            </Link>
          )}
          <button
            className="block underline"
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
      ) : (
        <AuthForm />
      )}
    </>
  );
}
function PrescriptionPanel() {
  return (
    <>
      <Upload className="size-10 text-brand" />
      <DialogTitle className="text-2xl font-bold">Prescription care</DialogTitle>
      <DialogDescription>
        Upload your prescription securely during checkout or from your order page.
      </DialogDescription>
      <p className="text-sm leading-7">
        Your pharmacist will review it before dispensing. For help finding an item, speak to our
        team.
      </p>
      <Button asChild>
        <a
          href={whatsapp("Hello ReliefPoint, I need help with a prescription refill.")}
          target="_blank"
          rel="noreferrer"
        >
          Speak to a pharmacist
        </a>
      </Button>
      <Link to="/account" className="text-sm underline">
        View my orders
      </Link>
    </>
  );
}
function TrackingPanel() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PackageSearch className="size-10 text-brand" />
      <DialogTitle className="text-2xl font-bold">Track your order</DialogTitle>
      <DialogDescription>
        We?ll email a secure link to the address used at checkout.
      </DialogDescription>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await send<{ message: string }>(
              "customer/tracking",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
            setMessage(result.message);
            toast.success(result.message);
          } catch (error) {
            setMessage(notifyError(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm font-semibold">
          Order reference
          <input className="commerce-input mt-2" name="reference" required minLength={4} />
        </label>
        <label className="block text-sm font-semibold">
          Checkout email
          <input className="commerce-input mt-2" name="email" type="email" required />
        </label>
        <Button className="w-full" disabled={busy}>
          {busy ? "Sending?" : "Email tracking link"}
        </Button>
      </form>
      {message && (
        <p role="status" className="rounded-lg bg-secondary p-3 text-sm">
          {message}
        </p>
      )}
    </>
  );
}
function StorePanel() {
  const [location, setLocation] = useState("");
  return (
    <>
      <MapPin className="size-10 text-brand" />
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
      <CalendarDays className="size-10 text-brand" />
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
