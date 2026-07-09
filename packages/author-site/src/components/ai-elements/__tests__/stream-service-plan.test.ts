import { StreamService } from "../chat/services/stream-service";

describe("StreamService plan event", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

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

  it("stream done 事件会触发完成回调并关闭流", () => {
    const service = new StreamService() as any;
    const handlers = new Map<string, (event: any) => void>();
    const onStream = jest.fn();
    const onFinish = jest.fn();
    const close = jest.fn();

    service.currentSessionId = "session-1";
    service.stream = {
      on: (event: string, handler: (event: any) => void) => {
        handlers.set(event, handler);
      },
      close,
    };
    service.handlers = { onStream, onFinish };

    service.setupEventHandlers();
    handlers.get("stream")?.({
      type: "stream",
      content: "完成内容",
      done: true,
      files: [{ path: "index.tsx", action: "modified" }],
    });

    expect(onStream).toHaveBeenCalledWith("完成内容");
    expect(onFinish).toHaveBeenCalledWith({
      content: "完成内容",
      files: [{ path: "index.tsx", action: "modified" }],
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("stream done 和 finish 同时到达时只触发一次完成回调", () => {
    const service = new StreamService() as any;
    const handlers = new Map<string, (event: any) => void>();
    const onFinish = jest.fn();
    const close = jest.fn();

    service.currentSessionId = "session-1";
    service.stream = {
      on: (event: string, handler: (event: any) => void) => {
        handlers.set(event, handler);
      },
      close,
    };
    service.handlers = { onFinish };

    service.setupEventHandlers();
    handlers.get("stream")?.({
      type: "stream",
      content: "",
      done: true,
    });
    handlers.get("finish")?.({
      type: "finish",
      content: "最终内容",
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("ready 状态会在 finish 丢失时兜底触发完成回调", () => {
    jest.useFakeTimers();
    const service = new StreamService() as any;
    const handlers = new Map<string, (event: any) => void>();
    const onFinish = jest.fn();
    const close = jest.fn();

    service.currentSessionId = "session-1";
    service.messageInFlight = true;
    service.stream = {
      on: (event: string, handler: (event: any) => void) => {
        handlers.set(event, handler);
      },
      close,
    };
    service.handlers = { onFinish };

    service.setupEventHandlers();
    handlers.get("status")?.({
      type: "status",
      status: "ready",
    });

    jest.advanceTimersByTime(999);
    expect(onFinish).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onFinish).toHaveBeenCalledWith({ content: "" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("finish 正常到达时会取消 ready 兜底完成", () => {
    jest.useFakeTimers();
    const service = new StreamService() as any;
    const handlers = new Map<string, (event: any) => void>();
    const onFinish = jest.fn();
    const close = jest.fn();

    service.currentSessionId = "session-1";
    service.messageInFlight = true;
    service.stream = {
      on: (event: string, handler: (event: any) => void) => {
        handlers.set(event, handler);
      },
      close,
    };
    service.handlers = { onFinish };

    service.setupEventHandlers();
    handlers.get("status")?.({
      type: "status",
      status: "ready",
    });
    handlers.get("finish")?.({
      type: "finish",
      content: "最终内容",
    });
    jest.advanceTimersByTime(1000);

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith({
      content: "最终内容",
      files: undefined,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
