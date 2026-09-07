const resizeCallbacks = new Set<ResizeObserverCallback>();

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {
    resizeCallbacks.add(this.callback);
  }
  unobserve() {
    resizeCallbacks.delete(this.callback);
  }
  disconnect() {
    resizeCallbacks.delete(this.callback);
  }
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

window.addEventListener("resize", () => {
  for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
});
