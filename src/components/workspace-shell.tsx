import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu, LogOut, X, type LucideIcon } from "lucide-react";
import { useAccount } from "./auth-provider";
import { notifyError } from "@/lib/api";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

export type WorkspaceItem = { key: string; label: string; icon: LucideIcon };
export function WorkspaceShell({
  children,
  items,
  active,
  onNavigate,
  title,
  subtitle,
  admin = false,
}: {
  children: ReactNode;
  items: WorkspaceItem[];
  active: string;
  onNavigate: (key: string) => void;
  title: string;
  subtitle?: string | undefined;
  admin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const account = useAccount();
  return (
    <div className="workspace min-h-screen bg-[#F3F6FA] text-[#172747]">
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-24 items-center gap-3 border-b border-slate-100 px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src="/reliefpoint-icon-blue.svg" alt="" className="h-10 w-10" />
            <span className="text-lg font-bold leading-tight">
              ReliefPoint
              <span className="block text-xs font-medium text-slate-500">
                {admin ? "Pharmacy administration" : "Your account"}
              </span>
            </span>
          </Link>
          <button
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="ml-auto lg:hidden"
          >
            <X size={18} />
          </button>
        </div>
        <p className="px-6 pb-3 pt-7 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">
          {admin ? "Workspace" : "My ReliefPoint"}
        </p>
        <nav
          aria-label={admin ? "Administration" : "Account"}
          className="flex-1 space-y-1 overflow-y-auto px-3"
        >
          {items.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              aria-current={active === key ? "page" : undefined}
              onClick={() => {
                onNavigate(key);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${active === key ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="space-y-4 border-t border-slate-100 p-5">
          <Link
            to={admin ? "/account" : "/"}
            className="flex items-center justify-between text-sm font-semibold"
          >
            {admin ? "My account" : "Continue shopping"}
            <ArrowUpRight size={16} />
          </Link>
          {!admin && !!account.user?.roles.length && (
            <Link to="/admin" className="block text-sm font-semibold text-brand">
              Administration
            </Link>
          )}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf1ff] font-bold text-brand">
              {(account.user?.name || account.user?.email || "R").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{account.user?.name || "My account"}</p>
              <p className="truncate text-xs text-slate-500">{account.user?.email}</p>
            </div>
            <button
              aria-label="Sign out"
              onClick={() => void account.logout().catch(notifyError)}
              className="rounded-lg p-2 hover:bg-slate-100"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="flex h-20 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
              className="rounded-lg border p-2 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <span className="text-sm text-slate-500">
              {admin ? "Administration" : "My account"}
              <span className="mx-3 text-slate-300">/</span>
              <span className="font-semibold text-slate-800">{title}</span>
            </span>
          </div>
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 text-xs font-semibold text-brand"
          >
            Visit store
            <ArrowUpRight size={15} />
          </Link>
        </header>
        <main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-8 sm:py-9 xl:px-10">
          <div className="mb-7">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
export function WorkspaceModal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border-slate-200 bg-white p-5 sm:p-8">
        <DialogTitle className="pr-6 text-xl">{title}</DialogTitle>
        <DialogDescription className={description ? "" : "sr-only"}>
          {description || title}
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function EmptyWorkspace({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center">
      <p className="font-semibold">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{description}</p>}
    </div>
  );
}
