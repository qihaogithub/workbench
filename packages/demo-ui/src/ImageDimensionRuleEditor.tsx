"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ImageDimensionBound,
  ImageDimensionOperator,
  ImageDimensionRule,
} from "@workbench/shared/demo/config-schema-definition";
import { validateImageDimensionRule } from "@workbench/shared/demo/config-schema-definition";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type SingleOperator = ImageDimensionOperator | "不限";
const dimensionNumberInputClass = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

interface DimensionDraftState {
  rangeEnabled: boolean;
  singleOperator: SingleOperator;
  minValue: string;
  maxValue: string;
  minInclusive: boolean;
  maxInclusive: boolean;
}

export interface ImageDimensionRuleEditorProps {
  axis: "W" | "H";
  rule?: ImageDimensionRule;
  onChange: (rule: ImageDimensionRule | undefined) => void;
  onValidityChange?: (valid: boolean) => void;
  readOnly?: boolean;
}

function toInputValue(bound: ImageDimensionBound | undefined): string {
  return bound ? String(bound.value) : "";
}

function stateFromRule(rule: ImageDimensionRule | undefined): DimensionDraftState {
  if (!rule) {
    return {
      rangeEnabled: false,
      singleOperator: "不限",
      minValue: "",
      maxValue: "",
      minInclusive: true,
      maxInclusive: true,
    };
  }

  if (rule.min && rule.max && rule.min.value === rule.max.value && rule.min.inclusive && rule.max.inclusive) {
    return {
      rangeEnabled: false,
      singleOperator: "=",
      minValue: String(rule.min.value),
      maxValue: "",
      minInclusive: true,
      maxInclusive: true,
    };
  }

  if (rule.min && rule.max) {
    return {
      rangeEnabled: true,
      singleOperator: rule.min.inclusive ? "≥" : ">",
      minValue: toInputValue(rule.min),
      maxValue: toInputValue(rule.max),
      minInclusive: rule.min.inclusive,
      maxInclusive: rule.max.inclusive,
    };
  }

  if (rule.min) {
    return {
      rangeEnabled: false,
      singleOperator: rule.min.inclusive ? "≥" : ">",
      minValue: toInputValue(rule.min),
      maxValue: "",
      minInclusive: rule.min.inclusive,
      maxInclusive: true,
    };
  }

  return {
    rangeEnabled: false,
    singleOperator: rule.max?.inclusive ? "≤" : "<",
    minValue: "",
    maxValue: toInputValue(rule.max),
    minInclusive: true,
    maxInclusive: rule.max?.inclusive ?? true,
  };
}

function parseInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function bound(value: string, inclusive: boolean): ImageDimensionBound | undefined {
  const parsed = parseInput(value);
  return parsed === undefined ? undefined : { value: parsed, inclusive };
}

function ruleFromState(state: DimensionDraftState): ImageDimensionRule | undefined {
  if (!state.rangeEnabled) {
    const value = state.singleOperator === "<" || state.singleOperator === "≤"
      ? bound(state.maxValue, state.singleOperator === "≤")
      : bound(state.minValue, state.singleOperator === "≥");

    switch (state.singleOperator) {
      case "不限":
        return undefined;
      case "=":
        return value ? { min: { value: value.value, inclusive: true }, max: { value: value.value, inclusive: true } } : undefined;
      case ">":
      case "≥":
        return value ? { min: value } : undefined;
      case "<":
      case "≤":
        return value ? { max: value } : undefined;
    }
  }

  const min = bound(state.minValue, state.minInclusive);
  const max = bound(state.maxValue, state.maxInclusive);
  if (!min && !max) return undefined;
  return { ...(min ? { min } : {}), ...(max ? { max } : {}) };
}

function singleOperatorNeedsMin(operator: SingleOperator): boolean {
  return operator === "=" || operator === ">" || operator === "≥";
}

export function ImageDimensionRuleEditor({
  axis,
  rule,
  onChange,
  onValidityChange,
  readOnly = false,
}: ImageDimensionRuleEditorProps) {
  const initial = stateFromRule(rule);
  const [state, setState] = useState<DimensionDraftState>(initial);
  const serializedRule = JSON.stringify(rule ?? null);
  const localEmitRef = useRef<string | null>(null);
  const onValidityChangeRef = useRef(onValidityChange);

  useEffect(() => {
    onValidityChangeRef.current = onValidityChange;
  }, [onValidityChange]);

  useEffect(() => {
    if (localEmitRef.current === serializedRule) {
      localEmitRef.current = null;
      return;
    }
    setState(stateFromRule(rule));
  }, [serializedRule]);

  const currentRule = useMemo(() => ruleFromState(state), [state]);
  const error = useMemo(() => {
    if (state.rangeEnabled && (!state.minValue.trim() || !state.maxValue.trim())) {
      return "区间需要填写上下限";
    }
    if (!state.rangeEnabled && state.singleOperator !== "不限") {
      const value = singleOperatorNeedsMin(state.singleOperator) ? state.minValue : state.maxValue;
      if (!value.trim() || !currentRule) return `${state.singleOperator}需要填写数值`;
    }
    return validateImageDimensionRule(currentRule, `${axis} 尺寸规则`);
  }, [axis, currentRule, state]);
  const valid = !error;

  useEffect(() => {
    onValidityChangeRef.current?.(valid);
  }, [valid]);

  const emit = (nextState: DimensionDraftState) => {
    const nextRule = ruleFromState(nextState);
    localEmitRef.current = JSON.stringify(nextRule ?? null);
    onChange(nextRule);
  };

  const updateState = (patch: Partial<DimensionDraftState>) => {
    const nextState = { ...state, ...patch };
    setState(nextState);
    emit(nextState);
  };

  const changeSingleOperator = (singleOperator: SingleOperator) => {
    const currentValue = state.minValue || state.maxValue;
    const nextState: DimensionDraftState = {
      ...state,
      rangeEnabled: false,
      singleOperator,
      minValue: singleOperator === "<" || singleOperator === "≤" ? "" : currentValue,
      maxValue: singleOperator === "<" || singleOperator === "≤" ? currentValue : "",
      minInclusive: singleOperator === "≥",
      maxInclusive: singleOperator === "≤",
    };
    if (singleOperator === "不限") {
      nextState.minValue = "";
      nextState.maxValue = "";
    }
    setState(nextState);
    emit(nextState);
  };

  const toggleRange = (rangeEnabled: boolean) => {
    if (rangeEnabled) {
      const sourceValue = state.minValue || state.maxValue;
      const nextState: DimensionDraftState = {
        ...state,
        rangeEnabled: true,
        minValue: state.singleOperator === "<" || state.singleOperator === "≤" ? "" : sourceValue,
        maxValue: state.singleOperator === "<" || state.singleOperator === "≤" ? sourceValue : "",
        minInclusive: state.singleOperator !== ">",
        maxInclusive: state.singleOperator !== "<",
      };
      if (state.singleOperator === "不限") {
        nextState.minValue = "";
        nextState.maxValue = "";
      }
      setState(nextState);
      emit(nextState);
      return;
    }

    const nextState: DimensionDraftState = {
      ...state,
      rangeEnabled: false,
      singleOperator: state.minValue ? (state.minInclusive ? "≥" : ">") : state.maxValue ? (state.maxInclusive ? "≤" : "<") : "不限",
      minValue: state.minValue,
      maxValue: "",
    };
    if (nextState.singleOperator === "≤" || nextState.singleOperator === "<") {
      nextState.maxValue = state.maxValue;
      nextState.minValue = "";
    }
    setState(nextState);
    emit(nextState);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{axis} 尺寸限制</h3>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>区间</span>
          <Switch checked={state.rangeEnabled} onCheckedChange={toggleRange} disabled={readOnly} aria-label={`${axis}区间`} />
        </label>
      </div>

      <fieldset className="space-y-3 rounded-md border p-3">
        {!state.rangeEnabled && (
          <div className="grid grid-cols-[24px_40px_minmax(0,1fr)_20px] items-center gap-1">
            <span className="text-sm font-medium">{axis}</span>
            <select
              aria-label={`${axis}尺寸比较符`}
              value={state.singleOperator}
              onChange={(event) => changeSingleOperator(event.target.value as SingleOperator)}
              disabled={readOnly}
              className="h-9 appearance-none rounded-md border bg-background px-0 text-center text-sm"
            >
              {(["=", ">", "≥", "<", "≤", "不限"] as SingleOperator[]).map((operator) => (
                <option key={operator} value={operator}>{operator}</option>
              ))}
            </select>
            <Input
              aria-label={`${axis}尺寸具体数值`}
              type="number"
              min="0"
              className={dimensionNumberInputClass}
              value={state.singleOperator === "<" || state.singleOperator === "≤" ? state.maxValue : state.minValue}
              placeholder="输入数值"
              onChange={(event) => {
                if (state.singleOperator === "<" || state.singleOperator === "≤") {
                  updateState({ maxValue: event.target.value });
                } else {
                  updateState({ minValue: event.target.value, maxValue: "" });
                }
              }}
              disabled={readOnly || state.singleOperator === "不限"}
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        )}

        {state.rangeEnabled && (
          <div className="grid grid-cols-[minmax(0,1fr)_40px_24px_40px_minmax(0,1fr)_20px] items-center gap-1">
            <Input
              aria-label={`${axis}区间下限数值`}
              type="number"
              min="0"
              className={dimensionNumberInputClass}
              value={state.minValue}
              placeholder="下限"
              onChange={(event) => updateState({ minValue: event.target.value })}
              disabled={readOnly}
            />
            <select
              aria-label={`${axis}区间下限比较符`}
              value={state.minInclusive ? "≤" : "<"}
              onChange={(event) => updateState({ minInclusive: event.target.value === "≤" })}
              disabled={readOnly}
              className="h-9 appearance-none rounded-md border bg-background px-0 text-center text-sm"
            >
              <option value="<">&lt;</option>
              <option value="≤">≤</option>
            </select>
            <span className="text-center text-sm font-medium">{axis}</span>
            <select
              aria-label={`${axis}区间上限比较符`}
              value={state.maxInclusive ? "≤" : "<"}
              onChange={(event) => updateState({ maxInclusive: event.target.value === "≤" })}
              disabled={readOnly}
              className="h-9 appearance-none rounded-md border bg-background px-0 text-center text-sm"
            >
              <option value="<">&lt;</option>
              <option value="≤">≤</option>
            </select>
            <Input
              aria-label={`${axis}区间上限数值`}
              type="number"
              min="0"
              className={dimensionNumberInputClass}
              value={state.maxValue}
              placeholder="上限"
              onChange={(event) => updateState({ maxValue: event.target.value })}
              disabled={readOnly}
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        )}

        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </fieldset>
    </div>
  );
}
