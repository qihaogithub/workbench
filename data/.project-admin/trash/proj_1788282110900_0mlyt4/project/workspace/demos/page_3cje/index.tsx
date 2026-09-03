import React from 'react';

export default function BackfillApplyPlain(props: { popupImage: string }) {
  const { popupImage } = props;
  return <main className="min-h-screen bg-white"><img src={popupImage} alt="弹窗图片" /></main>;
}
