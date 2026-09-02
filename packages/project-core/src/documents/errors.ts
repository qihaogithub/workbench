import type { DocumentErrorCode, DocumentErrorShape } from "@workbench/shared/document";

export class DocumentApplicationError extends Error {
  readonly code: DocumentErrorCode;
  readonly details?: unknown;
  readonly recoverable?: boolean;

  constructor(input: DocumentErrorShape) {
    super(input.message);
    this.name = "DocumentApplicationError";
    this.code = input.code;
    this.details = input.details;
    this.recoverable = input.recoverable;
  }

  toJSON(): DocumentErrorShape {
    return {
      code: this.code,
      message: this.message,
      ...(this.details === undefined ? {} : { details: this.details }),
      ...(this.recoverable === undefined ? {} : { recoverable: this.recoverable }),
    };
  }
}

export function isDocumentApplicationError(value: unknown): value is DocumentApplicationError {
  return value instanceof DocumentApplicationError;
}
