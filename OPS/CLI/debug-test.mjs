// 调试脚本 - 直接测试 API
const url = "http://localhost:3101/api/agent/debug-session/message";

const body = {
  content: "你好,请回复我",
  options: {
    timeout: 30000,
    stream: false,
  },
};

console.log("发送请求到:", url);
console.log("请求体:", JSON.stringify(body, null, 2));

fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
})
  .then(async (response) => {
    console.log("\nHTTP 状态:", response.status);
    console.log("响应头:", Object.fromEntries(response.headers.entries()));

    const data = await response.json();
    console.log("\n响应体:");
    console.log(JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error("\n❌ 请求失败");
      process.exit(1);
    } else {
      console.log("\n✅ 请求成功");
      console.log("\n完整响应:");
      console.log(JSON.stringify(data, null, 2));

      if (data.data?.content) {
        console.log("\nAI 回复:");
        console.log(data.data.content);
      } else {
        console.log("\n⚠️  没有内容回复");
      }
    }
  })
  .catch((error) => {
    console.error("\n❌ 网络错误:");
    console.error(error);
    process.exit(1);
  });
