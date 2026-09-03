interface DemoProps {}

export default function Demo(_props: DemoProps) {
  return (
    <div className="min-h-screen bg-[#f5f5f5] flex flex-col items-center p-5">
      <h1 className="text-[22px] font-bold text-[#1d1d1f] mb-5">头图背景预览</h1>
      <div className="flex bg-white rounded-xl p-2 mb-[30px] shadow-lg gap-[5px]">
        <span className="px-4 py-2 rounded-lg text-[13px] font-medium text-[#333] border-2 border-[#333]">阅读</span>
        <span className="px-4 py-2 rounded-lg text-[13px] font-medium text-[#666]">思维</span>
        <span className="px-4 py-2 rounded-lg text-[13px] font-medium text-[#666]">美育</span>
        <span className="px-4 py-2 rounded-lg text-[13px] font-medium text-[#666]">英语</span>
        <span className="px-4 py-2 rounded-lg text-[13px] font-medium text-[#666]">小作家</span>
      </div>
      <div className="w-[262.5px] h-[568.4px] relative">
        <div className="w-[375px] h-[812px] bg-white rounded-[20px] overflow-hidden shadow-lg origin-top-left scale-[0.7]">
          <div className="w-full h-[270px] relative flex items-center justify-center"
            style={{background: "linear-gradient(135deg, #667eea, #764ba2)"}}>
            <div className="absolute inset-0 bg-black/40" />
            <button className="relative bg-transparent text-white border-2 border-white px-4 py-2 rounded-[20px] text-[12px] backdrop-blur cursor-pointer font-sans">
              上传头部背景
            </button>
          </div>
          <div className="p-5 flex flex-col gap-[10px]">
            <div className="h-3 bg-[#f0f0f0] rounded-full w-full" />
            <div className="h-3 bg-[#f0f0f0] rounded-full w-3/5" />
          </div>
        </div>
      </div>
      <div className="mt-5 text-[14px] text-[#64748b]">阅读 - 点击上传头部背景</div>
    </div>
  );
}