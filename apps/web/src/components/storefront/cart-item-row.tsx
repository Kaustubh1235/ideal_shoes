"use client";
import Link from "next/link";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@bharatboot/ui";
import { inr } from "@/lib/money";
import { removeCartItemAction, updateCartQtyAction } from "@/app/actions/cart";

interface Line {
  variantId: string;
  productName: string;
  productSlug: string;
  imageUrl: string | null;
  size: string;
  color: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export function CartItemRow({ line }: { line: Line }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex gap-4 rounded-lg border border-leather-100 bg-cream p-4">
      <div className="size-24 shrink-0 rounded bg-leather-50 overflow-hidden">
        {line.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={line.imageUrl} alt={line.productName} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-ink/40">No image</div>
        )}
      </div>
      <div className="flex-1">
        <Link href={`/products/${line.productSlug}`} className="font-display uppercase tracking-wide hover:text-leather-700">
          {line.productName}
        </Link>
        <p className="text-sm text-ink/60">UK {line.size} · {line.color}</p>
        <p className="text-sm mt-1">{inr(line.unitPrice)} × {line.quantity}</p>
      </div>
      <div className="flex flex-col items-end justify-between">
        <span className="font-medium">{inr(line.lineTotal)}</span>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center border border-leather-200 rounded">
            <button
              disabled={pending}
              onClick={() => start(() => updateCartQtyAction(line.variantId, Math.max(1, line.quantity - 1)))}
              className="px-2 py-0.5 hover:bg-leather-50"
            >−</button>
            <span className="px-3 text-sm">{line.quantity}</span>
            <button
              disabled={pending}
              onClick={() => start(() => updateCartQtyAction(line.variantId, Math.min(99, line.quantity + 1)))}
              className="px-2 py-0.5 hover:bg-leather-50"
            >+</button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            onClick={() => start(() => removeCartItemAction(line.variantId))}
            aria-label="Remove"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
