"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface DocumentNameDialogProps {
  open: boolean;
  title: string;
  label: string;
  defaultValue: string;
  description?: string;
  placeholder?: string;
  submitLabel?: string;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

/** 返回指定前缀下第一个未占用的默认名称。 */
export function getNextAvailableTitle(
  prefix: string,
  existingTitles: Iterable<string>,
): string {
  const occupied = new Set(existingTitles);
  let index = 1;
  while (occupied.has(`${prefix} ${index}`)) index += 1;
  return `${prefix} ${index}`;
}

export function DocumentNameDialog({
  open,
  title,
  label,
  defaultValue,
  description,
  placeholder,
  submitLabel = "创建",
  onConfirm,
  onCancel,
}: DocumentNameDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setSubmitting(false);
    }
  }, [defaultValue, open]);

  const normalizedValue = value.trim();
  const canSubmit = normalizedValue.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm(normalizedValue);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !submitting) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription className="leading-6">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="document-name-dialog-input">{label}</Label>
            <Input
              id="document-name-dialog-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              autoFocus
              disabled={submitting}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? "处理中..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
