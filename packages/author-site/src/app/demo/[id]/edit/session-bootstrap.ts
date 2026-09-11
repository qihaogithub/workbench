export function buildEditSessionRequestBody(demoId: string) {
  return { demoId, forceNew: true as const };
}
