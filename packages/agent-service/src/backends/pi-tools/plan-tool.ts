import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { PlanItem, PlanItemStatus } from '../../core/types';

const PLAN_STATUSES: PlanItemStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'failed',
];

const UpdatePlanParams = Type.Object({
  items: Type.Array(
    Type.Object({
      id: Type.String({
        minLength: 1,
        description: 'Stable task id within the current user request, for example "inspect" or "implement-ui".',
      }),
      title: Type.String({
        minLength: 1,
        description: 'Short human-readable task title, preferably Chinese.',
      }),
      status: Type.Union([
        Type.Literal('pending'),
        Type.Literal('in_progress'),
        Type.Literal('completed'),
        Type.Literal('failed'),
      ]),
    }),
    {
      minItems: 1,
      description: 'The complete current plan item list for this task.',
    },
  ),
});
type UpdatePlanParams = Static<typeof UpdatePlanParams>;

function normalizePlanItems(items: UpdatePlanParams['items']): PlanItem[] | { error: string } {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'items must contain at least one plan item' };
  }

  const seen = new Set<string>();
  const normalized: PlanItem[] = [];

  for (const item of items) {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const status = item.status as PlanItemStatus;

    if (!id) return { error: 'item id must not be empty' };
    if (!title) return { error: `title must not be empty for item "${id}"` };
    if (!PLAN_STATUSES.includes(status)) {
      return { error: `invalid status "${String(item.status)}" for item "${id}"` };
    }
    if (seen.has(id)) return { error: `duplicate plan item id "${id}"` };

    seen.add(id);
    normalized.push({ id, title, status });
  }

  return normalized;
}

export function createUpdatePlanTool(): AgentTool<typeof UpdatePlanParams> {
  return {
    name: 'updatePlan',
    label: 'Update Plan',
    description:
      'Create or replace the current structured task plan. Use for complex multi-step tasks and update statuses as work progresses.',
    parameters: UpdatePlanParams,
    execute: async (_toolCallId: string, args: UpdatePlanParams) => {
      const normalized = normalizePlanItems(args.items);

      if (!Array.isArray(normalized)) {
        return {
          content: [{ type: 'text' as const, text: `Error updating plan: ${normalized.error}` }],
          details: { success: false, error: normalized.error },
          isError: true,
        };
      }

      const completedCount = normalized.filter((item) => item.status === 'completed').length;
      return {
        content: [
          {
            type: 'text' as const,
            text: `Plan updated: ${completedCount}/${normalized.length} completed.`,
          },
        ],
        details: {
          success: true,
          items: normalized,
        },
      };
    },
  };
}

export type { UpdatePlanParams };
