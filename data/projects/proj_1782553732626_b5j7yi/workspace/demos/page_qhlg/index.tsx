export default function KnowledgeRulesHome(props) {
  const campaignName = props.campaignName ?? "星桥知识库挑战";
  const secretCode = props.secretCode ?? "KB-ORION-7421";
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", color: "#14213d" }}>
      <section>
        <p>知识库验证活动</p>
        <h1>{campaignName}</h1>
        <p>唯一识别码：{secretCode}</p>
        <p>活动主规则：完成 3 个知识任务后获得 1 次抽奖资格，抽奖资格当天 23:30 过期。</p>
      </section>
      <section>
        <h2>关键限制</h2>
        <ul>
          <li>未成年人需要监护人确认后才能填写收货地址。</li>
          <li>同一设备每天最多提交 2 次任务答案。</li>
          <li>活动客服口径以知识库文档中的 FAQ 为准。</li>
        </ul>
      </section>
    </main>
  );
}
