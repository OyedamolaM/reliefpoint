import { useState } from "react";
import type { Product } from "@/lib/commerce";
import { QuantitySelector } from "./quantity-selector";
import { Button } from "./ui/button";

export function ProductPurchase({
  product,
  onAdd,
}: {
  product: Product;
  onAdd: (product: Product, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  return (
    <div className="my-3 flex flex-wrap items-center gap-3">
      <QuantitySelector
        value={quantity}
        onChange={setQuantity}
        name={product.name}
        disabled={!product.inStock}
      />
      <Button
        type="button"
        className="min-h-10 flex-1"
        disabled={!product.inStock}
        onClick={() => onAdd(product, quantity)}
      >
        {product.inStock ? "Add to cart" : "Currently unavailable"}
      </Button>
    </div>
  );
}
