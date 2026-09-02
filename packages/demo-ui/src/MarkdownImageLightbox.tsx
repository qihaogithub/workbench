"use client";

import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PreviewImage = {
  src: string;
  alt: string;
};

/**
 * Adds a single image lightbox behavior to any read-only Markdown container.
 * The caller remains responsible for rendering/sanitizing the Markdown; this
 * hook only reuses the image URL already rendered into the DOM.
 */
export function useMarkdownImageLightbox() {
  const [image, setImage] = useState<PreviewImage | null>(null);

  const openMarkdownImage = useCallback((target: EventTarget | null) => {
    const imageElement = target instanceof Element
      ? target.closest<HTMLImageElement>("img")
      : null;
    const src = imageElement?.currentSrc || imageElement?.src;
    if (!src) return false;

    setImage({
      src,
      alt: imageElement?.alt?.trim() || "Markdown 图片",
    });
    return true;
  }, []);

  const handleMarkdownImageClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!openMarkdownImage(event.target)) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }, [openMarkdownImage]);

  const lightbox = (
    <Dialog open={Boolean(image)} onOpenChange={(open) => !open && setImage(null)}>
      <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] border-none bg-black/95 p-2 text-white shadow-2xl sm:max-w-5xl">
        <DialogHeader className="sr-only">
          <DialogTitle>查看图片</DialogTitle>
        </DialogHeader>
        {image && (
          <img
            src={image.src}
            alt={image.alt}
            className="block max-h-[calc(100dvh-5rem)] max-w-full rounded-sm object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );

  return { handleMarkdownImageClick, lightbox, openMarkdownImage };
}
