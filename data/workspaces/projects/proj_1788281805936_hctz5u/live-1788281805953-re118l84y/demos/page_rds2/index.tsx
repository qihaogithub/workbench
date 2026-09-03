import React from 'react';

export default function BackfillApplyPlain({ popupImage }: { popupImage: string }) {
  return <main className="min-h-screen bg-white"><img src={popupImage} alt="弹窗图片" /></main>;
}
