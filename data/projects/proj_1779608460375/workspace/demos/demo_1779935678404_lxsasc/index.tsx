import React from 'react';

interface Props {}

export default function FigmaComponent(props: Props) {
  // 项目级共享配置（由 PreviewPanel 运行时注入）
  const {
    inviteColor1 = '#FF6B35',
    inviteColor2 = '#F7C59F',
    mallColor1 = '#004E89',
    mallColor2 = '#1A659E',
  } = props as Record<string, unknown>;
  return (
<>
    <div className="w-[1133px] h-[1120px] relative bg-[#ffffff] overflow-hidden" data-figma-id="153:125523">
      <img src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_e545eaf5.png" alt="static layer" className="left-[177px] top-[20px] absolute object-cover" data-figma-id="153:157469" style={{ width: 780, height: 527 }} />
      <div className="w-[780px] left-[177px] top-[587.25px] absolute inline-flex flex-col justify-start items-start gap-5" data-figma-id="153:125585">
        <div className="w-[780px] h-[34px] shrink-0 px-1 inline-flex justify-between items-center" data-figma-id="153:164881">
          <div className="shrink-0 justify-start text-[#666666] text-[22.50px] font-medium font-sans leading-[33.75px] whitespace-nowrap" data-figma-id="153:164882">邀友得奖</div>
          <div className="shrink-0 flex justify-end items-center" data-figma-id="153:164883">
            <div className="shrink-0 text-right justify-center text-[#b2b2b2] text-lg font-normal font-sans leading-[27px] whitespace-nowrap" data-figma-id="153:164884">邀请奖励记录</div>
            <div className="w-4 h-4 shrink-0 relative origin-top-left rotate-180" data-figma-id="153:164891">
              <img className="left-[11px] top-[14px] absolute w-[6.17px] h-3 origin-top-left rotate-180" data-figma-id="153:164895" src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_2e4a9690.svg" />
            </div>
          </div>
        </div>
        <div className="self-stretch shrink-0 inline-flex justify-start items-center gap-2.5" data-figma-id="153:164868">
          <div data-slot-type="color" id="色值1" data-figma-id="153:164869" style={{ width: 385, height: 80 }}></div>
          <div data-slot-type="color" id="色值2" data-figma-id="153:164871" style={{ width: 385, height: 77.50 }}></div>
        </div>
      </div>
      <div className="w-[780px] left-[177px] top-[761.25px] absolute inline-flex flex-col justify-start items-start gap-5" data-figma-id="153:125594">
        <div className="self-stretch shrink-0 inline-flex justify-start items-end gap-2.5" data-figma-id="153:125595">
          <div className="grow basis-0 px-1 flex justify-between items-center" data-figma-id="I153:125595;6092:35344">
            <div className="shrink-0 justify-start text-[#666666] text-[22.50px] font-medium font-sans leading-[33.75px] whitespace-nowrap" data-figma-id="I153:125595;6092:35345">叫叫商城</div>
            <div className="shrink-0 opacity-0 flex justify-end items-center" data-figma-id="I153:125595;6092:35346">
              <div className="shrink-0 text-right justify-center text-[#b2b2b2] text-lg font-normal font-sans leading-[27px] whitespace-nowrap" data-figma-id="I153:125595;6092:35347">邀请奖励记录</div>
              <div className="w-4 h-4 shrink-0 relative origin-top-left rotate-180" data-figma-id="I153:125595;6092:35348">
                <div className="w-[6.17px] h-3 left-[11px] top-[14px] absolute origin-top-left rotate-180 bg-[#acb2bb]" data-figma-id="I153:125595;6092:35348;354:288" />
                <div className="w-4 h-4 left-0 top-0 absolute bg-[#000000]/0" data-figma-id="I153:125595;6092:35348;503:1980" />
              </div>
            </div>
          </div>
        </div>
        <div className="self-stretch shrink-0 inline-flex justify-start items-center gap-2.5" data-figma-id="153:164874">
          <div data-slot-type="color" id="色值3" data-figma-id="153:164875" style={{ width: 385, height: 80 }}></div>
          <div data-slot-type="color" id="色值4" data-figma-id="153:164877" style={{ width: 385, height: 77.50 }}></div>
        </div>
      </div>
      <div className="w-[780px] px-2.5 py-6 left-[177px] top-[915.25px] absolute inline-flex flex-col justify-end items-center gap-2.5" data-figma-id="153:125603">
        <img className="w-[156.98px] h-[39.85px] shrink-0" data-figma-id="153:164920" src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_e7e211e2.svg" />
      </div>
      <img src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_3b8dd1f6.png" alt="static layer" className="left-0 top-0 absolute object-cover" data-figma-id="153:125605" style={{ width: 1133, height: 20 }} />
      <img src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_684bdf65.png" alt="static layer" className="left-0 top-[1024px] absolute object-cover" data-figma-id="153:125606" style={{ width: 1133, height: 96 }} />
    </div>
  </>
  );
}