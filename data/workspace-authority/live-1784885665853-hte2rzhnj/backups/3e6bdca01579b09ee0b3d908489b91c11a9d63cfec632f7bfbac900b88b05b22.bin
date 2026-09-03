import React from 'react';

interface DemoProps {}

const SUBJECTS = [
  { key: 'reading', label: '阅读', color: '#4f8ef7' },
  { key: 'thinking', label: '思维', color: '#8b5cf6' },
  { key: 'aesthetic', label: '美育', color: '#f472b6' },
  { key: 'english', label: '英语', color: '#10b981' },
  { key: 'writer', label: '小作家', color: '#f59e0b' },
];

function cap(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function PadHeaderPreview(props: DemoProps) {
  const p = props as Record<string, unknown>;
  const subject = (p.activeSubject as string) || 'reading';

  const current = SUBJECTS.find((s) => s.key === subject) || SUBJECTS[0];
  const bg = (p[`padHeaderBg${cap(current.key)}`] as string) || '';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#eef1f6] px-8 py-7">
      {/* Pad 模型 */}
      <div className="w-full max-w-[880px] rounded-[28px] border-[8px] border-slate-800 bg-white shadow-xl">
        {/* 状态栏 */}
        <div className="relative flex h-7 items-center justify-center rounded-t-[20px] bg-slate-800">
          <div className="h-1.5 w-28 rounded-full bg-slate-700" />
        </div>

        {/* 头图区域 */}
        <div className="relative mx-2 mt-2 aspect-[2732/540] overflow-hidden rounded-xl">
          {bg ? (
            <img src={bg} alt={`${current.label}Pad头图`} className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${current.color}2e, ${current.color}12)` }}
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold"
                style={{ backgroundColor: `${current.color}26`, color: current.color }}
              >
                {current.label.charAt(0)}
              </div>
              <p className="text-sm" style={{ color: current.color }}>
                未上传头图
              </p>
            </div>
          )}
        </div>

        {/* 模拟页面内容（宽屏布局） */}
        <div className="flex flex-col gap-3 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="h-4 w-44 rounded bg-slate-200" />
            <div className="flex gap-2">
              <div className="h-3 w-12 rounded bg-slate-100" />
              <div className="h-3 w-12 rounded bg-slate-100" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
          </div>
          <div className="h-2.5 w-full rounded bg-slate-100" />
          <div className="h-2.5 w-3/4 rounded bg-slate-100" />
        </div>
      </div>

      {/* 底部提示 */}
      <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
        在右侧配置面板切换「当前科目」，并上传对应科目的 Pad 头图，即可实时预览效果
      </p>
    </div>
  );
}
