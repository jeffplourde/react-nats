import React from 'react';
import { NatsProvider } from '../src/NatsProvider';
import { NatsMessage } from '../src/types';
import type { NatsConnection } from '@nats-io/nats-core';

/**
 * Creates a test wrapper with NatsProvider configured for the given WebSocket URL
 */
export function createTestWrapper(url: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <NatsProvider url={url} options={{ name: 'test-client' }}>
        {children}
      </NatsProvider>
    );
  };
}

/**
 * Standard JSON decoder for tests
 */
export const decoder = {
  decode: (data: Uint8Array): unknown => {
    const text = new TextDecoder().decode(data);
    return JSON.parse(text);
  },
};

export const reducer = {
  reduce: (arr: NatsMessage<unknown>[], elem: NatsMessage<unknown>) => [...arr, elem]
}

/**
 * Wait for NATS connection to establish
 */
export async function waitForConnection(
  getCurrentValue: () => NatsConnection | null,
  timeoutMs = 5000
): Promise<NatsConnection> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const connection = getCurrentValue();
    if (connection) {
      return connection;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error('Timeout waiting for NATS connection');
}

// Re-export the actual hooks from the source for testing
export { useNatsConnection } from '../src/useNatsConnection';
export { useNatsKvTable } from '../src/useNatsKvTable';
export { useNatsStream } from '../src/useNatsStream';

import { GenericContainer } from 'testcontainers';
import * as path from 'path';
import { Wait } from 'testcontainers';

/**
 * NATS WebSocket port (8080 is common for WebSocket in NATS)
 */
export const NATS_WS_PORT = 8080;

/**
 * Get WebSocket URL from a started NATS container
 */
export function getWebSocketUrl(container: { getHost: () => string; getMappedPort: (port: number) => number }): string {
  const host = container.getHost();
  const port = container.getMappedPort(NATS_WS_PORT);
  return `ws://${host}:${port}`;
}

/**
 * Create a NATS container with WebSocket support
 */
export async function startNatsWithWebSocket() {
  const configPath = path.join(__dirname, 'nats-ws.conf');

  const container = await new GenericContainer('nats:2.10-alpine')
    .withCopyFilesToContainer([{
      source: configPath,
      target: '/etc/nats/nats.conf'
    }])
    .withCommand(['-c', '/etc/nats/nats.conf'])
    .withExposedPorts(4222, NATS_WS_PORT)
    .withWaitStrategy(Wait.forLogMessage(/Server is ready/))
    .withStartupTimeout(60000)
    .start();

  return container;
}
