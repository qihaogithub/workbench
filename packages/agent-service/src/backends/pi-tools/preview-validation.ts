import { PreviewRuntimeContractError, type RuntimeContractIssue } from '@workbench/preview-contract/runtime';
import { compilePreviewPageSource } from '@workbench/preview-contract/compiler';

type ToolRuntimeValidationStage = RuntimeContractIssue['stage'] | 'prototype_contract';
type PrototypeGateDecision =
  | 'accept_prototype'
  | 'repair_prototype'
  | 'upgrade_to_high_fidelity';

interface PrototypeGateResult {
  decision: PrototypeGateDecision;
  reasonCodes: string[];
  summary: string;
}

interface ToolRuntimeValidationIssue {
  file: string;
  pageId?: string;
  stage: ToolRuntimeValidationStage;
  code: string;
  message: string;
  instruction: string;
  severity: 'error' | 'warning';
  moduleName?: string;
  importName?: string;
}

export interface ToolRuntimeValidation {
  ok: boolean;
  file: string;
  pageId?: string;
  issues: ToolRuntimeValidationIssue[];
  prototypeGate?: PrototypeGateResult;
}

export function formatRuntimeValidationInstruction(
  runtimeValidation: ToolRuntimeValidation | undefined,
): string {
  if (!runtimeValidation || runtimeValidation.ok) return '';

  const gate = runtimeValidation.prototypeGate;
  const pageId = runtimeValidation.pageId || '<pageId>';
  const gateInstruction = gate
    ? gate.decision === 'repair_prototype'
      ? [
          '',
          'Prototype gate decision: repair_prototype.',
          'Repair the HTML/CSS once and write the corrected prototype file again before ending the task.',
          'Keep the page as prototype-html-css unless the same page still fails the prototype gate after the repair attempt.',
        ].join('\n')
      : gate.decision === 'upgrade_to_high_fidelity'
        ? [
            '',
            'Prototype gate decision: upgrade_to_high_fidelity.',
            `Regenerate this page as high-fidelity React: write demos/${pageId}/index.tsx, keep config.schema.json valid, and ensure the React file validates before considering the conversion complete. Runtime type is inferred from files on disk.`,
            `Tell the user briefly why the page needs isolated runtime: ${gate.summary}`,
          ].join('\n')
        : ''
    : '';

  return `\n\nPreview validation failed. Continue fixing this page before ending the task:${gateInstruction}\n${JSON.stringify(runtimeValidation, null, 2)}`;
}

function getDemoFileInfo(filePath: string): { pageId: string; fileName: string } | undefined {
  const match = filePath.match(/^demos\/([^/]+)\/(index\.tsx|config\.schema\.json|prototype\.html|prototype\.css)$/u);
  return match?.[1] && match?.[2]
    ? { pageId: match[1], fileName: match[2] }
    : undefined;
}

function normalizePath(filePath: string): string {
  return filePath.split('\\').join('/');
}

function toToolIssue(file: string, pageId: string, issue: RuntimeContractIssue): ToolRuntimeValidationIssue {
  return { ...issue, pageId, file };
}

const MAX_PROTOTYPE_HTML_LENGTH = 200_000;
const MAX_PROTOTYPE_CSS_LENGTH = 120_000;
const PROTOTYPE_GLOBAL_SELECTOR_RE = /(^|[,{;]\s*)(html|body|:root)\b/i;

function toPrototypeToolValidation(
  file: string,
  pageId: string,
  html: string,
  css: string,
): ToolRuntimeValidation {
  const issues: ToolRuntimeValidationIssue[] = [];
  const repairReasonCodes: string[] = [];
  const upgradeReasonCodes: string[] = [];
  const addIssue = (
    code: string,
    message: string,
    instruction: string,
    gateDecision: Exclude<PrototypeGateDecision, 'accept_prototype'>,
  ) => {
    issues.push({
      file,
      pageId,
      severity: 'error',
      stage: 'prototype_contract',
      code,
      message,
      instruction,
    });
    if (gateDecision === 'upgrade_to_high_fidelity') {
      upgradeReasonCodes.push(code);
    } else {
      repairReasonCodes.push(code);
    }
  };

  if (!html.trim()) {
    addIssue(
      'PROTOTYPE_HTML_EMPTY',
      '原型页 HTML 不能为空',
      '请提供可渲染的 prototype.html 内容。',
      'repair_prototype',
    );
  }
  if (html.length > MAX_PROTOTYPE_HTML_LENGTH) {
    addIssue(
      'PROTOTYPE_HTML_TOO_LARGE',
      '原型页 HTML 超过 MVP 限制',
      '请压缩 HTML 结构，避免一次写入过大的页面内容。',
      'repair_prototype',
    );
  }
  if (css.length > MAX_PROTOTYPE_CSS_LENGTH) {
    addIssue(
      'PROTOTYPE_CSS_TOO_LARGE',
      '原型页 CSS 超过 MVP 限制',
      '请压缩 CSS，移除不必要的样式规则。',
      'repair_prototype',
    );
  }
  if (/<\s*script\b/i.test(html)) {
    addIssue(
      'PROTOTYPE_SCRIPT_FORBIDDEN',
      '原型页不允许包含 script 标签',
      '页面需要执行脚本时应升级为高保真页；否则请移除 script 标签。',
      'upgrade_to_high_fidelity',
    );
  }
  if (/\son[a-z]+\s*=/i.test(html)) {
    addIssue(
      'PROTOTYPE_INLINE_EVENT_FORBIDDEN',
      '原型页不允许包含内联事件属性',
      '页面需要真实事件处理时应升级为高保真页；否则请移除 onclick、onload 等内联事件属性。',
      'upgrade_to_high_fidelity',
    );
  }
  if (/javascript\s*:/i.test(html) || /javascript\s*:/i.test(css)) {
    addIssue(
      'PROTOTYPE_JAVASCRIPT_URL_FORBIDDEN',
      '原型页不允许包含 javascript: URL',
      '页面需要执行 JavaScript URL 时应升级为高保真页；否则请将链接改为普通 URL 或占位链接。',
      'upgrade_to_high_fidelity',
    );
  }
  if (/<\s*(iframe|embed|object)\b/i.test(html)) {
    addIssue(
      'PROTOTYPE_EMBED_FORBIDDEN',
      '原型页不允许直接内嵌 iframe、embed 或 object',
      '需要嵌入第三方运行时内容时应升级为高保真页。',
      'upgrade_to_high_fidelity',
    );
  }
  if (/<\s*form\b[^>]*\saction\s*=/i.test(html)) {
    addIssue(
      'PROTOTYPE_FORM_ACTION_FORBIDDEN',
      '原型页不允许包含会提交的表单 action',
      '需要真实表单提交时应升级为高保真页；静态表单请移除 action。',
      'upgrade_to_high_fidelity',
    );
  }
  if (/@import\b/i.test(css)) {
    addIssue(
      'PROTOTYPE_CSS_IMPORT_FORBIDDEN',
      '原型页不允许使用 CSS @import',
      '请移除远程样式导入，把必要样式内联到 prototype.css。',
      'repair_prototype',
    );
  }
  if (PROTOTYPE_GLOBAL_SELECTOR_RE.test(css)) {
    addIssue(
      'PROTOTYPE_GLOBAL_SELECTOR_FORBIDDEN',
      '原型页 CSS 不允许直接选择 html、body 或 :root',
      '请把全局选择器改为原型页根节点内的局部 class 选择器。',
      'repair_prototype',
    );
  }

  const decision: PrototypeGateDecision = upgradeReasonCodes.length > 0
    ? 'upgrade_to_high_fidelity'
    : issues.length > 0
      ? 'repair_prototype'
      : 'accept_prototype';
  const reasonCodes = Array.from(new Set([
    ...upgradeReasonCodes,
    ...repairReasonCodes,
  ]));
  const summary = decision === 'accept_prototype'
    ? 'HTML/CSS 原型页可安全内嵌渲染。'
    : decision === 'repair_prototype'
      ? 'HTML/CSS 原型页存在可自动修复的问题，修复后可继续按原型页保存。'
      : '页面触碰运行时隔离红线，应升级为高保真页。';

  return {
    ok: issues.length === 0,
    file,
    pageId,
    issues,
    prototypeGate: { decision, reasonCodes, summary },
  };
}

export function validatePreviewFileWrite(
  filePath: string,
  content: string,
  runtimeType?: string,
): ToolRuntimeValidation | undefined {
  const normalizedPath = normalizePath(filePath);
  const demoFile = getDemoFileInfo(normalizedPath);
  const pageId = demoFile?.pageId;

  if (pageId && demoFile.fileName === 'index.tsx') {
    try {
      compilePreviewPageSource(content, {
        resolveDependencyUrl: (specifier) => `/runtime/${specifier}.js`,
      });
      return { ok: true, file: normalizedPath, pageId, issues: [] };
    } catch (error) {
      if (error instanceof PreviewRuntimeContractError) {
        return {
          ok: false,
          file: normalizedPath,
          pageId,
          issues: error.issues.map((issue) => toToolIssue(normalizedPath, pageId, issue)),
        };
      }
      return {
        ok: false,
        file: normalizedPath,
        pageId,
        issues: [
          {
            file: normalizedPath,
            pageId,
            stage: 'compile_transform',
            code: 'COMPILE_TRANSFORM_FAILED',
            severity: 'error',
            message: error instanceof Error ? error.message : '页面源码编译失败',
            instruction: '请修复 TSX/JSX 语法错误，保留一个完整的 React 组件模块后重新生成。',
          },
        ],
      };
    }
  }

  if (pageId && demoFile.fileName === 'prototype.html') {
    // 当页面已升级为高保真运行时，跳过原型页校验
    if (runtimeType && runtimeType !== 'prototype-html-css') {
      return { ok: true, file: normalizedPath, pageId, issues: [] };
    }
    return toPrototypeToolValidation(normalizedPath, pageId, content, '');
  }

  if (pageId && demoFile.fileName === 'prototype.css') {
    // 当页面已升级为高保真运行时，跳过原型页校验
    if (runtimeType && runtimeType !== 'prototype-html-css') {
      return { ok: true, file: normalizedPath, pageId, issues: [] };
    }
    return toPrototypeToolValidation(normalizedPath, pageId, '<div></div>', content);
  }

  if (pageId && demoFile.fileName === 'config.schema.json') {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;

      // 校验 $demo.previewSize 存在性
      const demo = parsed.$demo;
      const previewSize =
        demo != null && typeof demo === 'object' && !Array.isArray(demo)
          ? (demo as Record<string, unknown>).previewSize
          : undefined;
      const hasValidPreviewSize =
        previewSize != null &&
        typeof previewSize === 'object' &&
        !Array.isArray(previewSize) &&
        ('width' in (previewSize as Record<string, unknown>)) &&
        ('height' in (previewSize as Record<string, unknown>));

      if (!hasValidPreviewSize) {
        return {
          ok: false,
          file: normalizedPath,
          pageId,
          issues: [
            {
              file: normalizedPath,
              pageId,
              stage: 'schema_contract',
              code: 'MISSING_PREVIEW_SIZE',
              severity: 'error',
              message: 'config.schema.json 缺少 $demo.previewSize 字段（需包含 width 和 height）',
              instruction: '请在 config.schema.json 中添加 "$demo": { "previewSize": { "width": <数字>, "height": <数字> } }，宽高根据页面目标设备自行判断。',
            },
          ],
        };
      }

      return { ok: true, file: normalizedPath, pageId, issues: [] };
    } catch {
      return {
        ok: false,
        file: normalizedPath,
        pageId,
        issues: [
          {
            file: normalizedPath,
            pageId,
            stage: 'schema_contract',
            code: 'INVALID_JSON',
            severity: 'error',
            message: '页面配置 schema 不是合法 JSON',
            instruction: '请修复 config.schema.json 的 JSON 语法；如果页面不需要配置字段，保留空 properties 对象。',
          },
        ],
      };
    }
  }

  return undefined;
}
