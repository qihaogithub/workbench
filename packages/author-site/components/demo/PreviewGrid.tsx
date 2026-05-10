"use client"

import React, { useState, useEffect, useRef, useCallback, type RefObject } from "react"
import { cn } from "@/lib/utils"
import { generateIframeHtml } from "@/lib/iframe-template"
import { getCachedCompile, setCachedCompile, invalidateCompileCache } from "./compile-cache"
import type { PreviewSize, GridPageItem, GridIframeProps, PreviewGridProps } from "./types"

const DEFAULT_PREVIEW_SIZE: PreviewSize = {
  width: 375,
  height: 812,
}

function getEffectivePreviewSize(size?: PreviewSize): PreviewSize {
  return size ?? DEFAULT_PREVIEW_SIZE
}

function parseSizeValue(value: string | number | undefined): number | null {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const num = parseFloat(value.replace(/px$/, ""))
    return isNaN(num) ? null : num
  }
  return null
}

function getPreviewAspectRatio(size?: PreviewSize): string {
  const effective = getEffectivePreviewSize(size)
  const w = parseSizeValue(effective.width)
  const h = parseSizeValue(effective.height)

  if (w && h) {
    return `${w}/${h}`
  }

  return "375/812"
}

function getAspectRatioValue(size?: PreviewSize): number {
  const ratio = getPreviewAspectRatio(size)
  const [w, h] = ratio.split("/").map(Number)
  return w / h
}

function useVisiblePages(
  containerRef: RefObject<HTMLElement | null>,
  pages: GridPageItem[],
  bufferCount: number = 1
): Set<string> {
  const [visiblePages, setVisiblePages] = useState<Set<string>>(new Set())

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev)
          for (const entry of entries) {
            const pageId = entry.target.getAttribute("data-page-id")
            if (!pageId) continue
            if (entry.isIntersecting) {
              next.add(pageId)
              const idx = pages.findIndex((p) => p.id === pageId)
              for (let i = Math.max(0, idx - bufferCount); i <= Math.min(pages.length - 1, idx + bufferCount); i++) {
                next.add(pages[i].id)
              }
            } else {
              next.delete(pageId)
            }
          }
          return next
        })
      },
      { root: container, rootMargin: "100% 0px" }
    )

    const cards = container.querySelectorAll("[data-page-id]")
    cards.forEach((card) => observer.observe(card))

    return () => observer.disconnect()
  }, [containerRef, pages, bufferCount])

  return visiblePages
}

type AlignmentMode = "center" | "top"

function useAlignmentMode(
  containerRef: RefObject<HTMLElement | null>,
  gridRef: RefObject<HTMLElement | null>,
): AlignmentMode {
  const [mode, setMode] = useState<AlignmentMode>("top")

  useEffect(() => {
    const container = containerRef.current
    const grid = gridRef.current
    if (!container || !grid) return

    const check = () => {
      const containerHeight = container.clientHeight
      const gridHeight = grid.scrollHeight
      const padding = 32
      if (gridHeight + padding < containerHeight) {
        setMode("center")
      } else {
        setMode("top")
      }
    }

    check()

    const ro = new ResizeObserver(() => {
      check()
    })
    ro.observe(container)
    ro.observe(grid)

    return () => ro.disconnect()
  }, [containerRef, gridRef])

  return mode
}

function resolveImageUrls(data: Record<string, unknown>): Record<string, unknown> {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  if (!origin) return data

  function walk(value: unknown): unknown {
    if (typeof value === "string" && value.startsWith("/api/sessions/")) {
      return origin + value
    }
    if (Array.isArray(value)) {
      return value.map(walk)
    }
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        result[k] = walk(v)
      }
      return result
    }
    return value
  }

  return walk(data) as Record<string, unknown>
}

function disableIframeScrollbar(iframe: HTMLIFrameElement) {
  try {
    const doc = iframe.contentDocument
    if (!doc) return
    doc.documentElement.style.overflow = "hidden"
    doc.body.style.overflow = "hidden"
  } catch {}
}

function GridIframe({ sessionId, page, visible, hasChanges, configData, previewSize }: GridIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const blobUrlRef = useRef<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [cardWidth, setCardWidth] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const configDataRef = useRef(configData)
  configDataRef.current = configData
  const iframeReadyRef = useRef(false)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCardWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current
      if (!iframe || event.source !== iframe.contentWindow) return
      if (event.data?.type === "READY") {
        iframeReadyRef.current = true
        const resolvedConfig = configDataRef.current ? resolveImageUrls(configDataRef.current) : {}
        iframe.contentWindow?.postMessage({ type: "UPDATE_CONFIG", configData: resolvedConfig }, "*")
      }
    }
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  useEffect(() => {
    if (!visible) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      iframeReadyRef.current = false
      return
    }

    let cancelled = false
    setIsLoading(true)
    iframeReadyRef.current = false

    const load = async () => {
      const cached = getCachedCompile(sessionId, page.id)
      if (cached) {
        if (cancelled) return
        mountIframe(cached)
        return
      }

      try {
        const res = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, demoId: page.id }),
        })
        const data = await res.json()
        if (cancelled || !data.success) {
          setIsLoading(false)
          return
        }

        setCachedCompile(sessionId, page.id, data.data)
        mountIframe(data.data)
      } catch {
        if (!cancelled) setIsLoading(false)
      }
    }

    const mountIframe = (compileResult: { compiledCode: string; cssImports: string[] }) => {
      if (cancelled) return

      const resolvedConfig = configDataRef.current ? resolveImageUrls(configDataRef.current) : {}
      const html = generateIframeHtml({
        compiledCode: compileResult.compiledCode,
        cssImports: compileResult.cssImports,
        configData: resolvedConfig,
      })
      const blob = new Blob([html], { type: "text/html" })
      const url = URL.createObjectURL(blob)
      if (cancelled) {
        URL.revokeObjectURL(url)
        return
      }

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }
      blobUrlRef.current = url
      setIsLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [visible, sessionId, page.id])

  useEffect(() => {
    if (!iframeReadyRef.current || !blobUrlRef.current) return
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    const resolvedConfig = configData ? resolveImageUrls(configData) : {}
    iframe.contentWindow.postMessage({ type: "UPDATE_CONFIG", configData: resolvedConfig }, "*")
  }, [configData])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      disableIframeScrollbar(iframe)
    }

    iframe.addEventListener("load", handleLoad)
    return () => iframe.removeEventListener("load", handleLoad)
  }, [isLoading])

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [])

  if (!visible) {
    return (
      <div ref={wrapperRef} className="w-full h-full bg-muted/50 flex items-center justify-center">
        <span className="text-xs text-muted-foreground">{page.name}</span>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div ref={wrapperRef} className="w-full h-full bg-muted/30 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-muted-foreground" />
      </div>
    )
  }

  if (!blobUrlRef.current) {
    return (
      <div ref={wrapperRef} className="w-full h-full bg-muted/50 flex items-center justify-center">
        <span className="text-xs text-muted-foreground">加载失败</span>
      </div>
    )
  }

  const effective = getEffectivePreviewSize(previewSize)
  const iframeWidth = parseSizeValue(effective.width) ?? 375
  const iframeHeight = parseSizeValue(effective.height) ?? 812
  const scale = cardWidth > 0 ? cardWidth / iframeWidth : 0.3

  return (
    <div ref={wrapperRef} className="relative w-full h-full overflow-hidden">
      <iframe
        ref={iframeRef}
        src={blobUrlRef.current}
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: iframeWidth,
          height: iframeHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: "none",
          pointerEvents: "none",
        }}
        title={page.name}
      />
      {hasChanges && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-400" />
      )}
    </div>
  )
}

export function PreviewGrid({
  sessionId,
  demoPages,
  activePageId,
  gridColumns,
  onCardClick,
  changedPageIds,
  configData,
  previewSize,
}: PreviewGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridMeasureRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const visiblePages = useVisiblePages(containerRef, demoPages)
  const alignmentMode = useAlignmentMode(containerRef, gridMeasureRef)

  const rows: GridPageItem[][] = []
  for (let i = 0; i < demoPages.length; i += gridColumns) {
    rows.push(demoPages.slice(i, i + gridColumns))
  }

  const handleCardClick = useCallback(
    (pageId: string) => {
      onCardClick(pageId)
    },
    [onCardClick]
  )

  const handleCardWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const iframe = e.currentTarget.querySelector("iframe")
    if (!iframe?.contentWindow) return
    try {
      iframe.contentWindow.scrollBy(0, e.deltaY)
    } catch {}
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ block: "center", behavior: "smooth" })
    }
  }, [activePageId])

  useEffect(() => {
    return () => {
      invalidateCompileCache(sessionId)
    }
  }, [sessionId])

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto preview-grid-scroll"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      <style>{`
        .preview-grid-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div
        className="min-h-full p-4 flex flex-col"
        style={{
          justifyContent: alignmentMode === "center" ? "center" : "flex-start",
        }}
      >
        <div
          ref={gridMeasureRef}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          {rows.map((row) => {
            const ratios = row.map((p) => {
              const size = p.id === activePageId ? previewSize : (p.previewSize ?? previewSize)
              return getAspectRatioValue(size)
            })
            const columnTemplate = ratios.map((r) => `${r}fr`).join(" ")

            return (
              <div
                key={row.map((p) => p.id).join("-")}
                style={{
                  display: "grid",
                  gridTemplateColumns: columnTemplate,
                  gap: "16px",
                  alignItems: "start",
                }}
              >
                {row.map((page) => {
                  const effectiveSize = page.id === activePageId ? previewSize : (page.previewSize ?? previewSize)
                  const pageAspectRatio = getPreviewAspectRatio(effectiveSize)
                  return (
                    <div
                      key={page.id}
                      data-page-id={page.id}
                      ref={activePageId === page.id ? scrollRef : undefined}
                      className={cn(
                        "relative rounded-lg overflow-hidden cursor-pointer transition-all",
                        activePageId === page.id
                          ? "border-2 border-primary ring-2 ring-primary/20 scale-[1.02]"
                          : "border border-border hover:border-primary/50"
                      )}
                      style={{ aspectRatio: pageAspectRatio }}
                      onClick={() => handleCardClick(page.id)}
                      onWheel={handleCardWheel}
                    >
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 z-10 pointer-events-none">
                        <span className="text-xs text-white font-medium truncate block">{page.name}</span>
                      </div>
                      <GridIframe
                        sessionId={sessionId}
                        page={page}
                        visible={visiblePages.has(page.id)}
                        hasChanges={changedPageIds?.has(page.id) ?? false}
                        configData={configData}
                        previewSize={effectiveSize}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
