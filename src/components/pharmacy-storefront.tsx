import { useRef, useState } from "react";
import {
  Activity,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardPlus,
  CreditCard,
  FlaskConical,
  Globe2,
  Heart,
  HeartHandshake,
  HeartPulse,
  MapPin,
  Menu,
  MessageCircle,
  PackageSearch,
  Pill,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Syringe,
  Truck,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useCommerce } from "@/components/commerce-provider";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ProductVisual } from "@/components/product-visual";
import {
  categories,
  filterProducts,
  formatNaira,
  products,
  whatsapp,
  type Product,
} from "@/lib/commerce";
import hero from "@/assets/pharmacy-hero.webp";
import supplements from "@/assets/pharmacy-supplements.webp";
import skincare from "@/assets/pharmacy-skincare.webp";
import devices from "@/assets/pharmacy-health-devices.webp";

export type StoreDesign = "flagship" | "marketplace" | "studio";
const slides = [
  {
    label: "YOUR HEALTH. OUR EVERYDAY PRIORITY.",
    title: "Everyday health.\nExtraordinary care.",
    text: "From pharmacy essentials to a little self-care. Find what you need, with a caring team by your side.",
    image: hero,
    category: "All",
    button: "Shop health essentials",
  },
  {
    label: "A LITTLE CARE GOES A LONG WAY.",
    title: "Good skin days\nstart right here.",
    text: "Cleansers, moisturisers and everyday protection. Discover a routine that feels like you.",
    image: skincare,
    category: "Skincare",
    button: "Explore skincare",
  },
  {
    label: "SMALL HABITS. BETTER DAYS.",
    title: "Make room for\nyour wellbeing.",
    text: "Discover vitamins, supplements and daily essentials for your wellness routine.",
    image: supplements,
    category: "Vitamins",
    button: "Shop vitamins & supplements",
  },
];
const departmentGroups = [
  {
    title: "Medicines & health",
    items: [
      { label: "Prescription medicines", category: "Prescriptions" },
      { label: "Pain relief & OTC", category: "OTC" },
      { label: "Vitamins & supplements", category: "Vitamins" },
      { label: "Medical devices", category: "Medical Devices" },
      { label: "First aid essentials", category: "First Aid" },
    ],
  },
  {
    title: "Beauty & everyday care",
    items: [
      { label: "Skincare", category: "Skincare" },
      { label: "Body & personal care", category: "Personal Care" },
      { label: "Mother & child", category: "Mother & Child" },
      { label: "Oral care", category: "Oral Care" },
    ],
  },
];
const categoryIcons = [
  Pill,
  ClipboardPlus,
  Sparkles,
  Heart,
  HeartHandshake,
  Activity,
  UserRound,
  ShieldCheck,
  ClipboardPlus,
];
export function PharmacyStorefront({ design }: { design: StoreDesign }) {
  const shop = useCommerce();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("featured");
  const [maxPrice, setMaxPrice] = useState(100000);
  const [stockOnly, setStockOnly] = useState(false);
  const [dealsOnly, setDealsOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [slide, setSlide] = useState(design === "studio" ? 2 : 0);
  const activeSlide = slides[slide] ?? slides[0]!;
  const filtering =
    showAll || !!query.trim() || category !== "All" || dealsOnly || maxPrice < 100000 || stockOnly;
  const filtered = filterProducts(query, category, maxPrice, stockOnly)
    .filter((p) => !dealsOnly || p.deal)
    .sort((a, b) =>
      sort === "price-low"
        ? a.price - b.price
        : sort === "price-high"
          ? b.price - a.price
          : sort === "name"
            ? a.name.localeCompare(b.name)
            : 0,
    );
  const goShop = () => document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" });
  const choose = (value: string) => {
    setCategory(value);
    setQuery("");
    setDealsOnly(false);
    setShowAll(true);
    setMegaOpen(false);
    setMobileOpen(false);
    setSuggestionsOpen(false);
    goShop();
  };
  const reset = () => {
    setQuery("");
    setCategory("All");
    setDealsOnly(false);
    setMaxPrice(100000);
    setStockOnly(false);
    setSort("featured");
    setShowAll(false);
  };
  const hotDeals = () => {
    reset();
    setDealsOnly(true);
    setShowAll(true);
    setMobileOpen(false);
    goShop();
  };
  const filterControls = (
    <div className="filter-panel">
      <label>
        Category
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setShowAll(true);
          }}
        >
          <option value="All">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Price up to
        <select value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))}>
          <option value={100000}>Any price</option>
          <option value={5000}>₦5,000</option>
          <option value={10000}>₦10,000</option>
          <option value={20000}>₦20,000</option>
          <option value={50000}>₦50,000</option>
        </select>
      </label>
      <label>
        Sort by
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setShowAll(true);
          }}
        >
          <option value="featured">Featured</option>
          <option value="price-low">Price: low to high</option>
          <option value="price-high">Price: high to low</option>
          <option value="name">Name: A–Z</option>
        </select>
      </label>
      <label className="checkbox-filter">
        <input
          type="checkbox"
          checked={stockOnly}
          onChange={(e) => setStockOnly(e.target.checked)}
        />
        Available products
      </label>
      <button onClick={reset} className="text-sm font-semibold underline">
        Clear filters
      </button>
    </div>
  );
  const searchForm = (id: string) => (
    <form
      className="retail-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        setShowAll(true);
        setSuggestionsOpen(false);
        goShop();
      }}
    >
      <label className="sr-only" htmlFor={id}>
        Search products
      </label>
      <input
        id={id}
        type="search"
        placeholder="Search for medicines, vitamins, skincare…"
        autoComplete="off"
        value={query}
        onFocus={() => setSuggestionsOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setSuggestionsOpen(true);
        }}
      />
      <button aria-label="Search catalog" type="submit">
        <Search size={21} />
      </button>
      {suggestionsOpen && query.trim() && (
        <div className="search-suggestions">
          <div className="flex items-center justify-between px-4 pb-2 text-xs text-muted-foreground">
            <span>{filtered.length} matching products</span>
            <button
              type="button"
              className="!bg-transparent !p-1 !text-forest"
              aria-label="Close search suggestions"
              onClick={() => setSuggestionsOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          {filtered.slice(0, 4).map((p) => (
            <button
              type="button"
              className="suggestion"
              key={p.id}
              onClick={() => {
                shop.inspect(p);
                setSuggestionsOpen(false);
              }}
            >
              <span>
                {p.name}
                <small>{p.category}</small>
              </span>
              <strong>{formatNaira(p.price)}</strong>
            </button>
          ))}
          <button type="submit" className="all-search-results">
            {filtered.length ? "View all results" : "View search & filters"}
          </button>
        </div>
      )}
    </form>
  );
  return (
    <div className={`retail-store ${design === "studio" ? "retail-studio" : ""}`}>
      <div className="benefit-strip">
        <div className="retail-container">
          <span>
            <Globe2 />
            Shop for family back home
          </span>
          <span>
            <Truck />
            Delivery across Nigeria
          </span>
          <span>
            <ShieldCheck />
            Carefully selected essentials
          </span>
          <a href={whatsapp()} target="_blank" rel="noreferrer">
            <HeartHandshake />A caring team, one chat away
          </a>
        </div>
      </div>
      <header className="retail-header">
        <div className="retail-container main-header">
          <button
            className="mobile-menu-button"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={24} />
          </button>
          <a href="#top" className="retail-logo" aria-label="ReliefPoint Pharmacy home">
            <span className="logo-symbol">
              <PlusMark />
            </span>
            <span>
              ReliefPoint<small>PHARMACY & WELLNESS</small>
            </span>
          </a>
          <div className="desktop-search">{searchForm("desktop-store-search")}</div>
          <div className="header-actions">
            <button
              onClick={() => shop.openPanel("account")}
              className="header-action"
              aria-label="Open account"
            >
              <UserRound />
              <span>
                <small>
                  {shop.profile ? `Hi, ${shop.profile.name.split(" ")[0]}` : "Hi, Guest"}
                </small>
                <strong>{shop.profile ? "My profile" : "Sign in / Register"}</strong>
              </span>
            </button>
            <button
              onClick={shop.openWishlist}
              className="header-action wishlist-header"
              aria-label={`Open wishlist, ${shop.wishlist.length} items`}
            >
              <span className="relative">
                <Heart />
                {shop.wishlist.length > 0 && <b className="count-dot">{shop.wishlist.length}</b>}
              </span>
            </button>
            <button
              onClick={shop.openCart}
              className="header-action cart-action"
              aria-label={`Open cart, ${shop.count} items`}
            >
              <span className="relative">
                <ShoppingBag />
                <b className="count-dot" aria-live="polite">
                  {shop.count}
                </b>
              </span>
              <span>
                <small>Your cart</small>
                <strong>
                  {formatNaira(shop.cart.reduce((s, i) => s + i.product.price * i.quantity, 0))}
                </strong>
              </span>
            </button>
          </div>
          <div className="mobile-search">{searchForm("mobile-store-search")}</div>
        </div>
        <div className="retail-nav">
          <div className="retail-container nav-inner">
            <div className="department-control">
              <button
                className="department-toggle"
                aria-expanded={megaOpen}
                onClick={() => setMegaOpen(!megaOpen)}
              >
                <Menu size={19} />
                All products
                <ChevronDown size={16} />
              </button>
              {megaOpen && (
                <>
                  <button
                    className="mega-dismiss"
                    aria-label="Close product menu"
                    onClick={() => setMegaOpen(false)}
                  />
                  <div className="mega-menu">
                    {departmentGroups.map((group) => (
                      <div key={group.title}>
                        <h3>{group.title}</h3>
                        {group.items.map((item) => (
                          <button key={item.label} onClick={() => choose(item.category)}>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    ))}
                    <div className="mega-care">
                      <HeartHandshake className="size-8" />
                      <strong>Not sure where to start?</strong>
                      <p>Our team can help you find what you need.</p>
                      <a href={whatsapp()} target="_blank" rel="noreferrer">
                        Talk to a pharmacist
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>
            <nav aria-label="Main navigation">
              <button onClick={hotDeals} className="hot-deals">
                <Sparkles size={16} />
                Hot deals
              </button>
              <button onClick={() => choose("Prescriptions")}>Medicines</button>
              <button onClick={() => choose("Vitamins")}>Vitamins & supplements</button>
              <button onClick={() => choose("Skincare")}>Beauty & skincare</button>
              <button onClick={() => shop.openPanel("prescription")}>
                <Upload size={16} />
                Upload prescription
              </button>
              <button onClick={() => shop.openPanel("service")}>Health services</button>
            </nav>
            <button className="track-link" onClick={() => shop.openPanel("tracking")}>
              <PackageSearch size={17} />
              Track order
            </button>
          </div>
        </div>
      </header>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[min(340px,90vw)] overflow-y-auto p-5 [&>button.absolute]:hidden"
        >
          <SheetTitle className="sr-only">Store navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Browse departments and pharmacy services
          </SheetDescription>
          <div className="mobile-navigation-content">
            <div className="flex items-center justify-between border-b pb-4">
              <strong className="text-xl">ReliefPoint</strong>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
              >
                <X />
              </Button>
            </div>
            <button
              onClick={() => {
                setMobileOpen(false);
                shop.openPanel("account");
              }}
            >
              <UserRound size={18} />
              Sign in / Register
            </button>
            <button onClick={hotDeals}>
              <Sparkles size={18} />
              Hot deals
            </button>
            <h3 className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Shop by category
            </h3>
            {categories.map((c) => (
              <button key={c} onClick={() => choose(c)}>
                {c}
                <ChevronRight size={16} />
              </button>
            ))}
            <div className="mt-4 border-t pt-4">
              {[
                { label: "Upload prescription", panel: "prescription" },
                { label: "Health services", panel: "service" },
                { label: "Track order", panel: "tracking" },
                { label: "Find a location", panel: "stores" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setMobileOpen(false);
                    shop.openPanel(item.panel as "service");
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <main id="top">
        <section className="retail-container hero-layout" aria-label="Featured collections">
          <div className="hero-banner">
            <img
              key={activeSlide.image}
              src={activeSlide.image}
              alt="Pharmacy and wellness essentials"
              fetchPriority="high"
            />
            <div className="hero-shade" />
            <div className="hero-copy">
              <span className="hero-kicker">
                <span />
                {activeSlide.label}
              </span>
              <h1>
                {activeSlide.title.split("\n").map((line, i) => (
                  <span key={line} className={i === 1 ? "text-lime" : ""}>
                    {line}
                  </span>
                ))}
              </h1>
              <p>{activeSlide.text}</p>
              <Button
                className="h-12 rounded-lg px-6 font-bold"
                onClick={() => choose(activeSlide.category)}
              >
                {activeSlide.button}
              </Button>
              <div className="hero-dots" aria-label="Featured collection">
                {slides.map((s, i) => (
                  <button
                    aria-label={`Show ${s.button}`}
                    aria-current={slide === i ? "true" : undefined}
                    className={slide === i ? "active" : ""}
                    key={s.label}
                    onClick={() => setSlide(i)}
                  />
                ))}
              </div>
            </div>
            <div className="hero-controls">
              <button
                aria-label="Previous feature"
                onClick={() => setSlide((slide + slides.length - 1) % slides.length)}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                aria-label="Next feature"
                onClick={() => setSlide((slide + 1) % slides.length)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div className="hero-side">
            <button
              className="hero-service-card prescription-card"
              onClick={() => shop.openPanel("prescription")}
            >
              <span className="service-card-icon">
                <ClipboardPlus />
              </span>
              <span className="text-xs font-bold uppercase tracking-widest">
                REFILLS MADE SIMPLE
              </span>
              <strong>
                Have a prescription?
                <br />
                Let’s take care of it.
              </strong>
              <span className="service-card-link">
                Upload prescription
                <Upload size={15} />
              </span>
            </button>
            <button
              className="hero-service-card consultation-card"
              onClick={() => shop.openPanel("service")}
            >
              <span className="service-card-icon">
                <Stethoscope />
              </span>
              <span className="text-xs font-bold uppercase tracking-widest">HERE FOR YOU</span>
              <strong>
                A little advice.
                <br />A lot of reassurance.
              </strong>
              <span className="service-card-link">
                Speak to our team
                <HeartHandshake size={15} />
              </span>
            </button>
          </div>
        </section>
        <section className="retail-container shopping-promises" aria-label="Shopping benefits">
          {[
            { Icon: Truck, title: "Care, delivered", text: "Delivery across Nigeria" },
            {
              Icon: HeartHandshake,
              title: "People you can talk to",
              text: "Pharmacy support on WhatsApp",
            },
            {
              Icon: ShoppingBag,
              title: "Everything in one place",
              text: "Health, beauty & daily essentials",
            },
            {
              Icon: CreditCard,
              title: "Your preferred way to pay",
              text: "Card, bank transfer & USSD",
            },
          ].map(({ Icon, title, text }) => (
            <div key={title}>
              <Icon />
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </div>
          ))}
        </section>
        <section className="retail-container category-section">
          <SectionHeading eyebrow="FIND YOUR EVERYDAY ESSENTIALS" title="Shop by category" />
          <div className="category-circles">
            {categories.map((c, i) => {
              const Icon = categoryIcons[i] ?? Pill;
              return (
                <button key={c} onClick={() => choose(c)}>
                  <span className={`category-circle category-tone-${i % 4}`}>
                    <Icon size={32} strokeWidth={1.4} />
                  </span>
                  <strong>{c === "OTC" ? "Everyday medicines" : c}</strong>
                </button>
              );
            })}
          </div>
        </section>
        <section className="retail-container services-section" id="services">
          <SectionHeading
            eyebrow="MORE THAN A PHARMACY"
            title="A little more care, every day."
            action="Explore our services"
            onAction={() => shop.openPanel("service")}
          />
          <div className="service-shortcuts">
            {[
              {
                Icon: Stethoscope,
                title: "Talk to a pharmacist",
                action: () =>
                  window.open(
                    whatsapp("Hello ReliefPoint, I would like to speak to a pharmacist."),
                    "_blank",
                    "noopener,noreferrer",
                  ),
              },
              { Icon: Globe2, title: "Shop for family", action: () => choose("All") },
              { Icon: Activity, title: "Health checks", action: () => shop.openPanel("service") },
              { Icon: HeartPulse, title: "ReliefPoints", action: () => shop.openPanel("loyalty") },
              {
                Icon: Syringe,
                title: "Vaccination enquiries",
                action: () => shop.openPanel("service"),
              },
              {
                Icon: Upload,
                title: "Prescription refill",
                action: () => shop.openPanel("prescription"),
              },
            ].map(({ Icon, title, action }) => (
              <button key={title} onClick={action}>
                <span>
                  <Icon size={24} />
                </span>
                <strong>{title}</strong>
                <small>Find out more</small>
              </button>
            ))}
          </div>
        </section>
        <section className="retail-container catalog-section" id="shop">
          <SectionHeading
            eyebrow="YOUR HEALTH, WELL STOCKED"
            title={
              filtering
                ? dealsOnly
                  ? "Health & wellness deals"
                  : category === "All"
                    ? "Shop all products"
                    : category
                : "Popular essentials"
            }
            action={filtering ? "Back to featured" : "View all products"}
            onAction={() => {
              if (filtering) reset();
              else setShowAll(true);
            }}
          />
          <div className="catalog-toolbar">
            <div className="catalog-pills">
              {["All", "Vitamins", "Skincare", "OTC", "Mother & Child", "Medical Devices"].map(
                (c) => (
                  <button
                    key={c}
                    aria-pressed={category === c}
                    className={category === c ? "selected" : ""}
                    onClick={() => {
                      setCategory(c);
                      setShowAll(c !== "All");
                      setDealsOnly(false);
                    }}
                  >
                    {c === "All" ? "All essentials" : c}
                  </button>
                ),
              )}
            </div>
            <button
              className="filter-toggle"
              aria-haspopup={isMobile ? "dialog" : undefined}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal size={16} />
              Filters
            </button>
          </div>
          {!isMobile && (filtersOpen || filtering) && filterControls}
          <Dialog open={isMobile && filtersOpen} onOpenChange={setFiltersOpen}>
            <DialogContent className="mobile-filter-modal max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl">
              <DialogTitle className="pr-6 text-xl font-bold">Filter products</DialogTitle>
              <DialogDescription>Choose a category, price and sort order.</DialogDescription>
              {filterControls}
              <Button className="h-11 w-full" onClick={() => setFiltersOpen(false)}>
                Apply filters
              </Button>
            </DialogContent>
          </Dialog>
          {filtering && (
            <p role="status" className="my-4 text-sm text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "product" : "products"}
              {query.trim() ? ` matching “${query.trim()}”` : ""}
            </p>
          )}
          {filtered.length ? (
            <div className="retail-product-grid">
              {(filtering ? filtered : filtered.slice(0, 5)).map((p) => (
                <RetailProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="empty-catalog">
              <Search className="mx-auto size-10 text-forest/30" />
              <h3>No products found</h3>
              <p>Try another search or clear your filters.</p>
              <Button onClick={reset} variant="outline">
                Clear filters
              </Button>
            </div>
          )}
        </section>
        {!filtering && (
          <>
            <section className="retail-container prescription-promo">
              <div>
                <span className="eyebrow">LESS HASSLE. MORE CARE.</span>
                <h2>
                  Your next refill,
                  <br />a little easier.
                </h2>
                <p>Have your prescription ready? Our team can guide you through the next step.</p>
                <Button
                  className="mt-5 bg-forest text-white hover:bg-forest/90"
                  onClick={() => shop.openPanel("prescription")}
                >
                  <Upload size={17} />
                  Upload prescription
                </Button>
              </div>
              <div className="prescription-promo-art">
                <ClipboardPlus size={130} strokeWidth={1} />
                <span>
                  <BadgeCheck size={24} />
                  Pharmacist review
                </span>
              </div>
              <div className="family-promo">
                <Globe2 size={32} />
                <h3>
                  Near or far,
                  <br />
                  care connects us.
                </h3>
                <p>Explore health essentials for your loved ones in Nigeria.</p>
                <button onClick={() => choose("All")}>Shop for your family</button>
              </div>
            </section>
            <ProductRail
              title="New in your care routine"
              eyebrow="A FRESH FIND FOR EVERY DAY"
              items={[...products].reverse().slice(0, 9)}
              onViewAll={() => {
                reset();
                setShowAll(true);
                goShop();
              }}
            />
            <section className="deal-banner">
              <div className="retail-container">
                <div>
                  <span className="text-xs font-bold tracking-widest">
                    GOOD THINGS. EVERYDAY VALUE.
                  </span>
                  <h2>
                    A little self-care.
                    <br />A lot to love.
                  </h2>
                  <p>Discover your next health and wellness favourite.</p>
                  <Button
                    className="mt-5 bg-forest text-white hover:bg-forest/90"
                    onClick={hotDeals}
                  >
                    Explore health deals
                  </Button>
                </div>
                <img src={skincare} alt="Skincare and personal care essentials" loading="lazy" />
              </div>
            </section>
            <ProductRail
              title="Health & wellness picks"
              eyebrow="LITTLE ESSENTIALS, BIG ON CARE"
              items={products.filter((p) => p.deal)}
              onViewAll={hotDeals}
            />
            <section className="retail-container care-editorial">
              <div className="care-editorial-image">
                <img src={devices} alt="Home health monitoring essentials" loading="lazy" />
              </div>
              <div>
                <span className="eyebrow">FEEL BETTER INFORMED</span>
                <h2>
                  Your health questions.
                  <br />A human on the other side.
                </h2>
                <p>
                  Questions about a medicine? Need help finding the right everyday essential? Start
                  a conversation with our pharmacy team.
                </p>
                <a
                  className="inline-flex items-center gap-2 rounded-lg bg-forest px-5 py-3.5 text-sm font-bold text-white"
                  href={whatsapp(
                    "Hello ReliefPoint, I would like some guidance from your pharmacy team.",
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={18} />
                  Chat with a pharmacist
                </a>
              </div>
            </section>
          </>
        )}
        <section className="retail-container faq-section" id="help">
          <div>
            <span className="eyebrow">A LITTLE CLARITY</span>
            <h2>How can we help?</h2>
            <p>Good care starts with good answers.</p>
            <a href={whatsapp()} target="_blank" rel="noreferrer">
              Talk to our team
            </a>
          </div>
          <div>
            {[
              {
                question: "How is my delivery fee calculated?",
                answer:
                  "Delivery estimates start at ₦2,000 for Lagos Mainland, ₦2,500 for Lagos Island zones, and ₦4,500 for other states. Baskets over ₦30,000 qualify for free delivery. Enter your address at checkout to see your estimate.",
              },
              {
                question: "Can I order prescription medicines?",
                answer:
                  "Select the prescribed items and attach your prescription during checkout. A pharmacist must review your prescription and confirm availability before medicines can be dispensed.",
              },
              {
                question: "Can I shop for family in Nigeria?",
                answer:
                  "Yes. Build a basket for your loved one and enter the recipient’s delivery details at checkout. Our team can help confirm the items and delivery arrangements.",
              },
              {
                question: "How do I speak with the pharmacy team?",
                answer:
                  "Use the WhatsApp chat button or call +234 706 784 1607. For a health service enquiry, select your preferred service, location and date and send your request to our team.",
              },
            ].map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <ChevronDown size={17} />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="retail-container contact-strip">
          <HeartHandshake />
          <div>
            <h2>A little more care is just a conversation away.</h2>
            <p>Products, prescriptions, delivery or a question on your mind. We’re here to help.</p>
          </div>
          <a href={whatsapp()} target="_blank" rel="noreferrer">
            Say hello on WhatsApp
          </a>
        </section>
      </main>
      <footer className="retail-footer">
        <div className="retail-container footer-grid">
          <div>
            <a href="#top" className="retail-logo">
              <span className="logo-symbol">
                <PlusMark />
              </span>
              <span>
                ReliefPoint<small>PHARMACY & WELLNESS</small>
              </span>
            </a>
            <p>
              Your everyday health, beauty and wellness essentials. Thoughtfully brought closer.
            </p>
            <a href="tel:+2347067841607" className="font-semibold">
              +234 706 784 1607
            </a>
            <a
              href={whatsapp()}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center gap-2 text-sm"
            >
              <MessageCircle size={16} />
              Connect on WhatsApp
            </a>
          </div>
          <div>
            <h3>Shop ReliefPoint</h3>
            {["OTC", "Vitamins", "Skincare", "Mother & Child", "Medical Devices"].map((c) => (
              <button key={c} onClick={() => choose(c)}>
                {c === "OTC" ? "Medicines & everyday health" : c}
              </button>
            ))}
          </div>
          <div>
            <h3>Care & services</h3>
            <button onClick={() => shop.openPanel("prescription")}>Prescription refill</button>
            <button onClick={() => shop.openPanel("service")}>Health services</button>
            <button onClick={() => shop.openPanel("stores")}>Find a location</button>
            <button onClick={() => shop.openPanel("loyalty")}>ReliefPoints</button>
            <a
              href={whatsapp(
                "Hello ReliefPoint, I would like to report a concern about a medicine.",
              )}
              target="_blank"
              rel="noreferrer"
            >
              Report a product concern
            </a>
          </div>
          <div>
            <h3>We’re here to help</h3>
            <button onClick={() => shop.openPanel("account")}>My account</button>
            <button onClick={shop.openWishlist}>My wishlist</button>
            <button onClick={() => shop.openPanel("tracking")}>Track an order</button>
            <a href="#help">Delivery & FAQs</a>
            <a
              href={whatsapp("Hello ReliefPoint, I have a question about returns and refunds.")}
              target="_blank"
              rel="noreferrer"
            >
              Returns & support
            </a>
          </div>
        </div>
        <div className="retail-container footer-bottom">
          <span>© {new Date().getFullYear()} ReliefPoint Pharmacy. All rights reserved.</span>
          <span>Prices and availability are confirmed before payment.</span>
          <span className="inline-flex items-center gap-2">
            <CreditCard size={17} />
            Card · Bank transfer · USSD
          </span>
        </div>
      </footer>
      <a
        className="whatsapp-float"
        href={whatsapp()}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat with ReliefPoint on WhatsApp"
      >
        <MessageCircle size={23} />
        <span>How can we help?</span>
      </a>
      <nav className="retail-mobile-bottom" aria-label="Mobile quick navigation">
        <a href="#top">
          <HeartPulse size={19} />
          Home
        </a>
        <button onClick={() => choose("All")}>
          <Search size={19} />
          Shop
        </button>
        <button onClick={() => shop.openPanel("prescription")}>
          <Upload size={19} />
          Prescription
        </button>
        <button onClick={shop.openWishlist}>
          <Heart size={19} />
          Wishlist
        </button>
        <button onClick={shop.openCart}>
          <ShoppingBag size={19} />
          Cart ({shop.count})
        </button>
      </nav>
    </div>
  );
}
function PlusMark() {
  return (
    <svg viewBox="0 0 32 32" width="27" height="27" fill="none" aria-hidden="true">
      <path d="M12 3h8v9h9v8h-9v9h-8v-9H3v-8h9V3Z" fill="currentColor" />
      <path
        d="m13 17 3 3 6-7"
        stroke="#0f2e22"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function SectionHeading({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="retail-section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
  );
}
function RetailProductCard({ product: p }: { product: Product }) {
  const shop = useCommerce();
  const saved = shop.wishlist.includes(p.id);
  return (
    <article className="retail-product-card">
      <div className="product-image-area">
        <button
          className="product-image-button"
          onClick={() => shop.inspect(p)}
          aria-label={`View ${p.name}`}
        >
          <ProductVisual product={p} />
        </button>
        {p.prescription ? (
          <span className="product-badge rx-badge">Rx required</span>
        ) : p.deal ? (
          <span className="product-badge">Wellness pick</span>
        ) : null}
        <button
          className={`save-product ${saved ? "saved" : ""}`}
          onClick={() => shop.toggleWishlist(p.id)}
          aria-label={`${saved ? "Unsave" : "Save"} ${p.name}`}
          aria-pressed={saved}
        >
          <Heart size={17} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="product-card-content">
        <p>{p.category}</p>
        <h3>
          <button onClick={() => shop.inspect(p)}>{p.name}</button>
        </h3>
        <span className="product-detail">{p.detail.split("·")[0]}</span>
        <strong className="product-price">{formatNaira(p.price)}</strong>
        {p.inStock ? (
          <button className="product-add-button" onClick={() => shop.add(p)}>
            <ShoppingBag size={16} />
            Add to cart
          </button>
        ) : (
          <a
            className="product-add-button unavailable"
            href={whatsapp(`Hello ReliefPoint, please let me know when ${p.name} is available.`)}
            target="_blank"
            rel="noreferrer"
          >
            Notify me
          </a>
        )}
      </div>
    </article>
  );
}
function ProductRail({
  title,
  eyebrow,
  items,
  onViewAll,
}: {
  title: string;
  eyebrow: string;
  items: Product[];
  onViewAll: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <section className="retail-container rail-section">
      <SectionHeading
        title={title}
        eyebrow={eyebrow}
        action="View all products"
        onAction={onViewAll}
      />
      <div className="rail-wrapper">
        <div className="retail-product-rail" ref={ref}>
          {items.map((p) => (
            <RetailProductCard key={p.id} product={p} />
          ))}
        </div>
        <div className="rail-controls">
          <button
            aria-label={`Previous ${title}`}
            onClick={() =>
              ref.current?.scrollBy({ left: -(ref.current.clientWidth * 0.8), behavior: "smooth" })
            }
          >
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label={`Next ${title}`}
            onClick={() =>
              ref.current?.scrollBy({ left: ref.current.clientWidth * 0.8, behavior: "smooth" })
            }
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
