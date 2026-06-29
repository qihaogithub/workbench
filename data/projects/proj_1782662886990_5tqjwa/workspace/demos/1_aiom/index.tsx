import React from 'react';

type Props = {
  sharedTitle?: string;
  pageTitle?: string;
  pageCta?: string;
};

export default function ConfigRegressionPage(props: Props) {
  return (
    <main style={{ minHeight: '100vh', padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>{props.sharedTitle ?? 'missing-shared-e2e'}</h1>
      <p data-testid="page-label">page-one-runtime-e2e</p>
      <p>{props.pageTitle ?? 'missing-page-title-e2e'}</p>
      <button type="button">{props.pageCta ?? 'missing-page-cta-e2e'}</button>
    </main>
  );
}