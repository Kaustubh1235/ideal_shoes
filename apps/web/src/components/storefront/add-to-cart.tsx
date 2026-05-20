"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@bharatboot/ui";
import { inr } from "@/lib/money";
import { addToCartAction } from "@/app/actions/cart";

interface Variant {
  id: string;
  size: string;
  color: string;
  price: number;
}

export function AddToCart({ variants, basePrice }: { variants: Variant[]; basePrice: number }) {
  const [selectedId, setSelectedId] = useState<string | null>(variants[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  const [pending, start] = useTransition();

  const selected = variants.find((v) => v.id === selectedId);
  const price = selected?.price ?? basePrice;

  return (
    <div className="space-y-4">
      {variants.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Size</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                className={`px-3 py-2 rounded border text-sm font-medium ${
                  selectedId === v.id
                    ? "border-olive-700 bg-olive-700 text-cream"
                    : "border-olive-200 bg-cream hover:border-olive-400"
                }`}
              >
                UK {v.size}
                <span className="block text-[10px] opacity-70">{v.color}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <p className="text-sm font-medium">Quantity</p>
        <div className="inline-flex items-center border border-olive-200 rounded">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-1 hover:bg-olive-50">−</button>
          <span className="px-4 text-sm">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(99, q + 1))} className="px-3 py-1 hover:bg-olive-50">+</button>
        </div>
        <p className="ml-auto text-sm text-ink/70">Total: <span className="font-medium text-ink">{inr(price * qty)}</span></p>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={!selectedId || pending}
        onClick={() =>
          start(async () => {
            if (!selectedId) return;
            const res = await addToCartAction(selectedId, qty);
            if (res.ok) {
              toast.success(`Added ${qty} × to cart`);
            } else {
              toast.error(res.error ?? "Could not add to cart");
            }
          })
        }
      >
        {pending ? "Adding…" : "Add to Cart"}
      </Button>
    </div>
  );
}
