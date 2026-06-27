import React from 'react';

interface DemoProps {
  orbitTitle: string;
  centerCode: string;
  ringLabel: string;
}

export default function Demo({
  orbitTitle = '知识库圆形雷达',
  centerCode = 'KB-ORION-7421',
  ringLabel = '文档事实校准',
}: DemoProps) {
  return (
    <main className="flex h-full w-full items-center justify-center bg-[#f7faf8] p-4">
      <section className="relative flex h-[288px] w-[288px] flex-col items-center justify-center overflow-hidden rounded-full border border-emerald-900/20 bg-white text-center shadow-sm">
        <div className="absolute inset-5 rounded-full border border-dashed border-emerald-700/30" />
        <div className="absolute inset-12 rounded-full bg-emerald-50" />
        <div className="relative z-10 flex h-32 w-32 flex-col items-center justify-center rounded-full bg-emerald-900 px-5 text-white shadow">
          <span className="text-[11px] uppercase tracking-[0.18em] text-emerald-100">{ringLabel}</span>
          <strong className="mt-2 text-lg leading-tight">{centerCode}</strong>
        </div>
        <h1 className="relative z-10 mt-5 max-w-[210px] text-lg font-semibold text-slate-950">{orbitTitle}</h1>
        <p className="relative z-10 mt-1 max-w-[220px] text-xs leading-5 text-slate-600">
          页面用于验证非矩形预览、画布布局和知识库文档节点能否共同进入模板快照。
        </p>
      </section>
    </main>
  );
}
