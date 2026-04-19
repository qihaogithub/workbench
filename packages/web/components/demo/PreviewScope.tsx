"use client";

import React from "react";

interface PreviewScopeProps {
  children: React.ReactNode;
  className?: string;
  theme?: "light" | "dark";
}

export function PreviewScope({
  children,
  className,
  theme = "light",
}: PreviewScopeProps) {
  return (
    <div
      className={`preview-scope preview-scope--${theme}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
