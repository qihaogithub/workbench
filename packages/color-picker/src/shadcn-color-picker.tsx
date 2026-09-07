"use client";

import Color from "color";
import { PipetteIcon } from "lucide-react";
import { Slider } from "radix-ui";
import {
  createContext,
  memo,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ColorLike = Parameters<typeof Color>[0];

export type RgbaTuple = [number, number, number, number];

type ColorPickerContextValue = {
  hue: number;
  saturation: number;
  lightness: number;
  alpha: number;
  hasValue: boolean;
  disabled: boolean;
  mode: string;
  setHue: (hue: number) => void;
  setSaturation: (saturation: number) => void;
  setLightness: (lightness: number) => void;
  setAlpha: (alpha: number) => void;
  setMode: (mode: string) => void;
  setColor: (value: string) => void;
};

const ColorPickerContext = createContext<ColorPickerContextValue | undefined>(
  undefined,
);

export const useColorPicker = () => {
  const context = useContext(ColorPickerContext);
  if (!context) {
    throw new Error("useColorPicker must be used within a ColorPickerProvider");
  }
  return context;
};

function cn(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

const inputClassName =
  "h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function parseColorState(value: ColorLike | undefined): {
  hue: number;
  saturation: number;
  lightness: number;
  alpha: number;
} {
  try {
    const color = Color(value ?? "#808080").hsl();
    return {
      hue: color.hue() ?? 0,
      saturation: color.saturationl() ?? 0,
      lightness: color.lightness() ?? 50,
      alpha: (color.alpha() || 0) * 100,
    };
  } catch {
    return { hue: 0, saturation: 0, lightness: 50, alpha: 100 };
  }
}

function stateToColor(
  hue: number,
  saturation: number,
  lightness: number,
  alpha: number,
) {
  return Color.hsl(hue, saturation, lightness).alpha(alpha / 100);
}

function stateKey(state: {
  hue: number;
  saturation: number;
  lightness: number;
  alpha: number;
}): string {
  return [state.hue, state.saturation, state.lightness, state.alpha]
    .map((value) => value.toFixed(4))
    .join("/");
}

export type ColorPickerProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  value?: ColorLike;
  defaultValue?: ColorLike;
  onChange?: (value: RgbaTuple) => void;
  empty?: boolean;
  disabled?: boolean;
  children?: ReactNode;
};

/**
 * Source-compatible copy of shadcn.io's `color-picker` registry component.
 * The surrounding application adapter lives in index.tsx.
 */
export const ShadcnColorPicker = ({
  value,
  defaultValue = "#808080",
  onChange,
  empty = false,
  disabled = false,
  className,
  children,
  ...props
}: ColorPickerProps) => {
  const initialState = useMemo(
    () => parseColorState(value ?? defaultValue),
    // The registry component treats defaultValue as an initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [hue, setHue] = useState(initialState.hue);
  const [saturation, setSaturation] = useState(initialState.saturation);
  const [lightness, setLightness] = useState(initialState.lightness);
  const [alpha, setAlpha] = useState(initialState.alpha);
  const [hasValue, setHasValue] = useState(!empty);
  const [mode, setMode] = useState("hex");
  const lastReportedState = useRef(stateKey(initialState));
  const pendingSyncState = useRef<string | null>(null);

  useEffect(() => {
    if (empty || value === undefined || value === null) {
      setHasValue(false);
      return;
    }
    const next = parseColorState(value);
    setHasValue(true);
    const nextStateKey = stateKey(next);
    pendingSyncState.current = nextStateKey;
    lastReportedState.current = nextStateKey;
    setHue(next.hue);
    setSaturation(next.saturation);
    setLightness(next.lightness);
    setAlpha(next.alpha);
  }, [empty, value]);

  useEffect(() => {
    if (!onChange) return;
    const nextState = { hue, saturation, lightness, alpha };
    const nextStateKey = stateKey(nextState);
    if (pendingSyncState.current !== null) {
      if (pendingSyncState.current === nextStateKey) {
        pendingSyncState.current = null;
      }
      return;
    }
    if (nextStateKey === lastReportedState.current) return;
    lastReportedState.current = nextStateKey;
    const color = stateToColor(hue, saturation, lightness, alpha);
    const rgb = color.rgb().array().map((channel) => Math.round(channel));
    onChange([rgb[0], rgb[1], rgb[2], Number((alpha / 100).toFixed(4))]);
  }, [alpha, hue, lightness, onChange, saturation]);

  const setColor = useCallback((rawValue: string) => {
    try {
      const trimmed = rawValue.trim();
      const normalized = /^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(
        trimmed,
      )
        ? `#${trimmed}`
        : trimmed;
      const color = Color(normalized);
      const next = parseColorState(color.string());
      const hasExplicitAlpha =
        /^(?:rgba|hsla)\(/i.test(normalized) ||
        /^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i.test(normalized);
      setHue(next.hue);
      setSaturation(next.saturation);
      setLightness(next.lightness);
      setAlpha(hasExplicitAlpha ? next.alpha : alpha);
      setHasValue(true);
    } catch {
      // Keep the editable field's draft until it becomes a valid CSS color.
    }
  }, [alpha]);

  const updateHue = useCallback((nextHue: number) => {
    setHasValue(true);
    setHue(nextHue);
  }, []);
  const updateSaturation = useCallback((nextSaturation: number) => {
    setHasValue(true);
    setSaturation(nextSaturation);
  }, []);
  const updateLightness = useCallback((nextLightness: number) => {
    setHasValue(true);
    setLightness(nextLightness);
  }, []);
  const updateAlpha = useCallback((nextAlpha: number) => {
    setHasValue(true);
    setAlpha(nextAlpha);
  }, []);

  return (
    <ColorPickerContext.Provider
      value={{
        hue,
        saturation,
        lightness,
        alpha,
        hasValue,
        disabled,
        mode,
        setHue: updateHue,
        setSaturation: updateSaturation,
        setLightness: updateLightness,
        setAlpha: updateAlpha,
        setMode,
        setColor,
      }}
    >
      <div className={cn("flex size-full flex-col gap-4", className)} {...props}>
        {children}
      </div>
    </ColorPickerContext.Provider>
  );
};

export type ColorPickerSelectionProps = HTMLAttributes<HTMLDivElement>;

export const ColorPickerSelection = memo(
  ({ className, ...props }: ColorPickerSelectionProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [positionX, setPositionX] = useState(0);
    const [positionY, setPositionY] = useState(0);
    const { hue, setSaturation, setLightness, disabled } = useColorPicker();

    const backgroundGradient = useMemo(
      () =>
        `linear-gradient(0deg, rgba(0,0,0,1), rgba(0,0,0,0)), linear-gradient(90deg, rgba(255,255,255,1), rgba(255,255,255,0)), hsl(${hue}, 100%, 50%)`,
      [hue],
    );

    const setFromPointer = useCallback(
      (event: PointerEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1)));
        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(rect.height, 1)));
        setPositionX(x);
        setPositionY(y);
        setSaturation(x * 100);
        const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x);
        setLightness(topLightness * (1 - y));
      },
      [setLightness, setSaturation],
    );

    useEffect(() => {
      const handlePointerMove = (event: PointerEvent) => {
        if (isDragging) setFromPointer(event);
      };
      const handlePointerUp = () => setIsDragging(false);
      if (isDragging) {
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
      }
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }, [isDragging, setFromPointer]);

    const { saturation, lightness } = useColorPicker();
    useEffect(() => {
      const x = saturation / 100;
      const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x);
      setPositionX(Math.max(0, Math.min(1, x)));
      setPositionY(Math.max(0, Math.min(1, 1 - lightness / topLightness)));
    }, [lightness, saturation]);

    return (
      <div
        ref={containerRef}
        className={cn("relative size-full cursor-crosshair rounded", className)}
        style={{ background: backgroundGradient }}
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          setIsDragging(true);
          setFromPointer(event.nativeEvent);
        }}
        {...props}
      >
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{
            left: `${positionX * 100}%`,
            top: `${positionY * 100}%`,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
      </div>
    );
  },
);

ColorPickerSelection.displayName = "ColorPickerSelection";

export type ColorPickerHueProps = ComponentProps<typeof Slider.Root>;

export const ColorPickerHue = ({
  className,
  disabled: propDisabled,
  ...props
}: ColorPickerHueProps) => {
  const { hue, setHue, disabled } = useColorPicker();
  return (
    <Slider.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={360}
      onValueChange={([nextHue]) => setHue(nextHue ?? 0)}
      step={1}
      value={[hue]}
      {...props}
      disabled={disabled || propDisabled}
    >
      <Slider.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)]">
        <Slider.Range className="absolute h-full" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  );
};

export type ColorPickerAlphaProps = ComponentProps<typeof Slider.Root>;

export const ColorPickerAlpha = ({
  className,
  disabled: propDisabled,
  ...props
}: ColorPickerAlphaProps) => {
  const { alpha, setAlpha, disabled } = useColorPicker();
  return (
    <Slider.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={100}
      onValueChange={([nextAlpha]) => setAlpha(nextAlpha ?? 100)}
      step={1}
      value={[alpha]}
      {...props}
      disabled={disabled || propDisabled}
    >
      <Slider.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')] bg-center bg-repeat-x dark:bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALklEQVR4nGP8+vWrCAMewM3N/QafPBM+SWLAqAGDwQBGQgoIpZOB98KoAVQwAADxzQcSVIRCfQAAAABJRU5ErkJggg==')]">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent to-black/50 dark:to-white/50" />
        <Slider.Range className="absolute h-full rounded-full bg-transparent" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  );
};

export type ColorPickerEyeDropperProps = ComponentProps<"button">;

export const ColorPickerEyeDropper = ({
  className,
  disabled: propDisabled,
  ...props
}: ColorPickerEyeDropperProps) => {
  const { setColor, disabled } = useColorPicker();
  const supportsEyeDropper =
    typeof window !== "undefined" && "EyeDropper" in window;
  if (!supportsEyeDropper) return null;

  return (
    <button
      type="button"
      aria-label="吸管取色"
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onClick={() => {
        const EyeDropper = (window as Window & {
          EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
        }).EyeDropper;
        if (!EyeDropper) return;
        void new EyeDropper()
          .open()
          .then((result) => setColor(result.sRGBHex))
          .catch(() => undefined);
      }}
      {...props}
      disabled={disabled || propDisabled}
    >
      <PipetteIcon size={16} aria-hidden="true" />
    </button>
  );
};

export type ColorPickerOutputProps = ComponentProps<"select">;

const formats = ["hex", "rgb", "css", "hsl"] as const;

export const ColorPickerOutput = ({
  className,
  disabled: propDisabled,
  ...props
}: ColorPickerOutputProps) => {
  const { mode, setMode, disabled } = useColorPicker();
  return (
    <select
      value={mode}
      aria-label="颜色输出格式"
      onChange={(event) => setMode(event.target.value)}
      className={cn(inputClassName, "w-20 shrink-0 px-1.5", className)}
      {...props}
      disabled={disabled || propDisabled}
    >
      {formats.map((format) => (
        <option key={format} value={format}>
          {format.toUpperCase()}
        </option>
      ))}
    </select>
  );
};

function formatCssRgba(color: ReturnType<typeof Color>): string {
  const rgb = color.rgb().array().map((channel) => Math.round(channel));
  const alpha = Number(color.alpha().toFixed(2));
  return `rgba(${rgb.join(", ")}, ${alpha})`;
}

export type ColorPickerFormatProps = HTMLAttributes<HTMLDivElement> & {
  inputLabelPrefix?: string;
  showAlpha?: boolean;
};

export const ColorPickerFormat = ({
  className,
  inputLabelPrefix = "颜色",
  showAlpha = true,
  ...props
}: ColorPickerFormatProps) => {
  const {
    hue,
    saturation,
    lightness,
    alpha,
    hasValue,
    disabled,
    mode,
    setAlpha,
    setColor,
  } = useColorPicker();
  const color = stateToColor(hue, saturation, lightness, alpha);
  const hex = hasValue ? color.hex().toUpperCase() : "";
  const css = hasValue ? formatCssRgba(color) : "";
  const [draft, setDraft] = useState(hex);

  useEffect(() => {
    setDraft(mode === "hex" ? hex : mode === "css" ? css : "");
  }, [css, hex, mode]);

  const handleDraftChange = (nextValue: string) => {
    setDraft(nextValue);
    if (mode !== "hex" && mode !== "css") return;
    if (mode === "hex" && !/^#?(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(nextValue.trim())) return;
    if (mode === "css" && !/^(?:rgb|rgba)\(/i.test(nextValue.trim())) return;
    setColor(nextValue);
  };

  const alphaInput = (
    <div className="relative">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        aria-label={`${inputLabelPrefix}透明度`}
        disabled={disabled}
        className={cn(inputClassName, "w-20 pr-6 text-right")}
        value={Math.round(alpha)}
        onChange={(event) => {
          if (event.target.value === "") return;
          const nextAlpha = Number(event.target.value);
          if (Number.isFinite(nextAlpha)) setAlpha(Math.max(0, Math.min(100, nextAlpha)));
        }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">%</span>
    </div>
  );

  if (mode === "hex" || mode === "css") {
    return (
      <div className={cn("flex w-full items-center gap-2", className)} {...props}>
        <input
          className={cn(inputClassName, "min-w-0 flex-1")}
          type="text"
          inputMode="text"
          disabled={disabled}
          aria-label={
            mode === "hex"
              ? `${inputLabelPrefix}Hex值`
              : `${inputLabelPrefix}CSS值`
          }
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          onBlur={() => setDraft(mode === "hex" ? hex : css)}
        />
        {showAlpha ? alphaInput : null}
      </div>
    );
  }

  if (mode === "rgb") {
    const rgb = color.rgb().array().map((value) => Math.round(value));
    return (
      <div className={cn("flex w-full items-center gap-1", className)} {...props}>
        {rgb.map((value, index) => (
          <input
            key={index}
            className={cn(inputClassName, "min-w-0 flex-1 text-center")}
            type="number"
            min={0}
            max={255}
            disabled={disabled}
            aria-label={`${inputLabelPrefix}RGB通道${index + 1}`}
            value={value}
            onChange={(event) => {
              if (event.target.value === "") return;
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              const nextRgb = [...rgb] as number[];
              nextRgb[index] = Math.max(0, Math.min(255, next));
              setColor(`rgb(${nextRgb.join(", ")})`);
            }}
          />
        ))}
        {showAlpha ? alphaInput : null}
      </div>
    );
  }

  const hsl = color.hsl().array().map((value) => Math.round(value));
  return (
    <div className={cn("flex w-full items-center gap-1", className)} {...props}>
      {hsl.map((value, index) => (
        <input
          key={index}
          className={cn(inputClassName, "min-w-0 flex-1 text-center")}
          type="number"
          min={0}
          max={index === 0 ? 360 : 100}
          disabled={disabled}
          aria-label={`${inputLabelPrefix}HSL通道${index + 1}`}
          value={value}
          onChange={(event) => {
            if (event.target.value === "") return;
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            const nextHsl = [...hsl] as number[];
            nextHsl[index] = Math.max(0, Math.min(index === 0 ? 360 : 100, next));
            setColor(`hsl(${nextHsl[0]}, ${nextHsl[1]}%, ${nextHsl[2]}%)`);
          }}
        />
      ))}
      {showAlpha ? alphaInput : null}
    </div>
  );
};
