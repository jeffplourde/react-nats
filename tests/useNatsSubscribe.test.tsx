import React, { useState } from 'react';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderHook, act, waitFor, render, screen } from '@testing-library/react';
import type { StartedTestContainer } from 'testcontainers';
import { createTestWrapper, useNatsConnection, getWebSocketUrl, startNatsWithWebSocket } from './helpers';
import { useNatsSubscribe } from '../src/useNatsSubscribe';
import { NatsProvider } from '../src/NatsProvider';

const enc = new TextEncoder();

describe('useNatsSubscribe', () => {
  let natsContainer: StartedTestContainer;
  let connectionUrl: string;

  beforeAll(async () => {
    natsContainer = await startNatsWithWebSocket();
    connectionUrl = getWebSocketUrl(natsContainer);
  }, 60000);

  afterAll(async () => {
    await natsContainer.stop();
  });

  it('should start with empty messages', async () => {
    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(() => useNatsSubscribe({ subject: 'test.subscribe.empty' }), { wrapper });
    expect(result.current.messages).toEqual([]);
  });

  it('should not subscribe when subject is null', async () => {
    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => ({
        conn: useNatsConnection(),
        sub: useNatsSubscribe<unknown>({ subject: null }),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.conn).not.toBeNull(), { timeout: 5000 });

    // Publish to a subject that would match if we were subscribed
    result.current.conn!.publish('test.subscribe.null', enc.encode(JSON.stringify({ x: 1 })));

    // Wait a tick to ensure no messages arrive
    await new Promise(r => setTimeout(r, 200));
    expect(result.current.sub.messages).toEqual([]);
  });

  it('should accumulate messages on a subscribed subject', async () => {
    const wrapper = createTestWrapper(connectionUrl);
    const subject = 'test.subscribe.accumulate';

    const { result } = renderHook(
      () => ({
        conn: useNatsConnection(),
        sub: useNatsSubscribe<{ n: number }>({ subject }),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.conn).not.toBeNull(), { timeout: 5000 });

    // Small delay to allow subscription to be established
    await new Promise(r => setTimeout(r, 100));

    act(() => {
      result.current.conn!.publish(subject, enc.encode(JSON.stringify({ n: 1 })));
      result.current.conn!.publish(subject, enc.encode(JSON.stringify({ n: 2 })));
    });

    await waitFor(() => expect(result.current.sub.messages).toHaveLength(2), { timeout: 5000 });

    expect(result.current.sub.messages[0]).toEqual({ n: 1 });
    expect(result.current.sub.messages[1]).toEqual({ n: 2 });
  });

  it('should clear messages when clear() is called', async () => {
    const wrapper = createTestWrapper(connectionUrl);
    const subject = 'test.subscribe.clear';

    const { result } = renderHook(
      () => ({
        conn: useNatsConnection(),
        sub: useNatsSubscribe<{ v: string }>({ subject }),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.conn).not.toBeNull(), { timeout: 5000 });
    await new Promise(r => setTimeout(r, 100));

    act(() => {
      result.current.conn!.publish(subject, enc.encode(JSON.stringify({ v: 'hello' })));
    });

    await waitFor(() => expect(result.current.sub.messages).toHaveLength(1), { timeout: 5000 });

    act(() => result.current.sub.clear());

    expect(result.current.sub.messages).toEqual([]);
  });

  it('should clear and resubscribe when subject changes', async () => {
    // Use a stable options ref to prevent NatsProvider from reconnecting on rerender.
    const stableOptions = { name: 'test-client-change' };
    let setSubjectExternal: (s: string) => void;
    let connRef: ReturnType<typeof useNatsConnection> = null;

    function Inner() {
      const [subject, setSubject] = useState('test.subscribe.change.a');
      setSubjectExternal = setSubject;
      const conn = useNatsConnection();
      connRef = conn;
      const { messages: msgs } = useNatsSubscribe<{ s: string }>({ subject });
      // expose messages via a data-testid for polling
      return <div data-testid="count">{msgs.length}</div>;
    }

    const { unmount } = render(
      <NatsProvider url={connectionUrl} options={stableOptions}>
        <Inner />
      </NatsProvider>
    );

    // Wait for connection
    await waitFor(() => expect(connRef).not.toBeNull(), { timeout: 5000 });
    await new Promise(r => setTimeout(r, 100));

    act(() => {
      connRef!.publish('test.subscribe.change.a', enc.encode(JSON.stringify({ s: 'a' })));
    });

    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'), { timeout: 5000 });

    // Switch subject — this re-renders Inner only, not NatsProvider
    act(() => setSubjectExternal('test.subscribe.change.b'));

    // Messages should be cleared
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'), { timeout: 5000 });
    await new Promise(r => setTimeout(r, 100));

    act(() => {
      connRef!.publish('test.subscribe.change.b', enc.encode(JSON.stringify({ s: 'b' })));
    });

    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'), { timeout: 5000 });

    unmount();
  });

  it('should use a custom decoder', async () => {
    const wrapper = createTestWrapper(connectionUrl);
    const subject = 'test.subscribe.decoder';
    const customDecoder = (data: Uint8Array) => new TextDecoder().decode(data).toUpperCase();

    const { result } = renderHook(
      () => ({
        conn: useNatsConnection(),
        sub: useNatsSubscribe<string>({ subject, decoder: customDecoder }),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.conn).not.toBeNull(), { timeout: 5000 });
    await new Promise(r => setTimeout(r, 100));

    act(() => {
      result.current.conn!.publish(subject, enc.encode('hello'));
    });

    await waitFor(() => expect(result.current.sub.messages).toHaveLength(1), { timeout: 5000 });
    expect(result.current.sub.messages[0]).toBe('HELLO');
  });

  it('should support queue group option', async () => {
    const wrapper = createTestWrapper(connectionUrl);
    const subject = 'test.subscribe.queue';

    const { result } = renderHook(
      () => ({
        conn: useNatsConnection(),
        sub: useNatsSubscribe<{ q: number }>({ subject, queue: 'workers' }),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.conn).not.toBeNull(), { timeout: 5000 });
    await new Promise(r => setTimeout(r, 100));

    act(() => {
      result.current.conn!.publish(subject, enc.encode(JSON.stringify({ q: 42 })));
    });

    await waitFor(() => expect(result.current.sub.messages).toHaveLength(1), { timeout: 5000 });
    expect(result.current.sub.messages[0]).toEqual({ q: 42 });
  });

  it('should unsubscribe on unmount without errors', async () => {
    const wrapper = createTestWrapper(connectionUrl);
    const subject = 'test.subscribe.unmount';

    const { result, unmount } = renderHook(
      () => ({
        conn: useNatsConnection(),
        sub: useNatsSubscribe({ subject }),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.conn).not.toBeNull(), { timeout: 5000 });
    await new Promise(r => setTimeout(r, 100));

    // Unmounting should not throw
    expect(() => unmount()).not.toThrow();
  });
});
