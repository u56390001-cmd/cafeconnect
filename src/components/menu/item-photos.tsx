"use client";

import { useRef, useState } from "react";
import { ImageOff, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { ImageReference } from "@/lib/media/images";
import { cn } from "@/lib/utils";

interface ItemPhotosProps {
  images: ImageReference[];
  productName: string;
  disabled: boolean;
  disabledReason: string;
  uploading: boolean;
  error: string;
  onUpload: (file: File) => void;
  onRemove: (assetId: string) => void;
}

/**
 * Product photo management inside the form drawer.
 *
 * Images upload immediately to the server (so Cancel cannot strand a half
 * -uploaded file on the client). The first photo in the list is the primary
 * (main) photo everywhere the product renders.
 */
export function ItemPhotos({
  images,
  productName,
  disabled,
  disabledReason,
  uploading,
  error,
  onUpload,
  onRemove,
}: ItemPhotosProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-2">
      <Label>Photos</Label>

      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {images.map((image) => (
            <li
              key={image.assetId}
              className={cn(
                "relative size-24 overflow-visible",
                uploading && "opacity-60"
              )}
            >
              {broken[image.assetId] ? (
                <div
                  aria-label="Image preview unavailable"
                  role="img"
                  className="flex size-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground"
                >
                  <ImageOff className="size-4" aria-hidden="true" />
                  <span className="text-[10px]">Preview failed</span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image.url}
                  alt={image.altText || productName}
                  width={image.width ?? 320}
                  height={image.height ?? 240}
                  onError={() =>
                    setBroken((current) => ({ ...current, [image.assetId]: true }))
                  }
                  className="size-24 rounded-md border border-border bg-muted object-cover"
                />
              )}
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label={`Remove photo${image.isPrimary ? " (main photo)" : ""}`}
                disabled={uploading}
                onClick={() => onRemove(image.assetId)}
                className="absolute -right-2 -top-2 size-6 rounded-full bg-background shadow-sm hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="size-3.5" />
              </Button>
              {image.isPrimary && !disabled ? (
                <Badge variant="secondary" className="absolute bottom-1 left-1 text-[10px]">
                  Main photo
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => fileRef.current?.click()}
          className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="size-5" aria-hidden="true" />
          <span className="text-sm">
            {uploading
              ? "Uploading…"
              : disabled
                ? disabledReason
                : "Click to upload a photo"}
          </span>
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
        }}
      />

      <div className="flex items-center justify-between gap-2">
        {images.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload data-icon="inline-start" />
            {uploading ? "Uploading…" : "Add photo"}
          </Button>
        ) : null}
        <p className="ml-auto text-right text-xs text-muted-foreground">
          JPG, PNG or WebP up to 5 MB. The first photo is the main photo.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
