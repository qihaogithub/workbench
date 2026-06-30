import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { UserChoiceOption, UserChoiceResponse } from '../../core/types';

const UserChoiceOptionParams = Type.Object({
  label: Type.String({
    minLength: 1,
    description: 'User-facing option label.',
  }),
  value: Type.Optional(Type.String({
    description: 'Optional stable value returned to the agent when selected.',
  })),
  description: Type.Optional(Type.String({
    description: 'Optional short explanation for this option.',
  })),
});

const RequestUserChoiceParams = Type.Object({
  question: Type.String({
    minLength: 1,
    description: 'A concise question the user should answer before the agent continues.',
  }),
  description: Type.Optional(Type.String({
    description: 'Optional context explaining why this choice is needed.',
  })),
  options: Type.Array(UserChoiceOptionParams, {
    minItems: 2,
    maxItems: 6,
    description: 'Two to six mutually exclusive options.',
  }),
  allowCustom: Type.Optional(Type.Boolean({
    description: 'Whether the user may choose Other and enter custom text. Defaults to true.',
  })),
});

type RequestUserChoiceParams = Static<typeof RequestUserChoiceParams>;

export interface UserChoiceRequest {
  question: string;
  description?: string;
  options: UserChoiceOption[];
  allowCustom: boolean;
}

export interface UserChoiceResult {
  success: boolean;
  choice?: {
    type: 'option' | 'custom';
    optionId?: string;
    label?: string;
    value?: string;
    description?: string;
    text?: string;
  };
  error?: 'choice_unavailable' | 'user_cancelled' | 'choice_timeout' | 'invalid_choice';
  message: string;
}

export type UserChoiceHandler = (
  requestId: string,
  request: UserChoiceRequest,
  signal?: AbortSignal,
) => Promise<UserChoiceResult>;

function normalizeOptions(options: RequestUserChoiceParams['options']): UserChoiceOption[] {
  return options.map((option, index) => ({
    optionId: `option_${index + 1}`,
    label: option.label.trim(),
    value: option.value?.trim() || undefined,
    description: option.description?.trim() || undefined,
  }));
}

function resultText(result: UserChoiceResult): string {
  if (!result.success) return result.message;
  if (result.choice?.type === 'custom') {
    return `User selected a custom answer: ${result.choice.text}`;
  }
  return `User selected: ${result.choice?.label}${result.choice?.value ? ` (${result.choice.value})` : ''}`;
}

export function createRequestUserChoiceTool(
  choiceHandler?: UserChoiceHandler,
): AgentTool<typeof RequestUserChoiceParams> {
  return {
    name: 'requestUserChoice',
    label: 'Request User Choice',
    description:
      'Ask the user a single-choice clarification question and wait for their answer. Use only when the answer affects the implementation direction and cannot be inferred from context. Do not use for permissions or approvals.',
    parameters: RequestUserChoiceParams,
    execute: async (toolCallId: string, args: RequestUserChoiceParams, signal?: AbortSignal) => {
      const question = args.question.trim();
      const description = args.description?.trim() || undefined;
      const options = normalizeOptions(args.options);

      if (!question) {
        return {
          content: [{ type: 'text' as const, text: 'Error: question must not be empty' }],
          details: { success: false, error: 'empty_question' },
          isError: true,
        };
      }

      if (options.length < 2 || options.length > 6 || options.some((option) => !option.label)) {
        return {
          content: [{ type: 'text' as const, text: 'Error: provide 2-6 non-empty options' }],
          details: { success: false, error: 'invalid_options' },
          isError: true,
        };
      }

      if (!choiceHandler) {
        const result: UserChoiceResult = {
          success: false,
          error: 'choice_unavailable',
          message: 'User choice cards are unavailable in this context. Ask the clarification in plain text.',
        };
        return {
          content: [{ type: 'text' as const, text: result.message }],
          details: result,
          isError: true,
        };
      }

      const result = await choiceHandler(toolCallId, {
        question,
        description,
        options,
        allowCustom: args.allowCustom ?? true,
      }, signal);

      return {
        content: [{ type: 'text' as const, text: resultText(result) }],
        details: result,
        isError: !result.success,
      };
    },
  };
}

export type { RequestUserChoiceParams, UserChoiceResponse };
