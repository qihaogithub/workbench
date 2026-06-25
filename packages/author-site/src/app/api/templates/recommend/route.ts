import { NextRequest, NextResponse } from "next/server";
import { getAgentClient } from "@/lib/agent-client";
import {
  createApiError,
  createApiSuccess,
  listProjectTemplates,
} from "@/lib/fs-utils";

interface TemplateRecommendation {
  templateId: string;
  reason: string;
  confidence: number;
}

function extractJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("NO_JSON");
    return JSON.parse(match[0]);
  }
}

function normalizeRecommendation(
  value: unknown,
  validTemplateIds: Set<string>,
): TemplateRecommendation {
  if (!value || typeof value !== "object") {
    throw new Error("INVALID_RECOMMENDATION");
  }

  const record = value as Record<string, unknown>;
  const templateId = record.templateId;
  if (typeof templateId !== "string" || !validTemplateIds.has(templateId)) {
    throw new Error("INVALID_RECOMMENDATION");
  }

  const confidence =
    typeof record.confidence === "number"
      ? Math.max(0, Math.min(1, record.confidence))
      : 0.6;

  return {
    templateId,
    reason:
      typeof record.reason === "string" && record.reason.trim()
        ? record.reason.trim()
        : "该模板与描述最匹配",
    confidence,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description } = body as { description?: unknown };

    if (typeof description !== "string" || !description.trim()) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "description 参数必填"),
        { status: 400 },
      );
    }

    const templates = listProjectTemplates();
    if (templates.length === 0) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "暂无可推荐的模板"),
        { status: 400 },
      );
    }

    const validTemplateIds = new Set(templates.map((template) => template.id));
    const compactTemplates = templates.map((template) => ({
      id: template.id,
      category: template.category,
      name: template.name,
      description: template.description,
      demoCount: template.demoCount,
      pages: template.demoPages?.map((page) => page.name) ?? [],
    }));

    const prompt = [
      "你是项目模板推荐助手。只能从给定模板中选择一个最匹配的模板。",
      "必须只输出 JSON，不要输出 Markdown。",
      'JSON 格式：{"templateId":"模板 id","reason":"简短中文理由","confidence":0 到 1 的数字}',
      `用户描述：${description.trim()}`,
      `模板列表：${JSON.stringify(compactTemplates)}`,
    ].join("\n");

    const result = await getAgentClient().sendMessage(
      `template-recommend-${Date.now()}`,
      prompt,
      {
        options: {
          timeout: 30000,
          stream: false,
        },
      },
    );

    if (!result.success) {
      return NextResponse.json(
        createApiError(
          "AGENT_SERVICE_ERROR",
          result.error?.message || "AI 推荐服务不可用",
        ),
        { status: 503 },
      );
    }

    const content = result.data.content || "";
    const recommendation = normalizeRecommendation(
      extractJsonObject(content),
      validTemplateIds,
    );
    const template = templates.find((item) => item.id === recommendation.templateId);

    return NextResponse.json(
      createApiSuccess({
        ...recommendation,
        template,
      }),
    );
  } catch (error) {
    console.error("Error recommending template:", error);
    return NextResponse.json(
      createApiError("AGENT_SERVICE_ERROR", "AI 推荐服务不可用"),
      { status: 503 },
    );
  }
}
