interface DemoProps {}

export default function Demo(_props: DemoProps) {
  return (
    <div className="w-[375px] h-[812px] bg-[#FFEAA3] flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xl font-bold text-[#404040]">闯关活动</div>
        <div className="mt-4 text-[#B2B2B2]">React 页面加载成功</div>
      </div>
    </div>
  );
}
