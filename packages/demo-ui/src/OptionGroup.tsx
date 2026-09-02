"use client";

import { useId } from "react";
import { cn } from "./utils";

export type OptionGroupVariant = "radio" | "segmented";

export interface OptionGroupOption {
  value: string;
  label: string;
}

export interface OptionGroupProps {
  variant: OptionGroupVariant;
  options: OptionGroupOption[];
  value?: string;
  onChange: (value: string) => void;
  name?: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A single-value option group backed by native radio inputs.
 *
 * Keeping the native input in the DOM gives both variants the browser's
 * expected radio keyboard behaviour while the labels provide the compact
 * visual treatment used by the configuration panel.
 */
export function OptionGroup({
  variant,
  options,
  value,
  onChange,
  name,
  ariaLabel,
  disabled = false,
  className,
}: OptionGroupProps) {
  const generatedName = useId();
  const groupName = name || generatedName;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-orientation={variant === "segmented" ? "horizontal" : "vertical"}
      className={cn(
        variant === "radio"
          ? "flex flex-col gap-2"
          : "inline-flex w-full max-w-full flex-wrap items-stretch gap-1 rounded-lg border border-foreground/15 bg-foreground/[0.05] p-0.5 shadow-inner",
        className,
      )}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "cursor-pointer select-none",
              disabled && "cursor-not-allowed opacity-50",
              variant === "radio"
                ? "flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/75 transition-colors duration-200 hover:bg-foreground/[0.06]"
                : "flex h-[30px] min-h-[30px] min-w-0 flex-1 items-center justify-center rounded-md border border-transparent px-3 text-center text-sm font-medium leading-5 text-foreground/65 transition-[background-color,color,box-shadow] duration-200 touch-manipulation hover:bg-foreground/[0.10] hover:text-foreground",
              checked && variant === "radio" && "bg-foreground/[0.06] text-foreground",
              checked && variant === "segmented" && "border-primary/70 bg-primary font-semibold text-primary-foreground shadow-md ring-1 ring-inset ring-foreground/20",
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              disabled={disabled}
              className={cn(
                "peer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                variant === "radio" ? "size-4 accent-primary" : "sr-only",
              )}
            />
            <span
              className={cn(
                variant === "segmented" && "whitespace-nowrap",
                "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
              )}
            >
              {option.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}
