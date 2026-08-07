export function stripExpiredImageParts(messages: any[]): any[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx <= 0) return messages;

  return messages.map((msg, i) => {
    if (i >= lastUserIdx) return msg;

    const content = msg.content;
    if (!Array.isArray(content)) return msg;
    if (!content.some((part: any) => part?.type === "image")) return msg;

    return {
      ...msg,
      content: content.filter((part: any) => part.type !== "image"),
    };
  });
}
