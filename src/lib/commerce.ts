import { nigerianStates } from "./nigeria";
export { nigerianStates } from "./nigeria";
import supplements from "@/assets/pharmacy-supplements.webp";
import skincare from "@/assets/pharmacy-skincare.webp";
import devices from "@/assets/pharmacy-health-devices.webp";
import pharmacy from "@/assets/pharmacy-hero.webp";

export const categories = [
  "Prescriptions",
  "OTC",
  "Vitamins",
  "Skincare",
  "Mother & Child",
  "Medical Devices",
  "Personal Care",
  "Oral Care",
  "First Aid",
] as const;
export type Category = (typeof categories)[number];
export type Product = {
  slug?: string;
  imageAlt?: string;
  directions?: string;
  storage?: string;
  live?: boolean;
  id: string;
  name: string;
  detail: string;
  category: string;
  price: number;
  originalPrice?: number;
  image: string;
  inStock: boolean;
  prescription: boolean;
  deal: boolean;
};
// Presentation data only: these prices and availability are not a live inventory.
export const products: Product[] = [
  {
    id: "coartem",
    name: "Coartem 20/120 mg",
    detail: "Artemether / lumefantrine · prescription review required",
    category: "Prescriptions",
    price: 4800,
    image: pharmacy,
    inStock: true,
    prescription: true,
    deal: false,
  },
  {
    id: "amartem",
    name: "Amartem 20/120 mg",
    detail: "Artemether / lumefantrine · prescription review required",
    category: "Prescriptions",
    price: 3600,
    image: pharmacy,
    inStock: false,
    prescription: true,
    deal: false,
  },
  {
    id: "emzor",
    name: "Emzor Paracetamol 500 mg",
    detail: "Tablets · pack",
    category: "OTC",
    price: 650,
    image: pharmacy,
    inStock: true,
    prescription: false,
    deal: true,
  },
  {
    id: "ors",
    name: "Oral Rehydration Salts",
    detail: "Sachets · pharmacy essentials",
    category: "OTC",
    price: 1200,
    image: pharmacy,
    inStock: true,
    prescription: false,
    deal: false,
  },
  {
    id: "vitamin-c",
    name: "Vitamin C 1000 mg",
    detail: "30 tablets · everyday wellness",
    category: "Vitamins",
    price: 8900,
    image: supplements,
    inStock: true,
    prescription: false,
    deal: true,
  },
  {
    id: "multivitamin",
    name: "Wellman Original",
    detail: "30 tablets · multivitamins",
    category: "Vitamins",
    price: 14500,
    image: supplements,
    inStock: true,
    prescription: false,
    deal: false,
  },
  {
    id: "cerave",
    name: "CeraVe Moisturising Cream",
    detail: "177 ml · face & body care",
    category: "Skincare",
    price: 18500,
    image: skincare,
    inStock: true,
    prescription: false,
    deal: true,
  },
  {
    id: "cleanser",
    name: "CeraVe Hydrating Cleanser",
    detail: "236 ml · daily cleansing",
    category: "Skincare",
    price: 16500,
    image: skincare,
    inStock: true,
    prescription: false,
    deal: false,
  },
  {
    id: "baby",
    name: "Johnson’s Baby Lotion",
    detail: "200 ml · gentle family care",
    category: "Mother & Child",
    price: 4500,
    image: skincare,
    inStock: true,
    prescription: false,
    deal: true,
  },
  {
    id: "diapers",
    name: "Pampers Baby-Dry",
    detail: "Size 3 · pack",
    category: "Mother & Child",
    price: 9500,
    image: pharmacy,
    inStock: false,
    prescription: false,
    deal: false,
  },
  {
    id: "omron",
    name: "Omron M2 BP Monitor",
    detail: "Upper-arm monitor · home health",
    category: "Medical Devices",
    price: 68000,
    image: devices,
    inStock: true,
    prescription: false,
    deal: false,
  },
  {
    id: "thermometer",
    name: "Digital Thermometer",
    detail: "Everyday home health essential",
    category: "Medical Devices",
    price: 3500,
    image: devices,
    inStock: true,
    prescription: false,
    deal: true,
  },
];

export type CartItem = { product: Product; quantity: number };
export const formatNaira = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
export const whatsapp = (
  message = "Hello ReliefPoint, I'd like to check medication availability for...",
) => `https://wa.me/2347067841607?text=${encodeURIComponent(message)}`;
export const destinations: Record<string, readonly string[]> = {
  Lagos: [
    "Lagos Island",
    "Eti-Osa",
    "Ibeju-Lekki",
    "Lagos Mainland",
    "Ikeja",
    "Surulere",
    "Alimosho",
    "Kosofe",
    "Ikorodu",
    "Agege",
    "Ajeromi-Ifelodun",
    "Amuwo-Odofin",
    "Apapa",
    "Badagry",
    "Epe",
    "Ifako-Ijaiye",
    "Mushin",
    "Ojo",
    "Oshodi-Isolo",
    "Shomolu",
  ],
  "Abuja (FCT)": ["Abaji", "Abuja Municipal", "Bwari", "Gwagwalada", "Kuje", "Kwali"],
  Rivers: ["Port Harcourt", "Obio/Akpor", "Eleme", "Ikwerre", "Okrika"],
  Oyo: ["Ibadan North", "Ibadan South-West", "Ibadan North-East", "Ogbomosho North"],
  Ogun: ["Abeokuta South", "Ado-Odo/Ota", "Ifo", "Sagamu"],
  Delta: ["Oshimili South", "Warri South", "Uvwie", "Sapele"],
  Edo: ["Oredo", "Egor", "Ikpoba-Okha"],
  Kano: ["Kano Municipal", "Nassarawa", "Fagge", "Tarauni"],
};
export function deliveryFee(subtotal: number, state: string, lga: string) {
  if (!nigerianStates.includes(state) || lga.trim().length < 2) return null;
  if (subtotal > 30000) return 0;
  if (state === "Lagos") {
    const area = lga.trim().toLowerCase().replace(/[\s-]/g, "");
    return [
      "lagosisland",
      "etiosa",
      "ibejulekki",
      "lekki",
      "ikoyi",
      "victoriaisland",
      "ajah",
    ].includes(area)
      ? 2500
      : 2000;
  }
  return 4500;
}
export function totals(cart: CartItem[], state: string, lga: string) {
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const delivery = deliveryFee(subtotal, state, lga);
  return { subtotal, delivery, total: subtotal + (delivery ?? 0) };
}
export function filterProducts(
  query: string,
  category: string,
  maxPrice: number,
  stockOnly: boolean,
) {
  const term = query.trim().toLowerCase();
  return products.filter(
    (p) =>
      (!term || `${p.name} ${p.detail} ${p.category}`.toLowerCase().includes(term)) &&
      (category === "All" || p.category === category) &&
      p.price <= maxPrice &&
      (!stockOnly || p.inStock),
  );
}

products.push(
  {
    id: "sensodyne",
    name: "Sensodyne Daily Care",
    detail: "75 ml · toothpaste",
    category: "Oral Care",
    price: 4200,
    image: skincare,
    inStock: true,
    prescription: false,
    deal: false,
  },
  {
    id: "dettol",
    name: "Dettol Antiseptic Liquid",
    detail: "250 ml · first aid essential",
    category: "First Aid",
    price: 3800,
    image: pharmacy,
    inStock: true,
    prescription: false,
    deal: true,
  },
  {
    id: "nivea",
    name: "Nivea Body Lotion",
    detail: "400 ml · nourishing body care",
    category: "Personal Care",
    price: 6900,
    image: skincare,
    inStock: true,
    prescription: false,
    deal: false,
  },
  {
    id: "plasters",
    name: "Elastoplast Fabric Plasters",
    detail: "20 strips · first aid",
    category: "First Aid",
    price: 2500,
    image: pharmacy,
    inStock: true,
    prescription: false,
    deal: false,
  },
  {
    id: "omega",
    name: "Omega-3 Fish Oil",
    detail: "30 capsules · daily wellness",
    category: "Vitamins",
    price: 11500,
    image: supplements,
    inStock: true,
    prescription: false,
    deal: true,
  },
  {
    id: "sunscreen",
    name: "Nivea Sun SPF 50",
    detail: "50 ml · daily sun protection",
    category: "Skincare",
    price: 14800,
    image: skincare,
    inStock: true,
    prescription: false,
    deal: false,
  },
);
export const CART_STORAGE_KEY = "reliefpoint.basket.v1";
export const WISHLIST_STORAGE_KEY = "reliefpoint.wishlist.v1";
export function restoreCart(raw: string | null, catalog: Product[] = products): CartItem[] {
  try {
    const data: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    return data.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object" || !("id" in entry) || !("quantity" in entry))
        return [];
      const product = catalog.find((p) => p.id === entry.id);
      if (
        !product ||
        !product.inStock ||
        seen.has(product.id) ||
        typeof entry.quantity !== "number" ||
        !Number.isInteger(entry.quantity) ||
        entry.quantity < 1
      )
        return [];
      seen.add(product.id);
      return [{ product, quantity: Math.min(entry.quantity, 99) }];
    });
  } catch {
    return [];
  }
}
export function restoreWishlist(raw: string | null, catalog: Product[] = products): string[] {
  try {
    const data: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(data)
      ? [
          ...new Set(
            data.filter(
              (id): id is string => typeof id === "string" && catalog.some((p) => p.id === id),
            ),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}
