"use client";

import { useEffect, useRef } from "react";
import { proxyJamaImages, cacheImageFromElement } from "@/lib/api";

interface JamaHtmlProps {
  html: string;
  className?: string;
}

/**
 * Renders Jama HTML content with image URL proxying and auto-caching.
 *
 * Images flow:
 * 1. URLs rewritten to /api/proxy/jama-image?url=...
 * 2. If cached locally, served from disk (fast).
 * 3. If not cached, backend returns 302 → browser loads from Jama (SAML session).
 * 4. On successful load, the image is fetched again and POSTed to the cache endpoint.
 */
export default function JamaHtml({ html, className }: JamaHtmlProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;

    // Find all proxy images and auto-cache any that loaded via redirect
    const imgs = container.querySelectorAll<HTMLImageElement>("img[src*='proxy/jama-image']");
    for (const img of imgs) {
      const proxyUrl = img.src;
      let urlParam: string | null = null;
      try { urlParam = new URL(proxyUrl).searchParams.get("url"); } catch { /* ignore */ }
      if (!urlParam) continue;

      const jamaUrl = urlParam;
      const handleLoad = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          cacheImageFromElement(img, jamaUrl).then((ok: boolean) => {
            if (ok) console.log(`[JamaHtml] Cached image: ${jamaUrl}`);
          });
        }
      };

      if (img.complete && img.naturalWidth > 0) {
        handleLoad();
      } else {
        img.addEventListener("load", handleLoad, { once: true });
      }
    }
  }, [html]);

  return (
    <div
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: proxyJamaImages(html) }}
    />
  );
}
