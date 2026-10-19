import { formatPrice } from "@/lib/catalog";
import { cn, formatDate } from "@/lib/utils";
import type { Pricing } from "@/types/catalog";

export function PriceTag({ pricing, size = "md", className }: { pricing: Pricing; size?: "md" | "lg"; className?: string }) {
  const onSale = pricing.current_price !== pricing.price;
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("font-semibold text-navy", size === "lg" ? "text-3xl" : "text-base")}>
        {pricing.is_free ? "Free" : formatPrice(pricing.current_price, pricing.currency)}
      </span>
      {onSale && (
        <span className={cn("text-muted line-through", size === "lg" ? "text-base" : "text-sm")}>
          <span className="sr-only">Regular price </span>
          {formatPrice(pricing.price, pricing.currency)}
        </span>
      )}
      {onSale && pricing.sale_ends_at && size === "lg" && (
        <span className="w-full text-sm text-muted">Offer ends {formatDate(pricing.sale_ends_at)}</span>
      )}
    </div>
  );
}
