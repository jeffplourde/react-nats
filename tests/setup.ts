import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import WebSocket from 'ws';

// Inject Node.js WebSocket implementation for real network connections
if (typeof global.WebSocket === 'undefined') {
  (global as any).WebSocket = WebSocket;
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});
