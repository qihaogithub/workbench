import type { PreviewSize } from "@workbench/demo-ui/types";

export type {
  ValidationErrorType,
  ValidationError,
  ValidationResult,
  ValidationCheck,
  ValidationCheckIssue,
  ValidateDemoResult,
} from "@workbench/shared";

export {
  validateAll,
  validateJsonSyntax,
  validatePropsSchema,
  isValidJson,
  formatValidateDemoResult,
} from "@workbench/shared";

export {
  getDefaultValues,
  getPreviewSize,
} from "@workbench/demo-ui/validator";

export type { PreviewSize };
