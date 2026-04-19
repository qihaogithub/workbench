import { NextRequest, NextResponse } from 'next/server';
import { transform } from 'sucrase';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';

const ALLOWED_DEPENDENCIES = new Set([
  'react',
  'react-dom',
  'react/jsx-runtime',
  'lucide-react',
  'clsx',
  'tailwind-merge',
  'class-variance-authority',
  'framer-motion',
]);

const ALLOWED_PATH_PREFIXES = ['@/lib/', '@/components/'];

function extractImports(code: string): string[] {
  const imports: string[] = [];
  const importRegex = /import\s+(?:(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]|["']([^"']+)["'])/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    imports.push(match[1] || match[2]);
  }
  return imports;
}

function validateDependencies(imports: string[]): { valid: boolean; invalid: string[] } {
  const invalid: string[] = [];
  for (const dep of imports) {
    if (ALLOWED_DEPENDENCIES.has(dep)) continue;
    if (ALLOWED_PATH_PREFIXES.some(prefix => dep.startsWith(prefix))) continue;
    invalid.push(dep);
  }
  return { valid: invalid.length === 0, invalid };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'code 参数必填且必须为字符串'),
        { status: 400 }
      );
    }

    const imports = extractImports(code);
    const { valid, invalid } = validateDependencies(imports);

    if (!valid) {
      return NextResponse.json(
        createApiError('VALIDATION_ERROR', `检测到未声明的依赖: ${invalid.join(', ')}`),
        { status: 400 }
      );
    }

    const result = transform(code, {
      transforms: ['imports', 'typescript', 'jsx'],
      jsxRuntime: 'automatic',
      production: true,
    });

    return NextResponse.json(
      createApiSuccess({
        compiledCode: result.code,
        dependencies: imports,
      })
    );
  } catch (error) {
    console.error('编译错误:', error);

    const message = error instanceof Error ? error.message : '编译失败';
    return NextResponse.json(
      createApiError('VALIDATION_ERROR', message),
      { status: 500 }
    );
  }
}
