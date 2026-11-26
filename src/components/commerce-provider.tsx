import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  Minus,
  Plus,
  Trash2,
  Upload,
  ShoppingBag,
  CheckCircle2,
  CreditCard,
  Landmark,
  Smartphone,
  ShieldCheck,
  Heart,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import {
  clearSavedBasket,
  saveCookiePreferences,
  useCookiePreferences,
} from "@/lib/cookie-preferences";
import { useDeliveryDraft } from "@/hooks/use-delivery-draft";
import { CheckoutProgress } from "./checkout-progress";
import { toast } from "sonner";
import { useAccount } from "./auth-provider";
import { LiveCheckout } from "./live-checkout";
import { api, send, notifyError } from "@/lib/api";
import { slugify } from "@/lib/contracts";
import type { PublicSettings } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ProductVisual } from "@/components/product-visual";
import {
  CustomerPanels,
  type CustomerPanel,
  type ShoppingProfile,
} from "@/components/customer-panels";
import {
  CART_STORAGE_KEY,
  categories,
  WISHLIST_STORAGE_KEY,
  destinations,
  nigerianStates,
  products,
  restoreCart,
  restoreWishlist,
  formatNaira,
  totals,
  whatsapp,
  type CartItem,
  type Product,
} from "@/lib/commerce";

type Commerce = {
  categories: string[];
  settings: PublicSettings;
  catalog: Product[];
  backendEnabled: boolean;
  mergeCatalog: (products: Product[]) => void;
  cart: CartItem[];
  count: number;
  wishlist: string[];
  profile: ShoppingProfile | null;
  add: (product: Product, quantity?: number) => void;
  openCart: () => void;
  inspect: (product: Product) => void;
  toggleWishlist: (id: string) => void;
  openWishlist: () => void;
  openPanel: (panel: CustomerPanel) => void;
};
const Context = createContext<Commerce | null>(null);
export function useCommerce() {
  const value = useContext(Context);
  if (!value) throw new Error("CommerceProvider is required");
  return value;
}
export function CommerceProvider({
  children,
  initialCatalog = products,
  backendEnabled = false,
  businessSettings = {},
  categoryNames = [],
}: {
  children: ReactNode;
  initialCatalog?: Product[];
  backendEnabled?: boolean;
  businessSettings?: PublicSettings;
  categoryNames?: string[];
}) {
  const account = useAccount();
  const rememberBasket = useCookiePreferences();
  const restoredStorage = useRef(false);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [syncedUser, setSyncedUser] = useState<string | null>(null);
  const mergeCatalog = (incoming: Product[]) =>
    setCatalog((current) => [...new Map([...current, ...incoming].map((p) => [p.id, p])).values()]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [panel, setPanel] = useState<CustomerPanel | null>(null);
  const [profile, setProfile] = useState<ShoppingProfile | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [step, setStep] = useState(0);
  const deliveryDraft = useDeliveryDraft(account, !backendEnabled);
  const { state, setState, area: lga, setArea: setLga, contact, setContact } = deliveryDraft;
  const [deliveryStarted, setDeliveryStarted] = useState(false);
  const [deliveryComplete, setDeliveryComplete] = useState(false);
  const [checkoutLocked, setCheckoutLocked] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState("card");
  const [consent, setConsent] = useState(false);
  const quote = totals(cart, state, lga);
  const needsPrescription = cart.some((item) => item.product.prescription);
  const count = cart.reduce((n, item) => n + item.quantity, 0);
  const basketKey = JSON.stringify(cart.map((i) => [i.product.id, i.quantity, i.product.price]));
  useEffect(() => {
    setDeliveryComplete(false);
  }, [basketKey]);
  useEffect(() => {
    if (!backendEnabled) setDeliveryComplete(false);
  }, [contact, state, lga, file, backendEnabled]);
  useEffect(() => {
    if (rememberBasket === undefined || restoredStorage.current) return undefined;
    if (backendEnabled && account.loading) return undefined;
    restoredStorage.current = true;
    if (rememberBasket !== true) {
      clearSavedBasket();
      setReady(true);
      return undefined;
    }
    if (backendEnabled) {
      let active = true;
      try {
        const owner = localStorage.getItem("reliefpoint.basket.owner.v1");
        const permitted = !owner || owner === "guest" || owner === account.user?.id;
        if (!permitted) {
          setCart([]);
          setWishlist([]);
          setReady(true);
          return undefined;
        }
        // Account baskets are restored from the database; their local mirror must not be merged twice.
        if (owner && owner === account.user?.id) {
          setCart([]);
          setWishlist([]);
          setReady(true);
          return undefined;
        }
        const rawCart = permitted ? localStorage.getItem(CART_STORAGE_KEY) : null;
        const rawWishlist = permitted ? localStorage.getItem(WISHLIST_STORAGE_KEY) : null;
        const basket: unknown = JSON.parse(rawCart ?? "[]");
        const saved: unknown = JSON.parse(rawWishlist ?? "[]");
        const ids = [
          ...new Set([
            ...(Array.isArray(basket) ? basket.map((i) => i?.id) : []),
            ...(Array.isArray(saved) ? saved : []),
          ]),
        ]
          .filter((id): id is string => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id))
          .slice(0, 200);
        if (ids.length) {
          void send<{ products: Product[] }>("catalog/resolve", { ids })
            .then((result) => {
              if (!active) return;
              mergeCatalog(result.products);
              setCart(restoreCart(rawCart, result.products));
              setWishlist(restoreWishlist(rawWishlist, result.products));
              setReady(true);
            })
            .catch(notifyError);
          return () => {
            active = false;
          };
        }
      } catch {
        /* Invalid or unavailable local storage does not prevent shopping. */
      }
    }
    try {
      setCart(restoreCart(localStorage.getItem(CART_STORAGE_KEY), initialCatalog));
      setWishlist(restoreWishlist(localStorage.getItem(WISHLIST_STORAGE_KEY), initialCatalog));
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
    setReady(true);
    return undefined;
  }, [backendEnabled, account.loading, rememberBasket]);
  useEffect(() => {
    setProfile(account.user ? { name: account.user.name, email: account.user.email } : null);
    if (!account.user) {
      if (syncedUser) {
        setCart([]);
        setWishlist([]);
        setSyncedUser(null);
        setCartOpen(false);
        setStep(0);
        clearContact();
      }
      return;
    }
    if (!backendEnabled || !ready || syncedUser === account.user.id) return;
    const switching = !!syncedUser && syncedUser !== account.user.id;
    if (switching) {
      setCart([]);
      setWishlist([]);
      setCartOpen(false);
      setStep(0);
      clearContact();
    }
    let active = true;
    void api<{ cart: { id: string; quantity: number }[]; wishlist: string[] }>("customer/shopping")
      .then(async (saved) => {
        const ids = [
          ...new Set([
            ...saved.cart.map((i) => i.id),
            ...saved.wishlist,
            ...(switching ? [] : cart.map((i) => i.product.id)),
            ...(switching ? [] : wishlist),
          ]),
        ];
        const resolved = await send<{ products: Product[] }>("catalog/resolve", { ids });
        if (!active) return;
        mergeCatalog(resolved.products);
        setCart((current) => {
          const quantities = new Map(saved.cart.map((i) => [i.id, i.quantity]));
          for (const item of current)
            quantities.set(
              item.product.id,
              Math.min(99, (quantities.get(item.product.id) ?? 0) + item.quantity),
            );
          return [...quantities].flatMap(([id, quantity]) => {
            const product = resolved.products.find((p) => p.id === id);
            return product?.inStock ? [{ product, quantity }] : [];
          });
        });
        setWishlist((current) => [...new Set([...current, ...saved.wishlist])]);
        setSyncedUser(account.user!.id);
      })
      .catch(notifyError);
    return () => {
      active = false;
    };
  }, [account.user?.id, backendEnabled, ready]);
  useEffect(() => {
    if (!backendEnabled || !account.user || syncedUser !== account.user.id) return;
    const timer = setTimeout(() => {
      void send("customer/shopping", {
        cart: cart.map((i) => ({ id: i.product.id, quantity: i.quantity })),
        wishlist,
      }).catch(notifyError);
    }, 800);
    return () => clearTimeout(timer);
  }, [cart, wishlist, syncedUser, account.user?.id, backendEnabled]);
  useEffect(() => {
    if (error) toast.error(error, { id: error });
  }, [error]);
  useEffect(() => {
    if (
      rememberBasket !== true ||
      !ready ||
      (backendEnabled &&
        (account.loading ||
          (!!account.user && syncedUser !== account.user.id) ||
          (!!syncedUser && syncedUser !== account.user?.id)))
    )
      return;
    try {
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(cart.map(({ product, quantity }) => ({ id: product.id, quantity }))),
      );
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
      localStorage.setItem("reliefpoint.basket.owner.v1", account.user?.id ?? "guest");
    } catch {
      /* The current visit continues without persistence. */
    }
  }, [
    cart,
    wishlist,
    ready,
    account.user?.id,
    account.loading,
    syncedUser,
    backendEnabled,
    rememberBasket,
  ]);
  const clearContact = () => {
    deliveryDraft.clear();
    setFile(null);
    setConsent(false);
    setDeliveryStarted(false);
    setDeliveryComplete(false);
    setCheckoutLocked(false);
    setCheckoutBusy(false);
  };
  const closeCart = () => {
    setCartOpen(false);
    setError("");
    setFile(null);
    setConsent(false);
    setDeliveryStarted(false);
    setDeliveryComplete(false);
    setCheckoutLocked(false);
    setCheckoutBusy(false);
    setStep(0);
  };
  const openCart = () => {
    setProduct(null);
    setWishlistOpen(false);
    setStep(0);
    setError("");
    setCartOpen(true);
  };
  const add = (p: Product, quantity = 1) => {
    if (!p.inStock) {
      toast.info("This item is currently unavailable.");
      return;
    }
    mergeCatalog([p]);
    setCart((items) =>
      items.some((item) => item.product.id === p.id)
        ? items.map((item) =>
            item.product.id === p.id
              ? { ...item, quantity: Math.min(99, item.quantity + quantity) }
              : item,
          )
        : [...items, { product: p, quantity: Math.min(99, quantity) }],
    );
    openCart();
  };
  const changeQuantity = (id: string, delta: number) =>
    setCart((items) =>
      items
        .map((item) =>
          item.product.id === id
            ? { ...item, quantity: Math.min(99, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  const toggleWishlist = (id: string) => {
    toast.success(
      wishlist.includes(id) ? "Removed from your wishlist." : "Saved to your wishlist.",
      { id: "wishlist" },
    );
    setWishlist((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  };
  const startDelivery = () => {
    setDeliveryStarted(true);
    if (profile) setContact((c) => ({ ...c, name: profile.name, email: profile.email }));
    setStep(1);
    setError("");
  };
  const review = () => {
    if (
      !contact.name.trim() ||
      !contact.address.trim() ||
      !contact.email.trim() ||
      !contact.phone.trim() ||
      quote.delivery === null
    ) {
      setError("Complete the contact and delivery fields.");
      return;
    }
    if (needsPrescription && !file) {
      setError("Select a prescription to continue.");
      return;
    }
    setError("");
    setDeliveryComplete(true);
    setStep(2);
  };
  const inquiry = `Hello ReliefPoint, please confirm availability and delivery for my basket:\n${cart.map(({ product: p, quantity }) => `${p.name} × ${quantity} — ${formatNaira(p.price * quantity)}`).join("\n")}\nDelivery area: ${lga}, ${state}\nEstimated total: ${formatNaira(quote.total)}\nPayment preference: ${payment}. Please confirm the final price before payment.`;
  return (
    <Context.Provider
      value={{
        categories: backendEnabled
          ? [...new Set([...categoryNames, ...catalog.map((p) => p.category)])]
          : [...categories],
        settings: businessSettings,
        catalog,
        backendEnabled,
        mergeCatalog,
        cart,
        count,
        wishlist,
        profile,
        add,
        openCart,
        inspect: (p) => {
          setProduct(p);
          if (p.live && p.slug)
            void api<{ item: Product | null }>(`product/${encodeURIComponent(p.slug)}`)
              .then((result) => {
                if (result.item)
                  setProduct((current) => (current?.id === p.id ? result.item : current));
              })
              .catch(notifyError);
        },
        toggleWishlist,
        openWishlist: () => setWishlistOpen(true),
        openPanel: setPanel,
      }}
    >
      {children}
      <CustomerPanels
        panel={panel}
        onClose={() => setPanel(null)}
        profile={profile}
        onProfile={setProfile}
      />
      <Dialog
        open={!!product}
        onOpenChange={(open) => {
          if (!open) setProduct(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl">
          <DialogTitle className="pr-6 text-2xl font-bold">{product?.name}</DialogTitle>
          <DialogDescription>Product information and pharmacist support</DialogDescription>
          {product && (
            <div className="space-y-4">
              <div className="grid gap-5 sm:grid-cols-2">
                <ProductVisual product={product} />
                <div className="flex flex-col justify-center">
                  <span className="mb-2 text-sm text-muted-foreground">{product.category}</span>
                  <p className="text-sm leading-6">{product.detail}</p>
                  <p className="my-4 text-2xl font-bold">{formatNaira(product.price)}</p>
                  <p className="mb-4 text-sm">
                    {product.prescription
                      ? "Prescription required · pharmacist review"
                      : "Confirm availability with our team"}
                  </p>
                  <Button
                    onClick={() => add(product)}
                    disabled={!product.inStock}
                    className="w-full"
                  >
                    {product.inStock ? "Add to cart" : "Currently unavailable"}
                  </Button>
                  <Button
                    variant="outline"
                    className="mt-2"
                    onClick={() => toggleWishlist(product.id)}
                  >
                    <Heart
                      className="size-4"
                      fill={wishlist.includes(product.id) ? "currentColor" : "none"}
                    />
                    {wishlist.includes(product.id) ? "Saved to wishlist" : "Save for later"}
                  </Button>
                </div>
              </div>
              <div className="rounded-xl bg-secondary p-4 text-sm leading-6">
                <p>
                  <strong>Directions: </strong>
                  {product.directions ??
                    (product.prescription
                      ? "Use only as prescribed after pharmacist review."
                      : product.category === "Medical Devices"
                        ? "Follow the manufacturer’s setup and operating instructions."
                        : "Follow the directions on the product label. Ask a pharmacist about suitability and interactions.")}
                </p>
                <p className="mt-3">
                  <strong>Storage: </strong>
                  {product.storage ??
                    "Keep in original packaging, away from children. Follow the storage conditions on the pack."}
                </p>
              </div>
              <a
                className="inline-flex text-sm font-semibold underline"
                href={whatsapp(
                  `Hello ReliefPoint, I'd like to check availability and ask a pharmacist about ${product.name}.`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                Ask a pharmacist about this product
              </a>
              <Link
                to="/products/$slug"
                params={{ slug: product.slug ?? slugify(product.name) }}
                onClick={() => setProduct(null)}
                className="block text-sm font-semibold underline"
              >
                View full product details
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Sheet open={wishlistOpen} onOpenChange={setWishlistOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="pr-6 text-left">
            <SheetTitle className="text-2xl">Your wishlist</SheetTitle>
            <SheetDescription>Keep your favourites together for your next visit.</SheetDescription>
          </SheetHeader>
          {wishlist.length ? (
            <ul className="mt-6 divide-y">
              {wishlist
                .map((id) => catalog.find((p) => p.id === id))
                .filter((p): p is Product => !!p)
                .map((p) => (
                  <li key={p.id} className="flex gap-3 py-4">
                    <div className="w-20 shrink-0">
                      <ProductVisual product={p} compact />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{p.name}</p>
                      <p className="my-2 text-sm">{formatNaira(p.price)}</p>
                      <Button size="sm" disabled={!p.inStock} onClick={() => add(p)}>
                        Add to cart
                      </Button>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${p.name} from wishlist`}
                      onClick={() => toggleWishlist(p.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
            </ul>
          ) : (
            <div className="py-16 text-center">
              <Heart className="mx-auto mb-4 size-10 text-brand/40" />
              <h3 className="text-xl font-semibold">Your favourites belong here</h3>
              <p className="my-3 text-muted-foreground">Tap the heart on a product to save it.</p>
              <Button onClick={() => setWishlistOpen(false)}>Discover products</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Sheet
        open={cartOpen}
        onOpenChange={(open) => {
          if (!open) closeCart();
        }}
      >
        <SheetContent className="flex w-full flex-col overflow-y-auto p-5 sm:max-w-lg">
          <SheetHeader className="pr-7 text-left">
            <SheetTitle className="text-2xl font-bold">
              {step === 0
                ? `Your cart (${count})`
                : step === 3
                  ? "Your checkout summary"
                  : "Secure checkout"}
            </SheetTitle>
            <SheetDescription>
              {step === 0
                ? "Your everyday care, all in one place."
                : "Review your details, delivery and payment preference."}
            </SheetDescription>
          </SheetHeader>
          {cart.length > 0 && step < 3 && (
            <CheckoutProgress
              step={step}
              available={deliveryComplete ? 2 : deliveryStarted ? 1 : 0}
              busy={checkoutBusy || checkoutLocked}
              onChange={(next) => {
                setError("");
                setStep(next);
              }}
            />
          )}
          {step === 0 &&
            (cart.length ? (
              <>
                {!backendEnabled && (
                  <div className="rounded-xl bg-leaf p-3 text-sm">
                    {quote.subtotal > 30000
                      ? "Your basket qualifies for free delivery."
                      : `Add ${formatNaira(30001 - quote.subtotal)} more for free delivery.`}
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full bg-brand transition-all"
                        style={{ width: `${Math.min(100, (quote.subtotal / 30001) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                <ul className="divide-y">
                  {cart.map(({ product: p, quantity }) => (
                    <li className="flex gap-3 py-4" key={p.id}>
                      <div className="w-16 shrink-0">
                        <ProductVisual product={p} compact />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{p.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatNaira(p.price)}
                          {p.prescription && " · Prescription required"}
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            className="size-8"
                            size="icon"
                            variant="outline"
                            aria-label={`Decrease ${p.name}`}
                            onClick={() => changeQuantity(p.id, -1)}
                          >
                            <Minus className="size-3" />
                          </Button>
                          <span className="w-5 text-center text-sm" aria-live="polite">
                            {quantity}
                          </span>
                          <Button
                            className="size-8"
                            size="icon"
                            variant="outline"
                            disabled={quantity >= 99}
                            aria-label={`Increase ${p.name}`}
                            onClick={() => changeQuantity(p.id, 1)}
                          >
                            <Plus className="size-3" />
                          </Button>
                          <Button
                            className="ml-auto size-8"
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove ${p.name}`}
                            onClick={() =>
                              setCart((items) => items.filter((item) => item.product.id !== p.id))
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                      <span className="text-sm font-bold">{formatNaira(p.price * quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto space-y-4 border-t pt-5">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Subtotal</span>
                    <span>{formatNaira(quote.subtotal)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Delivery is calculated at checkout.
                  </p>
                  <Button className="h-12 w-full" onClick={startDelivery}>
                    Proceed to checkout
                  </Button>
                  <Button className="w-full" variant="ghost" onClick={closeCart}>
                    Continue shopping
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-16 text-center">
                <ShoppingBag className="mx-auto mb-5 size-12 text-brand/30" />
                <h3 className="text-2xl font-semibold">Your cart is waiting for a little care</h3>
                <p className="my-4 text-muted-foreground">
                  Explore our essentials and find your favourites.
                </p>
                <Button onClick={closeCart}>Start shopping</Button>
              </div>
            ))}
          {backendEnabled && deliveryStarted && (
            <div hidden={step === 0}>
              <LiveCheckout
                key={account.user?.id ?? "guest"}
                cart={cart}
                activeStep={step === 2 ? 2 : 1}
                onStepChange={setStep}
                onBack={() => setStep(0)}
                onReadyChange={setDeliveryComplete}
                onLockedChange={setCheckoutLocked}
                onBusyChange={setCheckoutBusy}
              />
            </div>
          )}
          {!backendEnabled && step === 1 && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                review();
              }}
            >
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4" />
                Guest checkout · no account required
              </div>
              {(["name", "email", "phone", "address"] as const).map((field) => (
                <label key={field} className="block text-sm font-semibold">
                  {
                    {
                      name: "Full name",
                      email: "Email",
                      phone: "Nigerian phone number",
                      address: "Street address",
                    }[field]
                  }
                  <input
                    className="commerce-input mt-1"
                    type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                    autoComplete={
                      { name: "name", email: "email", phone: "tel", address: "street-address" }[
                        field
                      ]
                    }
                    required
                    minLength={field === "address" ? 5 : 2}
                    maxLength={field === "address" ? 250 : 100}
                    pattern={
                      field === "phone"
                        ? "(0[789][01][0-9]{8}|[+]234[789][01][0-9]{8}|234[789][01][0-9]{8})"
                        : undefined
                    }
                    placeholder={field === "phone" ? "08012345678" : undefined}
                    value={contact[field]}
                    onChange={(e) => setContact({ ...contact, [field]: e.target.value })}
                  />
                </label>
              ))}
              <label className="block text-sm font-semibold">
                State / FCT
                <select
                  className="commerce-input mt-1"
                  value={state}
                  required
                  onChange={(e) => {
                    setState(e.target.value);
                    setLga("");
                  }}
                >
                  <option value="">Select state</option>
                  {nigerianStates.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                LGA / City
                <input
                  className="commerce-input mt-1"
                  list="delivery-areas"
                  value={lga}
                  disabled={!state}
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Select or enter your area"
                  onChange={(e) => setLga(e.target.value)}
                />
                <datalist id="delivery-areas">
                  {destinations[state]?.map((area) => (
                    <option key={area} value={area} />
                  ))}
                </datalist>
              </label>
              <div className="rounded-xl bg-secondary p-4">
                <p className="flex justify-between text-sm font-bold">
                  <span>Delivery estimate</span>
                  <span>
                    {quote.delivery === null
                      ? "Select your area"
                      : quote.delivery === 0
                        ? "Free"
                        : formatNaira(quote.delivery)}
                  </span>
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Lagos from ₦2,000 · other states ₦4,500 · free over ₦30,000. Timing and final
                  availability are confirmed before dispatch.
                </p>
              </div>
              <label className="block text-sm font-semibold">
                Delivery notes (optional)
                <textarea
                  className="commerce-input mt-1"
                  rows={2}
                  maxLength={500}
                  placeholder="Landmark, gate instructions or preferred contact…"
                  value={contact.note}
                  onChange={(e) => setContact({ ...contact, note: e.target.value })}
                />
              </label>
              <label className="flex items-start gap-2 text-sm leading-6">
                <input
                  type="checkbox"
                  className="mt-1.5 accent-brand"
                  checked={deliveryDraft.remember === true}
                  onChange={(e) => saveCookiePreferences(e.target.checked)}
                />
                Remember my basket and delivery details on this browser for my next visit.
              </label>
              {needsPrescription && (
                <label className="block rounded-xl border border-dashed border-brand/40 p-4 text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    <Upload className="size-4" />
                    Prescription required
                  </span>
                  <span className="my-2 block text-muted-foreground">
                    PDF, JPEG or PNG · up to 5 MB. Selected files stay on this device until secure
                    uploads are connected.
                  </span>
                  <input
                    aria-label="Prescription file"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => {
                      setFile(null);
                      const selected = e.target.files?.[0];
                      if (!selected) return;
                      if (
                        selected.size > 5 * 1024 * 1024 ||
                        !["application/pdf", "image/jpeg", "image/png"].includes(selected.type)
                      ) {
                        setError("Choose a PDF, JPEG or PNG up to 5 MB.");
                        e.target.value = "";
                        return;
                      }
                      setFile(selected);
                      setError("");
                    }}
                  />
                  {file && (
                    <span className="mt-2 block break-all text-brand">Selected: {file.name}</span>
                  )}
                </label>
              )}
              <Button className="h-12 w-full" type="submit">
                Continue to payment
              </Button>
              <Button
                className="w-full"
                variant="ghost"
                type="button"
                onClick={() => {
                  setStep(0);
                  setError("");
                }}
              >
                Back to cart
              </Button>
            </form>
          )}
          {!backendEnabled && step === 2 && (
            <div className="space-y-5">
              <div className="rounded-xl border p-4 text-sm leading-6">
                <p className="font-bold">Delivery details</p>
                <p>
                  {contact.name} · {contact.phone}
                </p>
                <p>
                  {contact.address}, {lga}, {state}
                </p>
                <p>{contact.email}</p>
                {contact.note && <p>Note: {contact.note}</p>}
                {needsPrescription && (
                  <p className="mt-2 font-semibold">
                    Prescription selected · review required before dispensing
                  </p>
                )}
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-3 font-bold">Choose payment method</legend>
                {[
                  {
                    id: "card",
                    title: "Debit / credit card",
                    note: "Visa, Mastercard, Verve",
                    Icon: CreditCard,
                  },
                  {
                    id: "bank_transfer",
                    title: "Bank transfer",
                    note: "Pay from your bank app",
                    Icon: Landmark,
                  },
                  {
                    id: "ussd",
                    title: "USSD",
                    note: "Pay using your bank’s USSD code",
                    Icon: Smartphone,
                  },
                ].map(({ id, title, note, Icon }) => (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${payment === id ? "border-brand bg-secondary" : ""}`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      className="accent-brand"
                      checked={payment === id}
                      onChange={() => setPayment(id)}
                    />
                    <Icon className="size-5" />
                    <span className="text-sm">
                      <strong className="block">{title}</strong>
                      <span className="text-muted-foreground">{note}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <OrderTotals
                subtotal={quote.subtotal}
                delivery={quote.delivery}
                total={quote.total}
              />
              <label className="flex items-start gap-3 text-sm leading-6">
                <input
                  className="mt-1 size-4 shrink-0 accent-brand"
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I have reviewed the products, delivery details and total.
              </label>
              <Button className="h-12 w-full" disabled={!consent} onClick={() => setStep(3)}>
                Review checkout · {formatNaira(quote.total)}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep(1)}>
                Edit delivery details
              </Button>
            </div>
          )}
          {!backendEnabled && step === 3 && (
            <div className="space-y-5 py-5">
              <CheckCircle2 className="size-12 text-brand" />
              <h2 className="text-2xl font-bold">Everything in one place.</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Your basket and delivery details are ready. Online payments are not connected yet;
                no payment has been taken and no order has been submitted.
              </p>
              <OrderTotals
                subtotal={quote.subtotal}
                delivery={quote.delivery}
                total={quote.total}
              />
              <p className="text-sm">
                You can ask our team to confirm these items and delivery before paying.
              </p>
              <Button asChild className="h-12 w-full">
                <a href={whatsapp(inquiry)} target="_blank" rel="noreferrer">
                  Ask our team to confirm this basket
                </a>
              </Button>
              <Button className="w-full" variant="outline" onClick={() => setStep(2)}>
                Back to payment options
              </Button>
              <Button className="w-full" variant="ghost" onClick={closeCart}>
                Continue shopping
              </Button>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </SheetContent>
      </Sheet>
    </Context.Provider>
  );
}
function OrderTotals({
  subtotal,
  delivery,
  total,
}: {
  subtotal: number;
  delivery: number | null;
  total: number;
}) {
  return (
    <dl className="space-y-3 rounded-xl bg-secondary p-4 text-sm">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd>{formatNaira(subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt>Delivery estimate</dt>
        <dd>{delivery === 0 ? "Free" : formatNaira(delivery ?? 0)}</dd>
      </div>
      <div className="flex justify-between border-t border-brand/15 pt-3 text-lg font-bold">
        <dt>Total</dt>
        <dd>{formatNaira(total)}</dd>
      </div>
    </dl>
  );
}
