declare namespace chrome {
  namespace runtime {
    interface Port { name: string; postMessage(message: unknown): void; disconnect(): void; onMessage: Event<(message: any) => void>; onDisconnect: Event<() => void>; }
    interface Event<T extends (...args: any[]) => void> { addListener(callback: T): void; }
    const onConnect: Event<(port: Port) => void>;
    const onMessage: Event<(message: any, sender: any, sendResponse: (response?: any) => void) => boolean | void>;
    const lastError: { message: string } | undefined;
    function connect(options: { name: string }): Port;
    function sendMessage(message: unknown): Promise<any>;
    function getURL(path: string): string;
  }
  namespace storage {
    const session: { get(keys?: string | string[] | object): Promise<Record<string, any>>; set(items: Record<string, any>): Promise<void>; remove(keys: string | string[]): Promise<void> };
    const local: { get(keys?: string | string[] | object): Promise<Record<string, any>>; set(items: Record<string, any>): Promise<void>; remove(keys: string | string[]): Promise<void> };
  }
  namespace tabs {
    interface Tab { id?: number; windowId?: number; url?: string; title?: string; active?: boolean; }
    function query(queryInfo: object): Promise<Tab[]>;
    function captureVisibleTab(windowId?: number, options?: { format?: "png" | "jpeg" }): Promise<string>;
  }
  namespace permissions {
    function contains(permission: { origins?: string[] }): Promise<boolean>;
    function request(permission: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
  }
  namespace scripting {
    function executeScript(details: { target: { tabId: number; allFrames?: boolean }; files: string[]; world?: "MAIN" | "ISOLATED"; injectImmediately?: boolean }): Promise<unknown>;
  }
  namespace offscreen {
    function hasDocument(): Promise<boolean>;
    function createDocument(details: { url: string; reasons: string[]; justification: string }): Promise<void>;
    function closeDocument(): Promise<void>;
  }
  namespace downloads {
    function download(options: { url: string; filename?: string; saveAs?: boolean }): Promise<number>;
  }
}

interface Window {
  singlefile?: SingleFileApi;
}

declare const singlefile: SingleFileApi;

interface SingleFileApi {
  init(options: { fetch?: typeof fetch }): void;
  getPageData(options: Record<string, unknown>): Promise<{ content: string | Uint8Array; title?: string; filename?: string }>;
}
