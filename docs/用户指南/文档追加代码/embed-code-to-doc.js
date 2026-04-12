#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = process.cwd();

function extractCodePaths(content) {
  const paths = new Set();
  
  const patterns = [
    /`([^`]+\.(?:tsx?|jsx?|css|json|md))`/g,
    /\[([^\]]+)\]\(file:\/\/\/[^)]+\)/g,
    /(?:^|\s|[\|])(packages\/[^\s\|\`\]\)]+\.(?:tsx?|jsx?|css|json))/gm,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      let filePath = match[1];
      
      if (filePath.startsWith('file:///')) {
        continue;
      }
      
      if (filePath.includes('://') || filePath.startsWith('http')) {
        continue;
      }
      
      if (!filePath.includes('/')) {
        continue;
      }
      
      if (filePath.startsWith('packages/')) {
        paths.add(filePath);
      }
    }
  }
  
  return Array.from(paths).sort();
}

function resolveFilePath(relativePath) {
  const normalizedPath = relativePath.replace(/\//g, path.sep);
  return path.join(WORKSPACE_ROOT, normalizedPath);
}

function formatCodeBlock(filePath, content) {
  const ext = path.extname(filePath).slice(1);
  const langMap = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    css: 'css',
    json: 'json',
    md: 'markdown',
  };
  const lang = langMap[ext] || ext;
  
  return `### ${filePath}\n\n\`\`\`${lang}\n${content}\n\`\`\`\n`;
}

function removeExistingAppendix(content) {
  const appendixPattern = /\n---\n\n## 附录：相关代码原文[\s\S]*$/;
  return content.replace(appendixPattern, '');
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('用法: node embed-code-to-doc.js <文档相对路径>');
    console.log('示例: node embed-code-to-doc.js docs/plans/Web端预览区CSS样式缺失问题.md');
    process.exit(1);
  }
  
  const docRelativePath = args[0];
  const docAbsolutePath = path.join(WORKSPACE_ROOT, docRelativePath);
  
  if (!fs.existsSync(docAbsolutePath)) {
    console.error(`错误: 文档不存在 - ${docAbsolutePath}`);
    process.exit(1);
  }
  
  console.log(`正在处理文档: ${docRelativePath}`);
  
  const originalContent = fs.readFileSync(docAbsolutePath, 'utf-8');
  
  let content = removeExistingAppendix(originalContent);
  
  const codePaths = extractCodePaths(content);
  
  if (codePaths.length === 0) {
    console.log('未找到代码路径');
    process.exit(0);
  }
  
  console.log(`找到 ${codePaths.length} 个代码路径:`);
  codePaths.forEach(p => console.log(`  - ${p}`));
  
  const codeContents = [];
  const notFound = [];
  
  for (const relativePath of codePaths) {
    const absolutePath = resolveFilePath(relativePath);
    
    if (fs.existsSync(absolutePath)) {
      const fileContent = fs.readFileSync(absolutePath, 'utf-8');
      codeContents.push({
        path: relativePath,
        content: fileContent,
      });
      console.log(`  ✓ 读取: ${relativePath}`);
    } else {
      notFound.push(relativePath);
      console.log(`  ✗ 未找到: ${relativePath}`);
    }
  }
  
  if (codeContents.length === 0) {
    console.log('没有成功读取任何代码文件');
    process.exit(0);
  }
  
  const appendix = [
    '\n---\n\n## 附录：相关代码原文\n',
    '> 以下为文档中引用的代码文件原文，方便查阅。\n',
  ];
  
  for (const item of codeContents) {
    appendix.push(formatCodeBlock(item.path, item.content));
  }
  
  const newContent = content.trimEnd() + appendix.join('\n');
  
  const ext = path.extname(docAbsolutePath);
  const baseName = path.basename(docAbsolutePath, ext);
  const dir = path.dirname(docAbsolutePath);
  const outputFileName = `${baseName}-with-code${ext}`;
  const outputPath = path.join(dir, outputFileName);
  
  fs.writeFileSync(outputPath, newContent, 'utf-8');
  
  const outputRelativePath = path.join(path.dirname(docRelativePath), outputFileName);
  console.log(`\n完成! 已生成副本: ${outputRelativePath}`);
  console.log(`已嵌入 ${codeContents.length} 个代码文件到文档底部`);
  
  if (notFound.length > 0) {
    console.log(`\n警告: ${notFound.length} 个文件未找到:`);
    notFound.forEach(p => console.log(`  - ${p}`));
  }
}

main();
