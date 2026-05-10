declare module 'playwright' {
  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }

  export interface Page {
    setViewportSize(size: { width: number; height: number }): Promise<void>;
    setContent(html: string, options?: { waitUntil?: string }): Promise<void>;
    waitForTimeout(ms: number): Promise<void>;
    screenshot(options: {
      path: string;
      fullPage?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
    }): Promise<Buffer>;
  }

  export const chromium: {
    launch(options: { headless: boolean }): Promise<Browser>;
  };
}
