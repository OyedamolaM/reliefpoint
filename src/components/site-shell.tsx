import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCommerce } from "./commerce-provider";
export function SiteShell({ children }: { children: ReactNode }) {
  const shop = useCommerce();
  return (
    <div className="min-h-screen bg-white text-brand-ink">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <Link to="/" className="flex items-center gap-3 text-xl font-bold">
            <img src="/reliefpoint-icon-blue.svg" alt="" width="36" height="36" />
            ReliefPoint Pharmacy
          </Link>
          <nav className="flex flex-wrap gap-5 text-sm font-semibold">
            <Link to="/">Shop</Link>
            <Link to="/health-tips">Health Tips</Link>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/account">My account</Link>
            <button onClick={shop.openWishlist}>Wishlist ({shop.wishlist.length})</button>
            <button onClick={shop.openCart}>Cart ({shop.count})</button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
      <footer className="mt-12 bg-brand px-5 py-10 text-white">
        <div className="mx-auto max-w-6xl space-y-5">
          <p className="font-bold">Relief Point Pharmacy</p>
          <div className="flex flex-wrap gap-5 text-sm">
            <Link to="/about">About us</Link>
            <Link to="/contact">Contact us</Link>
            <Link to="/privacy-policy">Privacy policy</Link>
            <Link to="/refund-policy">Refund policy</Link>
            <Link to="/shipping-policy">Shipping policy</Link>
          </div>
          {shop.settings.pcn_logo && (
            <img
              src={shop.settings.pcn_logo}
              alt="Pharmacy Council of Nigeria"
              className="h-20 w-auto object-contain"
            />
          )}
          {shop.settings.address && <p>{shop.settings.address}</p>}
          <p className="text-sm">Pharm Chisom Onyejegbu · Pharmacist registration number 027390</p>
          <a href="mailto:support@reliefpointpharmacy.com">support@reliefpointpharmacy.com</a>
        </div>
      </footer>
    </div>
  );
}
