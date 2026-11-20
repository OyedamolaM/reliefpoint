import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Heart,
  HeartHandshake,
  Menu,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Trash2,
  Truck,
  Upload,
  Wallet,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import heroImage from "@/assets/pharmacy-hero.webp";
import supplementImage from "@/assets/pharmacy-supplements.webp";
import skincareImage from "@/assets/pharmacy-skincare.webp";
import devicesImage from "@/assets/pharmacy-health-devices.webp";

const WHATSAPP_NUMBER = "2347067841607";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

const categories = [
  { name: "Vitamins & wellness", image: supplementImage, note: "Everyday essentials" },
  { name: "Skincare", image: skincareImage, note: "Care that feels good" },
  { name: "Health devices", image: devicesImage, note: "Feel good to know" },
  { name: "Pharmacy essentials", image: heroImage, note: "The little things, sorted" },
] as const;

const products = [
  {
    id: "vitamin-c",
    name: "Vitamin C Daily",
    detail: "Daily wellness · 30 tablets",
    price: 8900,
    category: "Vitamins & wellness",
    image: supplementImage,
    tag: "EVERYDAY PICK",
  },
  {
    id: "daily-multi",
    name: "The Daily Multi",
    detail: "A considered daily essential",
    price: 12500,
    category: "Vitamins & wellness",
    image: supplementImage,
    tag: "WELLNESS",
  },
  {
    id: "soft-moisturiser",
    name: "Soft Skin Moisturiser",
    detail: "Daily face & body hydration",
    price: 9800,
    category: "Skincare",
    image: skincareImage,
    tag: "SKINCARE",
  },
  {
    id: "sun-care",
    name: "Daily Sun Care",
    detail: "Lightweight everyday protection",
    price: 13200,
    category: "Skincare",
    image: skincareImage,
    tag: "BESTSELLER",
  },
  {
    id: "blood-pressure",
    name: "Home Health Monitor",
    detail: "Easy-to-use home health device",
    price: 25000,
    category: "Health devices",
    image: devicesImage,
    tag: "HOME HEALTH",
  },
  {
    id: "first-aid",
    name: "Ready When You Need It",
    detail: "Everyday first-aid essentials",
    price: 7500,
    category: "Pharmacy essentials",
    image: heroImage,
    tag: "AT HOME",
  },
] as const;

type Product = (typeof products)[number];
type CartItem = { product: Product; quantity: number };

const formatNaira = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ReliefPoint Pharmacy | A little more care, every day" },
      {
        name: "description",
        content:
          "Explore everyday wellness, personal care and pharmacy essentials at ReliefPoint Pharmacy. Helpful care, with our friendly team just a WhatsApp away.",
      },
      { property: "og:title", content: "ReliefPoint Pharmacy | A little more care, every day" },
      {
        property: "og:description",
        content:
          "Discover considered wellness picks and everyday pharmacy essentials at ReliefPoint Pharmacy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Storefront,
});

function Storefront() {
  const [activeCategory, setActiveCategory] = useState<string>("All products");
  const [searchText, setSearchText] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [savedProducts, setSavedProducts] = useState<string[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const shownProducts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory =
        activeCategory === "All products" || product.category === activeCategory;
      const matchesSearch =
        !query || `${product.name} ${product.detail} ${product.category}`.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchText]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );

  const addToCart = (product: Product) => {
    setCart((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      if (existing) {
        return items.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...items, { product, quantity: 1 }];
    });
    setCartOpen(true);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((items) =>
      items
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((items) => items.filter((item) => item.product.id !== productId));
  };

  const toggleSaved = (productId: string) => {
    setSavedProducts((saved) =>
      saved.includes(productId)
        ? saved.filter((savedId) => savedId !== productId)
        : [...saved, productId],
    );
  };

  const selectCategory = (category: string) => {
    setActiveCategory(category);
    document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="bg-forest text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-xs font-medium sm:text-sm">
          <PackageCheck aria-hidden="true" className="size-4 shrink-0 text-lime" />
          <span>A little more care, right around the corner.</span>
          <a
            className="hidden items-center gap-1 underline underline-offset-4 sm:inline-flex"
            href="#services"
          >
            Say hello <ArrowRight aria-hidden="true" className="size-3" />
          </a>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <a className="flex min-w-0 items-center gap-2.5" href="#top" aria-label="ReliefPoint Pharmacy home">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-forest">
              <HeartHandshake aria-hidden="true" className="size-5" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-[19px] text-forest">
                ReliefPoint
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Pharmacy
              </span>
            </span>
          </a>

          <nav aria-label="Main navigation" className="hidden items-center gap-7 lg:flex">
            <a className="text-sm font-medium text-foreground/80 transition-colors hover:text-forest" href="#shop">
              Shop
            </a>
            <a className="text-sm font-medium text-foreground/80 transition-colors hover:text-forest" href="#services">
              Our care
            </a>
            <a className="text-sm font-medium text-foreground/80 transition-colors hover:text-forest" href="#rewards">
              Rewards
            </a>
            <a className="text-sm font-medium text-foreground/80 transition-colors hover:text-forest" href="#about">
              About us
            </a>
          </nav>

          <div className="flex items-center gap-1">
            <div className="hidden md:block">
              {searchOpen ? (
                <label className="flex h-10 w-56 items-center gap-2 rounded-md border border-input bg-card px-3 focus-within:ring-1 focus-within:ring-ring">
                  <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    aria-label="Search products"
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Find your essentials"
                    value={searchText}
                  />
                  <button
                    aria-label="Close search"
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSearchText("");
                      setSearchOpen(false);
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </label>
              ) : (
                <Button
                  aria-label="Search products"
                  className="size-10 rounded-full text-forest"
                  onClick={() => setSearchOpen(true)}
                  size="icon"
                  title="Search products"
                  variant="ghost"
                >
                  <Search aria-hidden="true" className="size-[18px]" />
                </Button>
              )}
            </div>

            <Button
              aria-expanded={cartOpen}
              aria-label={`Open shopping bag, ${cartCount} items`}
              className="relative size-10 rounded-full text-forest"
              onClick={() => setCartOpen(true)}
              size="icon"
              title="Shopping bag"
              variant="ghost"
            >
              <ShoppingBag aria-hidden="true" className="size-[18px]" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-[19px] items-center justify-center rounded-full bg-primary text-[10px] font-bold text-forest" aria-live="polite">
                  {cartCount}
                </span>
              )}
            </Button>

            <Button
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="size-10 rounded-full text-forest lg:hidden"
              onClick={() => setMobileMenuOpen((open) => !open)}
              size="icon"
              title="Menu"
              variant="ghost"
            >
              {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </Button>
          </div>
        </div>

        {searchOpen && (
          <div className="border-t border-border px-4 py-2 md:hidden">
            <label className="flex h-10 items-center gap-2 rounded-md border border-input bg-card px-3">
              <Search aria-hidden="true" className="size-4 text-muted-foreground" />
              <input
                aria-label="Search products"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Find your essentials"
                value={searchText}
              />
              <button
                aria-label="Close search"
                onClick={() => {
                  setSearchText("");
                  setSearchOpen(false);
                }}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </label>
          </div>
        )}

        {mobileMenuOpen && (
          <nav aria-label="Mobile navigation" className="grid gap-1 border-t border-border bg-background px-4 py-3 lg:hidden">
            {[
              ["Shop", "#shop"],
              ["Our care", "#services"],
              ["Rewards", "#rewards"],
              ["About us", "#about"],
            ].map(([label, href]) => (
              <a
                className="rounded-md px-3 py-3 text-sm font-medium text-foreground hover:bg-muted"
                href={href}
                key={href}
                onClick={() => setMobileMenuOpen(false)}
              >
                {label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <section className="relative overflow-hidden bg-leaf" id="top">
        <div className="mx-auto grid max-w-7xl items-center gap-2 px-4 py-10 sm:px-6 sm:py-12 lg:min-h-[485px] lg:grid-cols-[0.91fr_1.09fr] lg:gap-4 lg:py-10">
          <div className="relative z-10 max-w-[510px] py-3 lg:py-8">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-forest/10 bg-background/75 px-3 py-1.5 text-xs font-semibold text-forest">
              <Sparkles aria-hidden="true" className="size-3.5 text-forest" />
              HERE FOR YOUR EVERYDAY
            </div>
            <h1 className="max-w-[520px] font-display text-[45px] leading-[1.06] text-forest sm:text-[58px]">
              A little more care.
              <br />
              <span className="text-forest/65">Every single day.</span>
            </h1>
            <p className="mt-5 max-w-[390px] text-[15px] leading-7 text-forest/75 sm:text-base">
              Your neighbourhood pharmacy, thoughtfully brought closer. Discover trusted essentials and friendly, human care.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild className="h-12 rounded-full px-6 text-sm font-semibold">
                <a href="#shop">
                  Explore the shop <ArrowRight aria-hidden="true" className="size-4" />
                </a>
              </Button>
              <a
                className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-forest transition-colors hover:text-forest/70"
                href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy, I’d like to speak with your team.")}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <HeartHandshake aria-hidden="true" className="size-[18px]" />
                Talk to our team
              </a>
            </div>
            <div className="mt-8 flex items-center gap-3 text-xs text-forest/70">
              <ShieldCheck aria-hidden="true" className="size-4" />
              <span>Friendly people. Thoughtful, trusted care.</span>
            </div>
          </div>

          <div className="relative isolate min-h-[260px] overflow-hidden rounded-lg sm:min-h-[370px] lg:min-h-[430px]">
            <img
              alt="A bright, welcoming pharmacy with wellness and personal care essentials"
              className="float-gentle absolute inset-0 size-full object-cover object-[60%_center]"
              fetchPriority="high"
              src={heroImage}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-leaf/70 via-transparent to-transparent lg:bg-gradient-to-r lg:from-leaf/45 lg:via-transparent lg:to-transparent" />
            <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-lg border border-border/60 bg-background/90 px-4 py-3 shadow-sm backdrop-blur-sm sm:bottom-6 sm:left-6">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary text-forest">
                <Heart aria-hidden="true" className="size-[18px]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-forest">A pharmacy with heart</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Here when you need us</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Our care promise" className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <Promise icon={<BadgeCheck aria-hidden="true" />} label="Care you can trust" />
          <Promise icon={<Truck aria-hidden="true" />} label="Delivery details on request" />
          <Promise icon={<HeartHandshake aria-hidden="true" />} label="A friendly pharmacy team" />
          <Promise icon={<Wallet aria-hidden="true" />} label="Secure checkout coming soon" />
        </div>
      </section>

      <section aria-labelledby="categories-title" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-[72px]">
        <div className="mb-7 flex items-end justify-between gap-4 sm:mb-9">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">YOUR DAILY CARE, MADE SIMPLE</p>
            <h2 className="mt-2 font-display text-[32px] text-forest sm:text-[38px]" id="categories-title">A good place to begin.</h2>
          </div>
          <a className="mb-1 hidden items-center gap-1.5 text-sm font-semibold text-forest hover:underline sm:inline-flex" href="#shop">
            See all <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {categories.map((category) => (
            <button
              className="group min-w-0 overflow-hidden rounded-lg border border-border bg-card text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              key={category.name}
              onClick={() => selectCategory(category.name)}
              type="button"
            >
              <span className="block aspect-[1.48] overflow-hidden bg-leaf">
                <img
                  alt=""
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  loading="lazy"
                  src={category.image}
                />
              </span>
              <span className="block p-3 sm:p-4">
                <span className="block truncate text-sm font-semibold text-forest sm:text-[15px]">{category.name}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{category.note}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="shop-title" className="border-y border-border bg-secondary/40" id="shop">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-[72px]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">A FEW EVERYDAY FAVOURITES</p>
              <h2 className="mt-2 font-display text-[32px] text-forest sm:text-[38px]" id="shop-title">Good things for good days.</h2>
              <p className="mt-2 max-w-[520px] text-sm leading-6 text-muted-foreground">
                A little selection of things we think you’ll love — browse, save a favourite or start a basket.
              </p>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Filter products by category">
              {["All products", "Vitamins & wellness", "Skincare", "Health devices"].map((category) => (
                <button
                  aria-pressed={activeCategory === category}
                  className={`min-h-9 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                    activeCategory === category
                      ? "border-forest bg-forest text-white"
                      : "border-border bg-card text-muted-foreground hover:border-forest/30 hover:text-forest"
                  }`}
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  type="button"
                >
                  {category === "All products" ? "Everything" : category.replace(" & wellness", "")}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-5 inline-flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-xs leading-5 text-muted-foreground">
            <Sparkles aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-forest" />
            Preview shop: product selection and prices are examples. Stock and final prices will be confirmed before orders open.
          </p>

          {shownProducts.length ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
              {shownProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  saved={savedProducts.includes(product.id)}
                  onAdd={() => addToCart(product)}
                  onToggleSaved={() => toggleSaved(product.id)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-border bg-card px-5 py-12 text-center">
              <Search aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 font-semibold text-forest">No favourites found just yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different search or browse everything.</p>
              <Button
                className="mt-4 rounded-full"
                onClick={() => {
                  setSearchText("");
                  setActiveCategory("All products");
                }}
                variant="outline"
              >
                Show all products
              </Button>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-4 text-forest" /> Product advice from a friendly pharmacist, always.</span>
            <a className="inline-flex items-center gap-1.5 font-semibold text-forest hover:underline" href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy, can you help me choose a product?")}`} rel="noopener noreferrer" target="_blank">
              Need a hand? Ask us <ArrowRight aria-hidden="true" className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <section aria-labelledby="services-title" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-[72px]" id="services">
        <div className="grid items-start gap-9 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          <div className="lg:sticky lg:top-28">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">NOT JUST THE SHELVES</p>
            <h2 className="mt-2 font-display text-[34px] leading-[1.12] text-forest sm:text-[42px]" id="services-title">Good care is about more than what’s in your basket.</h2>
            <p className="mt-4 max-w-[440px] text-sm leading-7 text-muted-foreground">
              A real person is always a good next step. Reach out to our team for a friendly conversation about the care you need.
            </p>
            <Button asChild className="mt-6 h-11 rounded-full px-5">
              <a href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy, I’d like to ask about your care services.")}`} rel="noopener noreferrer" target="_blank">
                Ask our pharmacy team <ArrowRight aria-hidden="true" className="size-4" />
              </a>
            </Button>
          </div>
          <div className="divide-y divide-border border-y border-border">
            <ServiceItem number="01" icon={<Stethoscope aria-hidden="true" />} title="Talk it through with a pharmacist" description="A little reassurance can go a long way. Start a chat with our friendly pharmacy team." linkText="Start a conversation" href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy, I’d like to speak to a pharmacist.")}`} />
            <ServiceItem number="02" icon={<Upload aria-hidden="true" />} title="Prescription support" description="Need help arranging a prescription? Message our team to find out about the next step." linkText="Message the pharmacy" href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy, I have a prescription question.")}`} />
            <ServiceItem number="03" icon={<Truck aria-hidden="true" />} title="Delivery, with the details confirmed" description="Message us to check delivery availability and charges for your area before you place an order." linkText="Ask about delivery" href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy, can I check delivery to my area?")}`} />
            <ServiceItem number="04" icon={<Clock3 aria-hidden="true" />} title="A considered order, at your pace" description="Tell us what you're looking for. We’ll help point you in the right direction." linkText="Get in touch" href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy, I have a question about an order.")}`} />
          </div>
        </div>
      </section>

      <section aria-labelledby="rewards-title" className="bg-forest text-white" id="rewards">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_auto] lg:gap-12">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
              <Sparkles aria-hidden="true" className="size-3.5 text-lime" /> A LITTLE SOMETHING EXTRA
            </span>
            <h2 className="mt-4 font-display text-[34px] leading-tight text-white sm:text-[42px]" id="rewards-title">Good care should feel good to come back to.</h2>
            <p className="mt-3 max-w-[560px] text-sm leading-7 text-white/75">
              We’re dreaming up a rewards programme to say thank you for choosing ReliefPoint. We’ll share the details when it’s ready.
            </p>
          </div>
          <div className="flex max-w-xs items-start gap-3 rounded-lg border border-white/15 bg-white/5 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-forest"><Heart aria-hidden="true" className="size-[18px]" /></span>
            <div>
              <p className="text-sm font-semibold text-white">Rewards are on their way</p>
              <p className="mt-1 text-xs leading-5 text-white/65">A little thank-you from us, coming soon.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-[72px]" id="about">
        <div className="grid items-center gap-8 md:grid-cols-[0.96fr_1.04fr] md:gap-12">
          <div className="aspect-[1.35] overflow-hidden rounded-lg bg-leaf">
            <img alt="Thoughtful wellness and pharmacy essentials, selected with care" className="size-full object-cover object-[65%_50%]" loading="lazy" src={heroImage} />
          </div>
          <div className="max-w-[530px]">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">A LITTLE ABOUT US</p>
            <h2 className="mt-2 font-display text-[34px] leading-[1.12] text-forest sm:text-[42px]">Care should feel personal. Because it is.</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">We’re ReliefPoint Pharmacy — here to make the everyday feel a little easier. Thoughtful essentials, helpful advice and real people to talk to when you need us.</p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">We’d love to be part of your day. Tell us how we can help.</p>
            <a className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-forest hover:underline" href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy!")}`} rel="noopener noreferrer" target="_blank">
              Say hello on WhatsApp <ArrowRight aria-hidden="true" className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <section aria-label="Visit ReliefPoint Pharmacy on social media" className="border-y border-border bg-secondary/40">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-display text-[22px] text-forest">Let’s keep in touch.</p>
            <p className="mt-1 text-sm text-muted-foreground">Our social pages are coming soon. In the meantime, we’d love to hear from you.</p>
          </div>
          <a className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-forest hover:bg-muted" href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy!")}`} rel="noopener noreferrer" target="_blank">
            <HeartHandshake aria-hidden="true" className="size-4" /> Chat with our team
          </a>
        </div>
      </section>

      <footer className="bg-forest text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_0.8fr_0.8fr] md:py-14">
          <div>
            <a className="inline-flex items-center gap-2.5" href="#top" aria-label="ReliefPoint Pharmacy home">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-forest"><HeartHandshake aria-hidden="true" className="size-5" /></span>
              <span className="font-display text-[19px] text-white">ReliefPoint Pharmacy</span>
            </a>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/70">A little more care, a little closer to home. We look forward to being part of your day.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Here to help</p>
            <a className="mt-3 inline-flex items-center gap-2 text-sm text-white/75 transition-colors hover:text-white" href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy!")}`} rel="noopener noreferrer" target="_blank">
              <HeartHandshake aria-hidden="true" className="size-4 text-lime" />
              Chat on WhatsApp
            </a>
            <p className="mt-2 text-xs leading-5 text-white/55">Message us for order and delivery details.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Find your way</p>
            <div className="mt-3 grid gap-2">
              <a className="w-fit text-sm text-white/75 hover:text-white" href="#shop">Shop</a>
              <a className="w-fit text-sm text-white/75 hover:text-white" href="#services">Our care</a>
              <a className="w-fit text-sm text-white/75 hover:text-white" href="#rewards">Rewards</a>
              <a className="w-fit text-sm text-white/75 hover:text-white" href="#about">About us</a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/15">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>© {new Date().getFullYear()} ReliefPoint Pharmacy. All rights reserved.</p>
            <p>Prices and product selection shown are examples; shop checkout is not open yet.</p>
          </div>
        </div>
      </footer>

      <a
        aria-label="Chat with ReliefPoint Pharmacy on WhatsApp"
        className="fixed bottom-5 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-forest shadow-md transition-transform hover:-translate-y-0.5 hover:bg-secondary sm:bottom-7 sm:right-7"
        href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy, how can you help me today?")}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        <WhatsAppMark />
        <span className="hidden sm:inline">Chat with us</span>
      </a>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent className="flex w-[min(100%,420px)] flex-col gap-0 overflow-y-auto p-0 sm:max-w-md" side="right">
          <SheetHeader className="border-b border-border px-5 py-5 pr-14 text-left">
            <SheetTitle className="flex items-center gap-2 font-display text-[25px] text-forest">
              <ShoppingBag aria-hidden="true" className="size-5" /> Your basket
              {cartCount > 0 && <span className="rounded-full bg-leaf px-2 py-0.5 font-sans text-xs font-semibold text-forest">{cartCount}</span>}
            </SheetTitle>
            <SheetDescription className="text-left text-xs leading-5">
              {cartCount > 0 ? "Check your picks before you continue." : "Your little corner of care starts here."}
            </SheetDescription>
          </SheetHeader>

          {cart.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-leaf text-forest"><ShoppingBag aria-hidden="true" className="size-6" /></span>
              <p className="mt-4 font-display text-[24px] text-forest">Nothing here just yet.</p>
              <p className="mt-2 max-w-[260px] text-sm leading-6 text-muted-foreground">Explore our sample picks and discover your everyday favourites.</p>
              <Button className="mt-5 rounded-full px-5" onClick={() => setCartOpen(false)}>Explore the shop <ArrowRight aria-hidden="true" className="size-4" /></Button>
            </div>
          ) : (
            <>
              <ul className="flex-1 divide-y divide-border px-5">
                {cart.map(({ product, quantity }) => (
                  <li className="flex gap-3 py-4" key={product.id}>
                    <span className="size-[76px] shrink-0 overflow-hidden rounded-md bg-leaf">
                      <img alt="" className="size-full object-cover" src={product.image} />
                    </span>
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="truncate text-sm font-semibold text-forest">{product.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatNaira(product.price)}</p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <Button aria-label={`Decrease quantity of ${product.name}`} className="size-7 rounded-full" onClick={() => updateQuantity(product.id, -1)} size="icon" variant="outline"><Minus aria-hidden="true" className="size-3" /></Button>
                        <span aria-live="polite" className="w-5 text-center text-sm font-semibold">{quantity}</span>
                        <Button aria-label={`Increase quantity of ${product.name}`} className="size-7 rounded-full" onClick={() => updateQuantity(product.id, 1)} size="icon" variant="outline"><Plus aria-hidden="true" className="size-3" /></Button>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between py-0.5">
                      <p className="text-sm font-semibold text-forest">{formatNaira(product.price * quantity)}</p>
                      <Button aria-label={`Remove ${product.name} from basket`} className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeFromCart(product.id)} size="icon" title="Remove item" variant="ghost"><Trash2 aria-hidden="true" className="size-4" /></Button>
                    </div>
                  </li>
                ))}
              </ul>

              <SheetFooter className="mt-auto block border-t border-border px-5 py-5">
                <div className="flex items-center justify-between text-sm font-semibold text-forest">
                  <span>Sample total</span><span>{formatNaira(cartTotal)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">Sample prices only. Delivery, stock and checkout details are not confirmed.</p>
                <Button className="mt-4 h-11 w-full rounded-full" onClick={() => setCheckoutOpen(true)}>
                  Checkout <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
                <Button className="mt-2 w-full rounded-full" onClick={() => setCartOpen(false)} variant="ghost">Keep looking</Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <SheetContent className="w-[min(100%,400px)] overflow-y-auto p-0 sm:max-w-sm" side="right">
          <SheetHeader className="border-b border-border px-5 py-5 pr-14 text-left">
            <SheetTitle className="font-display text-[25px] text-forest">Almost ready.</SheetTitle>
            <SheetDescription className="text-left text-xs leading-5">Your sample basket is here; online checkout is still being prepared.</SheetDescription>
          </SheetHeader>
          <div className="px-5 py-6">
            <div className="rounded-lg border border-border bg-leaf p-4">
              <p className="text-sm font-semibold text-forest">No order has been placed.</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Products, prices, availability and delivery fees shown here are examples only. Checkout will open when the shop is ready.</p>
            </div>
            <div className="mt-5 flex items-center justify-between text-sm font-semibold text-forest"><span>Sample basket total</span><span>{formatNaira(cartTotal)}</span></div>
            <a
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-forest transition-colors hover:bg-primary/85"
              href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hello ReliefPoint Pharmacy, I'd like to ask about the example items in my basket before placing an order.")}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              Ask us on WhatsApp <ArrowRight aria-hidden="true" className="size-4" />
            </a>
            <Button className="mt-2 w-full rounded-full" onClick={() => { setCheckoutOpen(false); setCartOpen(false); }} variant="ghost">Back to the shop</Button>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}

function Promise({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-[67px] items-center gap-2.5 px-4 py-3 sm:justify-center sm:px-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-leaf text-forest">{icon}</span>
      <span className="text-[11px] font-semibold leading-4 text-foreground/80 sm:text-xs">{label}</span>
    </div>
  );
}

function ProductCard({
  product,
  saved,
  onAdd,
  onToggleSaved,
}: {
  product: Product;
  saved: boolean;
  onAdd: () => void;
  onToggleSaved: () => void;
}) {
  return (
    <article className="group min-w-0 overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-leaf">
        <img
          alt={product.name}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
          src={product.image}
        />
        <span className="absolute left-2 top-2 rounded-sm border border-border/60 bg-background/90 px-2 py-1 text-[9px] font-bold tracking-[0.04em] text-forest backdrop-blur-sm">{product.tag}</span>
        <Button
          aria-label={saved ? `Remove ${product.name} from saved items` : `Save ${product.name}`}
          aria-pressed={saved}
          className={`absolute right-2 top-2 size-8 rounded-full bg-background/90 p-0 shadow-sm backdrop-blur-sm ${saved ? "text-destructive" : "text-forest"}`}
          onClick={onToggleSaved}
          size="icon"
          title={saved ? "Remove saved item" : "Save for later"}
          variant="ghost"
        >
          <Heart aria-hidden="true" className="size-4" fill={saved ? "currentColor" : "none"} />
        </Button>
      </div>
      <div className="p-2.5 sm:p-3">
        <p className="min-h-3 truncate text-[9px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{product.category}</p>
        <h3 className="mt-1 min-h-[2.5rem] line-clamp-2 text-xs font-semibold leading-5 text-forest sm:text-sm">{product.name}</h3>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-[11px]">{product.detail}</p>
        <div className="mt-2.5 flex items-center justify-between gap-1.5">
          <span className="text-xs font-bold text-forest sm:text-sm">{formatNaira(product.price)}</span>
          <Button aria-label={`Add ${product.name} to basket`} className="size-8 shrink-0 rounded-full sm:size-9" onClick={onAdd} size="icon" title="Add to basket">
            <Plus aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}

function ServiceItem({
  number,
  icon,
  title,
  description,
  linkText,
  href,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  description: string;
  linkText: string;
  href: string;
}) {
  return (
    <article className="grid grid-cols-[30px_40px_1fr] gap-3 py-5 sm:grid-cols-[36px_44px_1fr] sm:gap-4 sm:py-6">
      <span className="pt-1 text-xs font-semibold tabular-nums text-muted-foreground">{number}</span>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-leaf text-forest sm:size-11">{icon}</span>
      <div className="min-w-0 pt-0.5">
        <h3 className="font-display text-[18px] leading-tight text-forest sm:text-[21px]">{title}</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">{description}</p>
        <a className="mt-2.5 inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-forest hover:underline sm:text-sm" href={href} rel="noopener noreferrer" target="_blank">
          {linkText} <ArrowRight aria-hidden="true" className="size-3.5" />
        </a>
      </div>
    </article>
  );
}

function WhatsAppMark() {
  return (
    <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-forest text-primary">
      <HeartHandshake className="size-4" />
    </span>
  );
}
