import React, { useState } from 'react';

interface DemoProps {
  title: string;
  description: string;
  primaryColor?: string;
  showLabels?: boolean;
}

export default function Demo({ title, description, primaryColor = '#4F46E5', showLabels = true }: DemoProps) {
  const [inputValue, setInputValue] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [textareaValue, setTextareaValue] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const options = ['选项一', '选项二', '选项三'];
  const tags = ['基础', '高级', '实验性', '已废弃'];

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="mb-10 text-center">
          <div 
            className="inline-block px-4 py-1.5 rounded-full text-sm font-medium text-white mb-4"
            style={{ backgroundColor: primaryColor }}
          >
            组件示例
          </div>
          <h1 className="text-4xl font-bold text-slate-800 mb-3">{title}</h1>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">{description}</p>
        </div>

        {/* 表单控件网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 文本输入框 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor + '20' }}>
                <svg className="w-5 h-5" style={{ color: primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-700">文本输入</h3>
            </div>
            {showLabels && <label className="block text-sm font-medium text-slate-600 mb-2">用户名</label>}
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="请输入内容..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 transition-all"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            />
          </div>

          {/* 下拉选择 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor + '20' }}>
                <svg className="w-5 h-5" style={{ color: primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-700">下拉选择</h3>
            </div>
            {showLabels && <label className="block text-sm font-medium text-slate-600 mb-2">选择类型</label>}
            <select
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 bg-white appearance-none cursor-pointer"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            >
              <option value="">请选择...</option>
              {options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* 开关 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor + '20' }}>
                <svg className="w-5 h-5" style={{ color: primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-700">开关控件</h3>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">{isEnabled ? '已启用' : '已禁用'}</span>
              <button
                onClick={() => setIsEnabled(!isEnabled)}
                className="relative w-14 h-8 rounded-full transition-colors duration-300"
                style={{ backgroundColor: isEnabled ? primaryColor : '#94a3b8' }}
              >
                <span 
                  className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300"
                  style={{ transform: isEnabled ? 'translateX(30px)' : 'translateX(4px)' }}
                />
              </button>
            </div>
          </div>

          {/* 多选标签 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor + '20' }}>
                <svg className="w-5 h-5" style={{ color: primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-700">标签选择</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: selectedTags.includes(tag) ? primaryColor : '#f1f5f9',
                    color: selectedTags.includes(tag) ? '#fff' : '#64748b'
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* 文本域 */}
        <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor + '20' }}>
              <svg className="w-5 h-5" style={{ color: primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-700">多行文本</h3>
          </div>
          {showLabels && <label className="block text-sm font-medium text-slate-600 mb-2">备注信息</label>}
          <textarea
            value={textareaValue}
            onChange={(e) => setTextareaValue(e.target.value)}
            placeholder="请输入备注..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 resize-none transition-all"
            style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
          />
        </div>

        {/* 操作按钮 */}
        <div className="mt-8 flex justify-center gap-4">
          <button 
            className="px-6 py-3 rounded-xl font-medium text-white transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95 shadow-lg"
            style={{ backgroundColor: primaryColor }}
          >
            提交表单
          </button>
          <button 
            className="px-6 py-3 rounded-xl font-medium border-2 transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ 
              borderColor: primaryColor, 
              color: primaryColor,
              backgroundColor: 'transparent'
            }}
          >
            重置
          </button>
        </div>

        {/* 页脚 */}
        <div className="mt-12 text-center text-slate-400 text-sm">
          表单控件合集 · 演示页面
        </div>
      </div>
    </div>
  );
}