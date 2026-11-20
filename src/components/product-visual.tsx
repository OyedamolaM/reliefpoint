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
