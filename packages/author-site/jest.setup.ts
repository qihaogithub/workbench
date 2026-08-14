import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'node:util';
import { ReadableStream, TransformStream } from 'node:stream/web';

// Next 15's Request/Response implementation reads these Web APIs during route
// module evaluation. Jest's jsdom environment does not expose Node's globals.
Object.assign(globalThis, {
  TextDecoder,
  TextEncoder,
  ReadableStream,
  TransformStream,
});

// undici reads TextEncoder while loading, so it must be required after the
// Node Web primitives above have been installed.
const { Headers, Request, Response, fetch, FormData, File } = require('undici');
Object.assign(globalThis, { Headers, Request, Response, fetch, FormData, File });

// Mock ResizeObserver for Radix UI components
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock;
