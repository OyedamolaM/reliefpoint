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
  cart: CartItem[];
  count: number;
  wishlist: string[];
  profile: ShoppingProfile | null;
  add: (product: Product) => void;
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
export function CommerceProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [panel, setPanel] = useState<CustomerPanel | null>(null);
  const [profile, setProfile] = useState<ShoppingProfile | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [step, setStep] = useState(0);
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [contact, setContact] = useState({ name: "", email: "", phone: "", address: "", note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState("card");
  const [consent, setConsent] = useState(false);
  const quote = totals(cart, state, lga);
  const needsPrescription = cart.some((item) => item.product.prescription);
  const count = cart.reduce((n, item) => n + item.quantity, 0);
  useEffect(() => {
    try {
      setCart(restoreCart(localStorage.getItem(CART_STORAGE_KEY)));
      setWishlist(restoreWishlist(localStorage.getItem(WISHLIST_STORAGE_KEY)));
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(cart.map(({ product, quantity }) => ({ id: product.id, quantity }))),
      );
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
    } catch {
      /* The current visit continues without persistence. */
    }
  }, [cart, wishlist, ready]);
  const clearContact = () => {
    setContact({ name: "", email: "", phone: "", address: "", note: "" });
    setFile(null);
    setState("");
    setLga("");
    setConsent(false);
  };
  const closeCart = () => {
    setCartOpen(false);
    setError("");
    clearContact();
    setStep(0);
  };
  const openCart = () => {
    setProduct(null);
    setWishlistOpen(false);
    setStep(0);
    setError("");
    setCartOpen(true);
  };
  const add = (p: Product) => {
    if (!p.inStock) return;
    setCart((items) =>
      items.some((item) => item.product.id === p.id)
        ? items.map((item) =>
            item.product.id === p.id
              ? { ...item, quantity: Math.min(99, item.quantity + 1) }
              : item,
          )
        : [...items, { product: p, quantity: 1 }],
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
  const toggleWishlist = (id: string) =>
    setWishlist((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  const startDelivery = () => {
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
    setStep(2);
  };
  const inquiry = `Hello ReliefPoint, please confirm availability and delivery for my basket:\n${cart.map(({ product: p, quantity }) => `${p.name} × ${quantity} — ${formatNaira(p.price * quantity)}`).join("\n")}\nDelivery area: ${lga}, ${state}\nEstimated total: ${formatNaira(quote.total)}\nPayment preference: ${payment}. Please confirm the final price before payment.`;
  return (
    <Context.Provider
      value={{
        cart,
        count,
        wishlist,
        profile,
        add,
        openCart,
        inspect: setProduct,
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
                  {product.prescription
                    ? "Use only as prescribed after pharmacist review."
                    : product.category === "Medical Devices"
                      ? "Follow the manufacturer’s setup and operating instructions."
                      : "Follow the directions on the product label. Ask a pharmacist about suitability and interactions."}
                </p>
                <p className="mt-3">
                  <strong>Storage: </strong>Keep in original packaging, away from children. Follow
                  the storage conditions on the pack.
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
                .map((id) => products.find((p) => p.id === id))
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
              <Heart className="mx-auto mb-4 size-10 text-forest/40" />
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
            <ol aria-label="Checkout progress" className="my-4 flex gap-2 text-sm">
              {["Cart", "Delivery", "Payment"].map((label, i) => (
                <li
                  key={label}
                  aria-current={step === i ? "step" : undefined}
                  className={`flex-1 border-b-2 pb-3 ${step === i ? "border-forest font-bold" : "text-muted-foreground"}`}
                >
                  {i + 1}. {label}
                </li>
              ))}
            </ol>
          )}
          {step === 0 &&
            (cart.length ? (
              <>
                <div className="rounded-xl bg-leaf p-3 text-sm">
                  {quote.subtotal > 30000
                    ? "Your basket qualifies for free delivery."
                    : `Add ${formatNaira(30001 - quote.subtotal)} more for free delivery.`}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full bg-forest transition-all"
                      style={{ width: `${Math.min(100, (quote.subtotal / 30001) * 100)}%` }}
                    />
                  </div>
                </div>
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
                <ShoppingBag className="mx-auto mb-5 size-12 text-forest/30" />
                <h3 className="text-2xl font-semibold">Your cart is waiting for a little care</h3>
                <p className="my-4 text-muted-foreground">
                  Explore our essentials and find your favourites.
                </p>
                <Button onClick={closeCart}>Start shopping</Button>
              </div>
            ))}
          {step === 1 && (
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
              {needsPrescription && (
                <label className="block rounded-xl border border-dashed border-forest/40 p-4 text-sm">
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
                    <span className="mt-2 block break-all text-forest">Selected: {file.name}</span>
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
          {step === 2 && (
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
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${payment === id ? "border-forest bg-secondary" : ""}`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      className="accent-forest"
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
                  className="mt-1 size-4 shrink-0 accent-forest"
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
          {step === 3 && (
            <div className="space-y-5 py-5">
              <CheckCircle2 className="size-12 text-forest" />
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
      <div className="flex justify-between border-t border-forest/15 pt-3 text-lg font-bold">
        <dt>Total</dt>
        <dd>{formatNaira(total)}</dd>
      </div>
    </dl>
  );
}
