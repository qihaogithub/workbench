type OpenPencilSaveFailureInput = {
  status: number;
  message?: string;
};

const OPENPENCIL_PATCH_CONFLICT_MESSAGE =
  "手绘内容已被其他协同或保存更新，请重新加载手绘页面后再保存。";

export class OpenPencilSaveFailureError extends Error {
  readonly status: number;
  readonly recoverableByReload: boolean;

  constructor(input: OpenPencilSaveFailureInput) {
    super(getOpenPencilSaveFailureMessage(input));
    this.name = "OpenPencilSaveFailureError";
    this.status = input.status;
    this.recoverableByReload = input.status === 409;
  }
}

export function getOpenPencilSaveFailureMessage(
  input: OpenPencilSaveFailureInput,
): string {
  if (input.status === 409) {
    return OPENPENCIL_PATCH_CONFLICT_MESSAGE;
  }
  return input.message?.trim() || "保存手绘草稿失败";
}

export function createOpenPencilSaveFailureError(
  input: OpenPencilSaveFailureInput,
): OpenPencilSaveFailureError {
  return new OpenPencilSaveFailureError(input);
}

export function isOpenPencilSaveFailureError(
  value: unknown,
): value is OpenPencilSaveFailureError {
  return value instanceof OpenPencilSaveFailureError;
}
