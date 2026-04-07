import '@testing-library/jest-dom';

// Mock ResizeObserver for Radix UI components
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock;
