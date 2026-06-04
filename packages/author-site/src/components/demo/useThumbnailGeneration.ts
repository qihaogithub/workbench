"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { ThumbnailMeta } from "@opencode-workbench/shared/demo";
import { setOnPageThumbnailGenerated } from "@opencode-workbench/shared/demo";

interface ThumbnailMetaMap {
  [pageId: string]: ThumbnailMeta;
}

interface UseThumbnailGenerationOptions {
  sessionId?: string;
}

interface UseThumbnailGenerationReturn {
  thumbnailMetaMap: ThumbnailMetaMap;
  setThumbnailMetaMap: React.Dispatch<React.SetStateAction<ThumbnailMetaMap>>;
  onThumbnailGenerated: (pageId: string, meta: ThumbnailMeta) => void;
  saveThumbnailMeta: (pageId: string, meta: ThumbnailMeta) => Promise<void>;
}

export function useThumbnailGeneration(
  demoId: string,
  _options?: UseThumbnailGenerationOptions,
): UseThumbnailGenerationReturn {
  const [thumbnailMetaMap, setThumbnailMetaMap] = useState<ThumbnailMetaMap>({});
  const thumbnailMapRef = useRef(thumbnailMetaMap);
  thumbnailMapRef.current = thumbnailMetaMap;

  const onThumbnailGenerated = useCallback(
    (pageId: string, meta: ThumbnailMeta) => {
      setThumbnailMetaMap((prev) => ({ ...prev, [pageId]: meta }));
    },
    [],
  );

  const saveThumbnailMeta = useCallback(
    async (pageId: string, meta: ThumbnailMeta) => {
      try {
        await fetch(`/api/demos/${demoId}/pages/${pageId}/thumbnail`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thumbnailMeta: meta }),
        });
      } catch (error) {
        console.error("保存缩略图元数据失败:", error);
      }
    },
    [demoId],
  );

  useEffect(() => {
    setOnPageThumbnailGenerated(onThumbnailGenerated);
  }, [onThumbnailGenerated]);

  return {
    thumbnailMetaMap,
    setThumbnailMetaMap,
    onThumbnailGenerated,
    saveThumbnailMeta,
  };
}
