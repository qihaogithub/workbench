// 性能测试：直接调用 renderPage 测试截图生成速度
// 用法: npx tsx tests/perf-test.ts

import { renderPage, destroyBrowser } from "../src/snapshot-renderer";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// 简单 React 组件代码
const SIMPLE_CODE = `
export default function App() {
  return React.createElement('div', {
    style: { padding: 20, fontFamily: 'sans-serif' }
  },
    React.createElement('h1', null, 'Hello World'),
    React.createElement('p', null, '这是一个简单的测试页面'),
    React.createElement('div', {
      style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }
    },
      [1,2,3,4].map(i => React.createElement('div', {
        key: i,
        style: { background: '#e0e7ff', padding: 12, borderRadius: 8, textAlign: 'center' }
      }, 'Card ' + i))
    )
  );
}
`;

// 复杂 React 组件代码（更多元素和样式）
const COMPLEX_CODE = `
export default function App() {
  const items = Array.from({ length: 20 }, (_, i) => i + 1);
  return React.createElement('div', {
    style: { padding: 16, fontFamily: 'sans-serif', background: '#f8fafc', minHeight: '100%' }
  },
    React.createElement('header', {
      style: { background: '#1e293b', color: 'white', padding: '12px 16px', borderRadius: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
    },
      React.createElement('h2', null, 'Dashboard'),
      React.createElement('span', { style: { fontSize: 12, opacity: 0.7 } }, 'v1.0')
    ),
    React.createElement('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }
    },
      ['Users', 'Orders', 'Revenue', 'Growth'].map((label, i) =>
        React.createElement('div', {
          key: label,
          style: { background: 'white', padding: 12, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }
        },
          React.createElement('div', { style: { fontSize: 24, fontWeight: 'bold', color: ['#3b82f6','#10b981','#f59e0b','#ef4444'][i] } }, (i + 1) * 234),
          React.createElement('div', { style: { fontSize: 12, color: '#64748b', marginTop: 4 } }, label)
        )
      )
    ),
    React.createElement('div', {
      style: { background: 'white', borderRadius: 8, padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
    },
      React.createElement('h3', { style: { marginBottom: 8, fontSize: 14 } }, 'Recent Items'),
      items.map(i =>
        React.createElement('div', {
          key: i,
          style: { padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 13 }
        },
          React.createElement('span', null, 'Item ' + i),
          React.createElement('span', { style: { color: '#94a3b8' } }, new Date().toLocaleDateString())
        )
      )
    )
  );
}
`;

const OUTPUT_DIR = join(__dirname, "..", "test-output");

async function measureSingleRender(
  label: string,
  code: string,
  width: number,
  height: number,
  warmup = true,
): Promise<{ elapsed: number; size: number }> {
  // 预热（首次启动浏览器较慢）
  if (warmup) {
    console.log("  预热中...");
    await renderPage({ code: SIMPLE_CODE, width: 375, height: 100 });
  }

  const start = Date.now();
  const buffer = await renderPage({ code, width, height });
  const elapsed = Date.now() - start;

  return { elapsed, size: buffer.length };
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log("=== Puppeteer 截图性能测试 ===\n");

  // 测试 1: 简单组件 - 单页截图
  console.log("测试 1: 简单组件 (375x812)");
  const simple = await measureSingleRender("简单组件", SIMPLE_CODE, 375, 812);
  writeFileSync(join(OUTPUT_DIR, "simple.png"), await renderPage({ code: SIMPLE_CODE, width: 375, height: 812 }));
  console.log(`  耗时: ${simple.elapsed}ms, 文件大小: ${(simple.size / 1024).toFixed(1)}KB\n`);

  // 测试 2: 复杂组件 - 单页截图
  console.log("测试 2: 复杂组件 (375x812)");
  const complex = await measureSingleRender("复杂组件", COMPLEX_CODE, 375, 812, false);
  writeFileSync(join(OUTPUT_DIR, "complex.png"), await renderPage({ code: COMPLEX_CODE, width: 375, height: 812 }));
  console.log(`  耗时: ${complex.elapsed}ms, 文件大小: ${(complex.size / 1024).toFixed(1)}KB\n`);

  // 测试 3: 连续 5 次截图（模拟同一页面反复更新）
  console.log("测试 3: 连续 5 次截图（同一组件）");
  const sequentialTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    await renderPage({ code: SIMPLE_CODE, width: 375, height: 812 });
    sequentialTimes.push(Date.now() - start);
  }
  const avgSeq = sequentialTimes.reduce((a, b) => a + b, 0) / sequentialTimes.length;
  console.log(`  各次耗时: ${sequentialTimes.join("ms, ")}ms`);
  console.log(`  平均: ${avgSeq.toFixed(0)}ms\n`);

  // 测试 4: 并发 5 页截图
  console.log("测试 4: 并发 5 页截图");
  const batchStart = Date.now();
  const batchResults = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      renderPage({ code: i % 2 === 0 ? SIMPLE_CODE : COMPLEX_CODE, width: 375, height: 812 })
    )
  );
  const batchElapsed = Date.now() - batchStart;
  const totalSize = batchResults.reduce((sum, buf) => sum + buf.length, 0);
  console.log(`  总耗时: ${batchElapsed}ms, 平均每页: ${(batchElapsed / 5).toFixed(0)}ms`);
  console.log(`  总文件大小: ${(totalSize / 1024).toFixed(1)}KB\n`);

  // 测试 5: 模拟 10 页批量（并发 5）
  console.log("测试 5: 模拟 10 页批量（并发 5）");
  const pages = Array.from({ length: 10 }, (_, i) => ({
    code: i % 2 === 0 ? SIMPLE_CODE : COMPLEX_CODE,
    width: 375,
    height: 812,
  }));
  const bulkStart = Date.now();
  const concurrency = 5;
  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);
    await Promise.all(batch.map((p) => renderPage(p)));
  }
  const bulkElapsed = Date.now() - bulkStart;
  console.log(`  总耗时: ${bulkElapsed}ms, 平均每页: ${(bulkElapsed / 10).toFixed(0)}ms\n`);

  // 汇总
  console.log("=== 汇总 ===");
  console.log(`简单组件单页: ${simple.elapsed}ms`);
  console.log(`复杂组件单页: ${complex.elapsed}ms`);
  console.log(`连续5次平均: ${avgSeq.toFixed(0)}ms`);
  console.log(`并发5页总耗时: ${batchElapsed}ms (平均 ${(batchElapsed / 5).toFixed(0)}ms/页)`);
  console.log(`10页批量(并发5): ${bulkElapsed}ms (平均 ${(bulkElapsed / 10).toFixed(0)}ms/页)`);
  console.log(`\n截图文件已保存到: ${OUTPUT_DIR}`);

  await destroyBrowser();
}

main().catch((err) => {
  console.error("测试失败:", err);
  process.exit(1);
});
