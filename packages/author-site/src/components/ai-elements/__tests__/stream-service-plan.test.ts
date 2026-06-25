import { StreamService } from "../chat/services/stream-service";

describe("StreamService plan event", () => {
  it("接收当前会话的 plan 事件并转发内容", () => {
    const service = new StreamService() as any;
    const handlers = new Map<string, (event: any) => void>();
    const onPlan = jest.fn();

    service.currentSessionId = "session-1";
    service.stream = {
      on: (event: string, handler: (event: any) => void) => {
        handlers.set(event, handler);
      },
    };
    service.handlers = { onPlan };

    service.setupEventHandlers();
    handlers.get("plan")?.({
      type: "plan",
      content: '{"items":[]}',
    });

    expect(onPlan).toHaveBeenCalledWith('{"items":[]}');
  });

  it("忽略旧会话的 plan 事件", () => {
    const service = new StreamService() as any;
    const handlers = new Map<string, (event: any) => void>();
    const onPlan = jest.fn();

    service.currentSessionId = "session-1";
    service.stream = {
      on: (event: string, handler: (event: any) => void) => {
        handlers.set(event, handler);
      },
    };
    service.handlers = { onPlan };

    service.setupEventHandlers();
    service.currentSessionId = "session-2";
    handlers.get("plan")?.({
      type: "plan",
      content: '{"items":[]}',
    });

    expect(onPlan).not.toHaveBeenCalled();
  });
});
