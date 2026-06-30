import type {
  AgentConfig,
  AgentEvent,
  UserChoiceResponse,
} from '../../core/types';
import type {
  UserChoiceRequest,
  UserChoiceResult,
  UserChoiceHandler,
} from '../pi-tools/user-choice-tool';
import { logger } from '../../utils/logger';

const USER_CHOICE_TIMEOUT_MS = 4 * 60_000;

interface PendingUserChoice {
  request: UserChoiceRequest;
  resolve: (result: UserChoiceResult) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class UserInteractionManager {
  private pendingChoices = new Map<string, PendingUserChoice>();

  constructor(
    private config: AgentConfig,
    private eventCallback?: (event: AgentEvent) => void,
  ) {}

  setEventCallback(callback: ((event: AgentEvent) => void) | undefined): void {
    this.eventCallback = callback;
  }

  requestUserChoice: UserChoiceHandler = (
    requestId: string,
    request: UserChoiceRequest,
    signal?: AbortSignal,
  ): Promise<UserChoiceResult> => {
    const sessionId = this.config.sessionId;

    if (!this.eventCallback) {
      logger.warn({ requestId }, 'userChoice: request unavailable without event callback');
      return Promise.resolve({
        success: false,
        error: 'choice_unavailable',
        message: 'User choice cards are unavailable in this context. Ask the clarification in plain text.',
      });
    }

    logger.info({ requestId, question: request.question }, 'userChoice: requesting user choice');
    this.eventCallback({
      type: 'user_choice_request',
      sessionId,
      userChoiceRequest: {
        requestId,
        sessionId,
        question: request.question,
        description: request.description,
        options: request.options,
        allowCustom: request.allowCustom,
      },
    });

    return new Promise<UserChoiceResult>((resolve) => {
      const finish = (result: UserChoiceResult) => {
        const pending = this.pendingChoices.get(requestId);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pendingChoices.delete(requestId);
        }
        signal?.removeEventListener('abort', abortHandler);
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        logger.warn({ requestId }, 'userChoice: request timed out');
        finish({
          success: false,
          error: 'choice_timeout',
          message: 'User choice request timed out.',
        });
      }, USER_CHOICE_TIMEOUT_MS);
      timeoutId.unref?.();

      const abortHandler = () => {
        finish({
          success: false,
          error: 'user_cancelled',
          message: 'User choice request was cancelled.',
        });
      };

      if (signal?.aborted) {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: 'user_cancelled',
          message: 'User choice request was cancelled.',
        });
        return;
      }
      signal?.addEventListener('abort', abortHandler, { once: true });

      this.pendingChoices.set(requestId, {
        request,
        resolve: finish,
        timeoutId,
      });
    });
  };

  resolveUserChoice(requestId: string, choice: UserChoiceResponse): void {
    const pending = this.pendingChoices.get(requestId);
    if (!pending) {
      logger.warn({ requestId }, 'userChoice: no pending choice found');
      return;
    }

    if (choice.type === 'cancel') {
      pending.resolve({
        success: false,
        error: 'user_cancelled',
        message: 'User cancelled the clarification request.',
      });
      return;
    }

    if (choice.type === 'custom') {
      const text = choice.text.trim();
      if (!pending.request.allowCustom || !text) {
        pending.resolve({
          success: false,
          error: 'invalid_choice',
          message: 'Invalid custom answer.',
        });
        return;
      }

      pending.resolve({
        success: true,
        choice: {
          type: 'custom',
          text,
        },
        message: `User selected a custom answer: ${text}`,
      });
      return;
    }

    const selected = pending.request.options.find(
      (option) => option.optionId === choice.optionId,
    );
    if (!selected) {
      pending.resolve({
        success: false,
        error: 'invalid_choice',
        message: 'Invalid option selected.',
      });
      return;
    }

    pending.resolve({
      success: true,
      choice: {
        type: 'option',
        optionId: selected.optionId,
        label: selected.label,
        value: selected.value,
        description: selected.description,
      },
      message: `User selected: ${selected.label}`,
    });
  }

  clearPendingChoices(): void {
    for (const pending of this.pendingChoices.values()) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingChoices.clear();
  }
}
