import Image from "next/image";

import { cn } from "@/lib/utils";
import type { MediaRef } from "@/types/cms";

/**
 * Image from the media library. Uploads are already re-encoded and size-checked
 * on the backend, so they are served directly rather than through the Next
 * image optimiser (see docs/decisions.md).
 */
export function MediaImage({
  image,
  className,
  sizes,
  priority,
  alt,
}: {
  image: MediaRef;
  className?: string;
  sizes?: string;
  priority?: boolean;
  alt?: string;
}) {
  return (
    <Image
      src={image.url}
      alt={alt ?? image.alt}
      width={image.width ?? 1200}
      height={image.height ?? 800}
      sizes={sizes}
      priority={priority}
      unoptimized
      className={cn("h-auto w-full", className)}
    />
  );
}
