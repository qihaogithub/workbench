let _typeLimits: Record<string, number> | undefined;

export function setPageTypeLimits(limits: Record<string, number> | undefined): void {
  _typeLimits = limits ? { ...limits } : undefined;
}

export function getPageTypeLimits(): Record<string, number> | undefined {
  return _typeLimits;
}
