import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';

const RequestPlanApprovalParams = Type.Object({
  planMarkdown: Type.String({
    minLength: 1,
    description: 'Markdown execution plan for the user to review and optionally edit before work starts.',
  }),
  title: Type.Optional(Type.String({
    description: 'Short title for the approval dialog.',
  })),
});
type RequestPlanApprovalParams = Static<typeof RequestPlanApprovalParams>;

export interface PlanApprovalRequest {
  title?: string;
  planMarkdown: string;
}

export interface PlanApprovalResult {
  approved: boolean;
  planMarkdown?: string;
}

export type PlanApprovalHandler = (
  toolCallId: string,
  request: PlanApprovalRequest,
) => Promise<PlanApprovalResult>;

export function createRequestPlanApprovalTool(
  approvalHandler?: PlanApprovalHandler,
): AgentTool<typeof RequestPlanApprovalParams> {
  return {
    name: 'requestPlanApproval',
    label: 'Request Plan Approval',
    description:
      'Submit a Markdown execution plan for user review. This tool waits until the user approves, edits, or rejects the plan. Use before executing complex tasks.',
    parameters: RequestPlanApprovalParams,
    execute: async (toolCallId: string, args: RequestPlanApprovalParams) => {
      const planMarkdown = args.planMarkdown.trim();
      if (!planMarkdown) {
        return {
          content: [{ type: 'text' as const, text: 'Error: planMarkdown must not be empty' }],
          details: { success: false, error: 'empty_plan' },
          isError: true,
        };
      }

      if (!approvalHandler) {
        return {
          content: [{ type: 'text' as const, text: 'Error: plan approval is unavailable in this context' }],
          details: { success: false, error: 'approval_unavailable' },
          isError: true,
        };
      }

      const result = await approvalHandler(toolCallId, {
        title: args.title?.trim() || '执行计划',
        planMarkdown,
      });

      if (!result.approved) {
        return {
          content: [{ type: 'text' as const, text: 'Plan approval was rejected by the user.' }],
          details: { success: false, error: 'user_rejected' },
          isError: true,
        };
      }

      const approvedPlanMarkdown = result.planMarkdown?.trim() || planMarkdown;
      return {
        content: [{ type: 'text' as const, text: 'Plan approved by the user. Continue according to the approved plan.' }],
        details: {
          success: true,
          planMarkdown: approvedPlanMarkdown,
        },
      };
    },
  };
}

export type { RequestPlanApprovalParams };
