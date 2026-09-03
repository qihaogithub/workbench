import React from 'react';

interface CoreFlowRegressionProps {
  title: string;
  description: string;
  enabled: boolean;
}

export default function CoreFlowRegression({
  title,
  description,
  enabled,
}: CoreFlowRegressionProps) {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-slate-950">
      <p className="text-sm font-medium text-emerald-700">core-flow-regression</p>
      <h1 className="mt-3 text-3xl font-bold">{title}</h1>
      <p className="mt-4 text-base text-slate-600">{description}</p>
      <span className="mt-6 inline-flex rounded-md bg-slate-950 px-3 py-2 text-sm text-white">
        {enabled ? '已启用' : '未启用'}
      </span>
    </main>
  );
}
