"use client";

import { Monitor, Save, Smartphone, Tablet } from "lucide-react";
import {
  createPagePresentationProfile,
  PAGE_PRESENTATION_PRESETS,
  type PagePresentationPreset,
  type PagePresentationProfile,
} from "@workbench/shared";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const labels: Record<PagePresentationPreset, string> = {
  desktop: "电脑",
  tablet: "平板",
  mobile: "手机",
  custom: "自定义",
};

export interface PageViewportControlProps {
  presentation: PagePresentationProfile;
  temporaryPresentation?: PagePresentationProfile;
  onTemporaryChange: (presentation: PagePresentationProfile) => void;
  onSaveDefault: (presentation: PagePresentationProfile) => void;
}

export function PageViewportControl({
  presentation,
  temporaryPresentation,
  onTemporaryChange,
  onSaveDefault,
}: PageViewportControlProps) {
  const current = temporaryPresentation ?? presentation;
  const isDirty =
    current.viewport.width !== presentation.viewport.width ||
    current.viewport.height !== presentation.viewport.height;

  const applyPreset = (preset: PagePresentationPreset) => {
    if (preset === "custom") return;
    onTemporaryChange(
      createPagePresentationProfile({
        mode: current.mode,
        heightBehavior: current.heightBehavior,
        viewport: PAGE_PRESENTATION_PRESETS[preset],
        source: "user",
      }),
    );
  };

  return (
    <div className="flex min-w-0 items-center gap-1" aria-label="页面展示视口">
      <Select value={current.preset} onValueChange={(value) => applyPreset(value as PagePresentationPreset)}>
        <SelectTrigger className="h-7 w-[112px] gap-1 px-2 text-xs" aria-label="临时预览设备">
          {current.preset === "desktop" ? <Monitor className="h-3.5 w-3.5" /> : null}
          {current.preset === "tablet" ? <Tablet className="h-3.5 w-3.5" /> : null}
          {current.preset === "mobile" ? <Smartphone className="h-3.5 w-3.5" /> : null}
          <SelectValue>{labels[current.preset]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="desktop">电脑 · 1440×900</SelectItem>
          <SelectItem value="tablet">平板 · 768×1024</SelectItem>
          <SelectItem value="mobile">手机 · 390×844</SelectItem>
          {current.preset === "custom" ? (
            <SelectItem value="custom">自定义 · {current.viewport.width}×{current.viewport.height}</SelectItem>
          ) : null}
        </SelectContent>
      </Select>
      {isDirty ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onSaveDefault(current)}
          title="将当前临时视口保存为页面默认"
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          设为默认
        </Button>
      ) : null}
    </div>
  );
}
