import React, { useState } from 'react';
import { Copy, Check, Table2, AlignLeft, AlignCenter, AlignRight, List } from 'lucide-react';

interface DemoProps {
  title: string;
  description: string;
}

interface TableExample {
  id: string;
  title: string;
  description: string;
  markdown: string;
  render: React.ReactNode;
}

export default function MarkdownTableDemo({ title, description }: DemoProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (markdown: string, id: string) => {
    await navigator.clipboard.writeText(markdown);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const examples: TableExample[] = [
    {
      id: 'basic',
      title: '基础表格',
      description: '最简单的表格，使用 | 分隔列，- 分隔表头',
      markdown: `| 姓名 | 年龄 | 城市 |
|------|------|------|
| 张三 | 25 | 北京 |
| 李四 | 30 | 上海 |`,
      render: (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2">姓名</th>
              <th className="border border-gray-300 px-4 py-2">年龄</th>
              <th className="border border-gray-300 px-4 py-2">城市</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-4 py-2">张三</td>
              <td className="border border-gray-300 px-4 py-2">25</td>
              <td className="border border-gray-300 px-4 py-2">北京</td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-2">李四</td>
              <td className="border border-gray-300 px-4 py-2">30</td>
              <td className="border border-gray-300 px-4 py-2">上海</td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      id: 'alignment',
      title: '对齐方式',
      description: '使用 : 控制对齐：左对齐 :---，居中 :---:，右对齐 ---:',
      markdown: `| 左对齐 | 居中对齐 | 右对齐 |
|:-------|:--------:|-------:|
| 内容   |   内容   |   内容 |
| 左     |   中     |     右 |`,
      render: (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-left">左对齐</th>
              <th className="border border-gray-300 px-4 py-2 text-center">居中对齐</th>
              <th className="border border-gray-300 px-4 py-2 text-right">右对齐</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-left">内容</td>
              <td className="border border-gray-300 px-4 py-2 text-center">内容</td>
              <td className="border border-gray-300 px-4 py-2 text-right">内容</td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-left">左</td>
              <td className="border border-gray-300 px-4 py-2 text-center">中</td>
              <td className="border border-gray-300 px-4 py-2 text-right">右</td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      id: 'formatting',
      title: '格式化内容',
      description: '表格单元格支持 **粗体**、*斜体*、`代码`、[链接](#) 等格式',
      markdown: `| 类型 | 语法 | 效果 |
|------|------|------|
| 粗体 | \`**文本**\` | **文本** |
| 斜体 | \`*文本*\` | *文本* |
| 代码 | \`\\\`代码\\\`\` | \`代码\` |
| 链接 | \`[文字](url)\` | [链接](#) |`,
      render: (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2">类型</th>
              <th className="border border-gray-300 px-4 py-2">语法</th>
              <th className="border border-gray-300 px-4 py-2">效果</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-4 py-2">粗体</td>
              <td className="border border-gray-300 px-4 py-2 font-mono text-sm">**文本**</td>
              <td className="border border-gray-300 px-4 py-2 font-bold">文本</td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-2">斜体</td>
              <td className="border border-gray-300 px-4 py-2 font-mono text-sm">*文本*</td>
              <td className="border border-gray-300 px-4 py-2 italic">文本</td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-2">代码</td>
              <td className="border border-gray-300 px-4 py-2 font-mono text-sm">\`代码\`</td>
              <td className="border border-gray-300 px-4 py-2"><code className="bg-gray-200 px-1 rounded">代码</code></td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-2">链接</td>
              <td className="border border-gray-300 px-4 py-2 font-mono text-sm">[文字](url)</td>
              <td className="border border-gray-300 px-4 py-2"><a href="#" className="text-blue-600 hover:underline">链接</a></td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      id: 'complex',
      title: '复杂表格',
      description: '支持多行内容、列表、换行等复杂排版',
      markdown: `| 功能 | 说明 | 示例 |
|------|------|------|
| 列表 | 单元格内可使用列表 | • 项目一<br>• 项目二 |
| 换行 | 使用 <br> 换行 | 第一行<br>第二行 |
| 图片 | 使用 ![alt](url) | ![图](https://via.placeholder.com/50) |`,
      render: (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2">功能</th>
              <th className="border border-gray-300 px-4 py-2">说明</th>
              <th className="border border-gray-300 px-4 py-2">示例</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-4 py-2">列表</td>
              <td className="border border-gray-300 px-4 py-2">单元格内可使用列表</td>
              <td className="border border-gray-300 px-4 py-2">
                <ul className="list-disc list-inside">
                  <li>项目一</li>
                  <li>项目二</li>
                </ul>
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-2">换行</td>
              <td className="border border-gray-300 px-4 py-2">使用 br 标签换行</td>
              <td className="border border-gray-300 px-4 py-2">
                <div>第一行</div>
                <div>第二行</div>
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-2">图片</td>
              <td className="border border-gray-300 px-4 py-2">使用标准图片语法</td>
              <td className="border border-gray-300 px-4 py-2">
                <img src="https://via.placeholder.com/50" alt="示例" className="w-12 h-12 rounded" />
              </td>
            </tr>
          </tbody>
        </table>
      )
    },
    {
      id: 'data',
      title: '数据表格',
      description: '适合展示结构化数据，如价格对比、参数规格等',
      markdown: `| 套餐 | 月费 | 存储 | 功能 |
|:-----|-----:|:----:|:-----|
| 基础版 | ¥9 | 1GB | 基础功能 |
| 专业版 | ¥29 | 10GB | 全部功能 |
| 企业版 | ¥99 | 无限 | 定制支持 |`,
      render: (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-left">套餐</th>
              <th className="border border-gray-300 px-4 py-2 text-right">月费</th>
              <th className="border border-gray-300 px-4 py-2 text-center">存储</th>
              <th className="border border-gray-300 px-4 py-2 text-left">功能</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-gray-50">
              <td className="border border-gray-300 px-4 py-2 font-medium">基础版</td>
              <td className="border border-gray-300 px-4 py-2 text-right">¥9</td>
              <td className="border border-gray-300 px-4 py-2 text-center">1GB</td>
              <td className="border border-gray-300 px-4 py-2">基础功能</td>
            </tr>
            <tr className="hover:bg-gray-50 bg-blue-50">
              <td className="border border-gray-300 px-4 py-2 font-medium">专业版</td>
              <td className="border border-gray-300 px-4 py-2 text-right text-blue-600 font-semibold">¥29</td>
              <td className="border border-gray-300 px-4 py-2 text-center">10GB</td>
              <td className="border border-gray-300 px-4 py-2">全部功能</td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="border border-gray-300 px-4 py-2 font-medium">企业版</td>
              <td className="border border-gray-300 px-4 py-2 text-right">¥99</td>
              <td className="border border-gray-300 px-4 py-2 text-center">无限</td>
              <td className="border border-gray-300 px-4 py-2">定制支持</td>
            </tr>
          </tbody>
        </table>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-600">{description}</p>
        </div>

        <div className="grid gap-6">
          {examples.map((example) => (
            <div key={example.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Table2 className="w-5 h-5 text-gray-500" />
                  <div>
                    <h3 className="font-semibold text-gray-900">{example.title}</h3>
                    <p className="text-sm text-gray-500">{example.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(example.markdown, example.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                >
                  {copiedId === example.id ? (
                    <>
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-green-600">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-600">复制源码</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-4">
                <div className="mb-4 p-3 bg-gray-100 rounded font-mono text-sm whitespace-pre-wrap text-gray-700">
                  {example.markdown}
                </div>
                <div className="overflow-x-auto">
                  {example.render}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <List className="w-4 h-4" />
            Markdown 表格语法速查
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <AlignLeft className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
              <div>
                <code className="bg-blue-100 px-1 rounded">:---</code>
                <span className="text-blue-800 ml-1">左对齐</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <AlignCenter className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
              <div>
                <code className="bg-blue-100 px-1 rounded">:---:</code>
                <span className="text-blue-800 ml-1">居中对齐</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <AlignRight className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
              <div>
                <code className="bg-blue-100 px-1 rounded">---:</code>
                <span className="text-blue-800 ml-1">右对齐</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
