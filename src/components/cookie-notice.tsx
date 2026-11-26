import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  cookieSettingsEvent,
  saveCookiePreferences,
  useCookiePreferences,
} from "@/lib/cookie-preferences";
export function CookieNotice() {
  const choice = useCookiePreferences();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  useEffect(() => {
    if (choice !== null && !open) return undefined;
    const update = () =>
      setDialogOpen(!!document.querySelector('[role="dialog"][data-state="open"]'));
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    update();
    return () => observer.disconnect();
  }, [choice, open]);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(cookieSettingsEvent, show);
    return () => window.removeEventListener(cookieSettingsEvent, show);
  }, []);
  if (dialogOpen || choice === undefined || (choice !== null && !open)) return null;
  const save = (remember: boolean) => {
    if (!saveCookiePreferences(remember)) toast.info("Your cookie choice is saved for this visit.");
    setOpen(false);
  };
  return (
    <section
      aria-label="Cookie choices"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 text-brand-ink shadow-2xl sm:inset-x-6 sm:bottom-5"
    >
      <h2 className="text-base font-bold">Your privacy choices</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Relief Point Pharmacy uses essential cookies for secure sign-in and checkout. Optional
        browser storage remembers your basket, wishlist and delivery details between visits. No
        advertising or analytics trackers are used.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        You can change this choice in Cookie settings.{" "}
        <Link
          to="/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand underline"
        >
          Read our Privacy Policy
        </Link>
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => save(false)}
          className="rounded-xl border border-brand px-4 py-3 text-sm font-semibold text-brand hover:bg-blue-50"
        >
          Essential only
        </button>
        <button
          type="button"
          onClick={() => save(true)}
          className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:brightness-110"
        >
          Accept optional storage
        </button>
      </div>
    </section>
  );
}
