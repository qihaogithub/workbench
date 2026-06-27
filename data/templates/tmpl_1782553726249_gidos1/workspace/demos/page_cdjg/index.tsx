export default function RewardPage(props) {
  const deadline = props.addressDeadline ?? "中奖后 72 小时内";
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", color: "#1b4332" }}>
      <h1>中奖与履约说明</h1>
      <p>奖品池包含星币、实体徽章和季度会员券。</p>
      <p>地址填写时限：{deadline}。</p>
      <p>如果用户未在时限内提交地址，奖品状态标记为 EXPIRED_ADDRESS_MISSING。</p>
      <p>客服补发入口只对状态 MANUAL_REISSUE_REQUIRED 开放。</p>
    </main>
  );
}
