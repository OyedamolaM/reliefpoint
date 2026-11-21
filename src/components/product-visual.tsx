import { Activity, HeartPulse, Plus } from "lucide-react";
import type { Product } from "@/lib/commerce";

/** Brand-neutral illustrations until approved product packshots are available. */
export function ProductVisual({
  product,
  compact = false,
}: {
  product: Product;
  compact?: boolean;
}) {
  if (product.live)
    return (
      <img
        src={product.image}
        srcSet={
          product.image.endsWith("-medium.webp")
            ? `${product.image.replace("-medium.webp", "-small.webp")} 320w, ${product.image} 800w`
            : undefined
        }
        sizes={compact ? "96px" : "(max-width: 640px) 45vw, 280px"}
        alt={product.imageAlt ?? product.name}
        loading="lazy"
        width={compact ? 160 : 320}
        height={compact ? 160 : 320}
        className={`aspect-square w-full rounded-xl bg-white object-contain ${compact ? "max-h-24" : "max-h-72"}`}
      />
    );
  const device = product.category === "Medical Devices";
  const bottle = ["Vitamins", "Skincare", "Personal Care", "Mother & Child"].includes(
    product.category,
  );
  const blue = product.name.includes("CeraVe");
  return (
    <div className={`product-visual ${compact ? "compact" : ""}`} aria-hidden="true">
      <div className="product-ground" />
      {device ? (
        <div className="device-pack">
          <span className="device-brand">HOME HEALTH</span>
          <div className="device-screen">
            <span>
              120<span className="text-xs"> SYS</span>
            </span>
            <span>
              80<span className="text-xs"> DIA</span>
            </span>
            <HeartPulse size={16} />
          </div>
          <span className="device-button" />
        </div>
      ) : (
        <div
          className={`product-pack ${bottle ? "bottle-pack" : "carton-pack"} ${blue ? "blue-pack" : ""}`}
        >
          {bottle && <div className="bottle-cap" />}
          <div className="pack-label">
            <span className="pack-category">
              {product.category === "Vitamins"
                ? "DAILY WELLNESS"
                : product.category === "Skincare"
                  ? "SKIN ESSENTIALS"
                  : "EVERYDAY CARE"}
            </span>
            <Plus size={18} strokeWidth={3} />
            <span className="pack-name">{product.name.replace(/\s(?:\d|Daily Care).*/, "")}</span>
            <span className="pack-detail">{product.detail.split("·")[0]}</span>
            <span className="pack-stripe" />
          </div>
        </div>
      )}
      {device && <Activity className="device-accessory" size={46} />}
    </div>
  );
}
