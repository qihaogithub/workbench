interface DemoProps {
  displayImage: string;
  backgroundColor: string;
}

export default function Demo({
  displayImage = "../../images/display-bg.png",
  backgroundColor = "#000000",
}: DemoProps) {
  // 对图片路径中的特殊字符进行编码（如 # 在 URL 中会被解析为片段标识符）
  const imageSrc = displayImage.replace(/#/g, "%23");

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor, width: 375, height: 812 }}
    >
      <img
        src={imageSrc}
        alt="全屏展示"
        className="w-full h-full object-cover"
        style={{ width: 375, height: 812 }}
      />
    </div>
  );
}
