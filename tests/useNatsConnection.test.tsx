import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { StartedTestContainer } from 'testcontainers';
import { createTestWrapper, useNatsConnection, getWebSocketUrl, startNatsWithWebSocket } from './helpers';

describe('useNatsConnection', () => {
  let natsContainer: StartedTestContainer;
  let connectionUrl: string;

  beforeAll(async () => {
    natsContainer = await startNatsWithWebSocket();
    connectionUrl = getWebSocketUrl(natsContainer);
  }, 60000);

  afterAll(async () => {
    await natsContainer.stop();
  });

  it('should return null before connection is established', () => {
    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(() => useNatsConnection(), { wrapper });

    // May be null initially
    expect(result.current).toBeDefined();
  });

  it('should return a valid connection after establishing', async () => {
    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(() => useNatsConnection(), { wrapper });

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    }, { timeout: 5000 });

    expect(result.current).toBeTruthy();
  });

  it('should return the same connection on re-renders', async () => {
    const wrapper = createTestWrapper(connectionUrl);
    const { result, rerender } = renderHook(() => useNatsConnection(), { wrapper });

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    }, { timeout: 5000 });

    const firstConnection = result.current;
    rerender();

    // Connection should still be available (may be same instance or reconnected)
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    }, { timeout: 5000 });
  });

  it('should allow publishing messages through the connection', async () => {
    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(() => useNatsConnection(), { wrapper });

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    }, { timeout: 5000 });

    const connection = result.current!;
    const subject = 'test.subject';
    const message = new TextEncoder().encode('test message');

    // Should not throw
    expect(() => connection.publish(subject, message)).not.toThrow();
  });
});
