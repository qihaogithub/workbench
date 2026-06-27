export default function TaskPage(props) {
  const taskTitle = props.taskTitle ?? "三步任务说明";
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", background: "#f7f9fb" }}>
      <h1>{taskTitle}</h1>
      <ol>
        <li>阅读活动规则并记住口令「青石计划」。</li>
        <li>完成 3 道问答题，每题至少停留 8 秒。</li>
        <li>分享海报后可额外获得 20 星币，但不增加抽奖次数。</li>
      </ol>
      <p>任务页需要显示进度条、剩余提交次数和口令校验提示。</p>
    </main>
  );
}
