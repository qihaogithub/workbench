// 真实页面截图性能测试
// 用法: npx tsx tests/real-page-test.ts

import { renderPage, destroyBrowser } from "../src/snapshot-renderer";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const OUTPUT_DIR = join(__dirname, "..", "test-output");
const REAL_CODE_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "data",
  "projects",
  "proj_1779608460378",
  "workspace",
  "demos",
  "demo_1779608460379_a1b2c3",
  "index.tsx",
);

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 读取真实页面代码
  if (!existsSync(REAL_CODE_PATH)) {
    console.error(`找不到真实页面代码: ${REAL_CODE_PATH}`);
    process.exit(1);
  }

  const realCode = readFileSync(REAL_CODE_PATH, "utf-8");
  console.log(`已加载真实页面代码 (${(realCode.length / 1024).toFixed(1)}KB)\n`);

  console.log("=== 真实页面截图性能测试 ===\n");

  // 测试 1: 单页截图（含外部图片）
  console.log("测试 1: 单页截图 (375x812, 含外部图片)");
  const start1 = Date.now();
  const buffer1 = await renderPage({ code: realCode, width: 375, height: 812 });
  const elapsed1 = Date.now() - start1;
  writeFileSync(join(OUTPUT_DIR, "real-page.png"), buffer1);
  console.log(`  耗时: ${elapsed1}ms, 文件大小: ${(buffer1.length / 1024).toFixed(1)}KB\n`);

  // 测试 2: 连续 3 次截图（模拟同一页面反复更新）
  console.log("测试 2: 连续 3 次截图（同一页面）");
  const seqTimes: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    await renderPage({ code: realCode, width: 375, height: 812 });
    seqTimes.push(Date.now() - start);
  }
  const avgSeq = seqTimes.reduce((a, b) => a + b, 0) / seqTimes.length;
  console.log(`  各次耗时: ${seqTimes.join("ms, ")}ms`);
  console.log(`  平均: ${avgSeq.toFixed(0)}ms\n`);

  // 测试 3: 并发 5 页截图
  console.log("测试 3: 并发 5 页截图");
  const batchStart = Date.now();
  const batchResults = await Promise.all(
    Array.from({ length: 5 }, () =>
      renderPage({ code: realCode, width: 375, height: 812 })
    )
  );
  const batchElapsed = Date.now() - batchStart;
  const totalSize = batchResults.reduce((sum, buf) => sum + buf.length, 0);
  console.log(`  总耗时: ${batchElapsed}ms, 平均每页: ${(batchElapsed / 5).toFixed(0)}ms`);
  console.log(`  总文件大小: ${(totalSize / 1024).toFixed(1)}KB\n`);

  // 汇总
  console.log("=== 汇总 ===");
  console.log(`单页截图(含图片): ${elapsed1}ms`);
  console.log(`连续3次平均: ${avgSeq.toFixed(0)}ms`);
  console.log(`并发5页总耗时: ${batchElapsed}ms (平均 ${(batchElapsed / 5).toFixed(0)}ms/页)`);
  console.log(`\n截图文件已保存到: ${OUTPUT_DIR}`);

  await destroyBrowser();
}

main().catch((err) => {
  console.error("测试失败:", err);
  process.exit(1);
});
