"use client";
import { useState, useTransition } from "react";
import { Button, Input } from "@bharatboot/ui";
import { toast } from "sonner";
import { addToCartAction } from "@/app/actions/cart";

export function WholesaleAddToCart({ variantId }: { variantId: string }) {
  const [qty, setQty] = useState(10);
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-1">
      <Input
        className="w-20 h-8"
        type="number"
        min={1}
        max={999}
        value={qty}
        onChange={(e) => setQty(Math.max(1, Math.min(999, Number.parseInt(e.target.value, 10) || 1)))}
      />
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await addToCartAction(variantId, qty);
            if (r.ok) toast.success(`Added ${qty} to cart`);
            else toast.error(r.error ?? "Could not add");
          })
        }
      >
        Add
      </Button>
    </div>
  );
}
