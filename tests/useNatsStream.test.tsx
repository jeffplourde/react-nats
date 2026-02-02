import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { StartedTestContainer } from 'testcontainers';
import { wsconnect } from '@nats-io/nats-core';
import { jetstream, jetstreamManager } from '@nats-io/jetstream';
import { NatsMessage } from '../src/types';
import { createTestWrapper, decoder, reducer, useNatsStream, getWebSocketUrl, startNatsWithWebSocket } from './helpers';
import { act } from 'react';

describe('useNatsStream', () => {
  let natsContainer: StartedTestContainer;
  let connectionUrl: string;
  let streamName: string;

  beforeAll(async () => {
    natsContainer = await startNatsWithWebSocket();
    connectionUrl = getWebSocketUrl(natsContainer);
  }, 60000);

  afterAll(async () => {
    await natsContainer.stop();
  });

  beforeEach(() => {
    // Unique stream name per test
    streamName = `test-stream-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  });

  it('should return empty array for stream with no messages', async () => {
    const opt_start_time = new Date(Date.now() - 60000); // 1 minute ago
    // Create stream
    const nc = await wsconnect({ servers: connectionUrl });
    const jsMgr = await jetstreamManager(nc);

    await jsMgr.streams.add({
      name: streamName,
    });

    await nc.close();
    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsStream({
        stream: streamName,
        decoder,
        reducer,
        opt_start_time,
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current).toEqual([]);
    }, { timeout: 5000 });
  });

  it('should consume messages from stream', async () => {
    // Setup: Create stream and publish messages
    const opt_start_time = new Date(Date.now() - 60000); // 1 minute ago
    const nc = await wsconnect({ servers: connectionUrl });
    const jsMgr = await jetstreamManager(nc);
    const js = jsMgr.jetstream();

    await jsMgr.streams.add({
      name: streamName,
      subjects: [`${streamName}.>`],
    });

    await js.publish(`${streamName}.test`, new TextEncoder().encode(JSON.stringify({ id: 1, msg: 'first' })));
    await js.publish(`${streamName}.test`, new TextEncoder().encode(JSON.stringify({ id: 2, msg: 'second' })));
    await nc.close();

    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsStream({
        stream: streamName,
        decoder,
        reducer,
        opt_start_time,
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.length).toBe(2);
    }, { timeout: 10000 });

    expect(result.current).toHaveLength(2);
    expect(result.current[0].value).toEqual({ id: 1, msg: 'first' });
    expect(result.current[1].value).toEqual({ id: 2, msg: 'second' });
    expect(result.current[0].subject).toBe(`${streamName}.test`);
  });

  it('should receive new messages published after subscription', async () => {
    // Setup: Create stream
    const opt_start_time = new Date(Date.now() - 60000); // 1 minute ago
    const nc = await wsconnect({ servers: connectionUrl });
    const jsMgr = await jetstreamManager(nc);
    const js = jsMgr.jetstream();

    await jsMgr.streams.add({
      name: streamName,
      subjects: [`${streamName}.>`],
    });
    await nc.close();

    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsStream({
        stream: streamName,
        decoder,
        reducer,
        opt_start_time,
      }),
      { wrapper }
    );

    await act( async () => {
      // Publish message after subscription
      const nc2 = await wsconnect({ servers: connectionUrl });
      const js2 = jetstream(nc2);
      await js2.publish(`${streamName}.test`, new TextEncoder().encode(JSON.stringify({ id: 1, msg: 'new' })));
      await nc2.close();
    });

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    }, { timeout: 10000 });

    expect(result.current[0].value).toEqual({ id: 1, msg: 'new' });
  });

  it('should filter messages by subject', async () => {
    // Setup: Create stream with multiple subjects
    const opt_start_time = new Date(Date.now() - 60000); // 1 minute ago
    const subject = `${streamName}.foo`;
    const nc = await wsconnect({ servers: connectionUrl });
    const jsMgr = await jetstreamManager(nc);
    const js = jsMgr.jetstream();

    await jsMgr.streams.add({
      name: streamName,
      subjects: [`${streamName}.>`],
    });

    await js.publish(`${streamName}.foo`, new TextEncoder().encode(JSON.stringify({ msg: 'foo1' })));
    await js.publish(`${streamName}.bar`, new TextEncoder().encode(JSON.stringify({ msg: 'bar1' })));
    await js.publish(`${streamName}.foo`, new TextEncoder().encode(JSON.stringify({ msg: 'foo2' })));
    await nc.close();

    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsStream({
        stream: streamName,
        decoder,
        reducer,
        subject,
        opt_start_time,
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.length).toBe(2);
    }, { timeout: 10000 });

    expect(result.current).toHaveLength(2);
    expect(result.current.every(m => m.subject === `${streamName}.foo`)).toBe(true);
    expect(result.current.map(m => m.value)).toEqual([
      { msg: 'foo1' },
      { msg: 'foo2' },
    ]);
  });

  it('should apply reducer to aggregate messages', async () => {
    // Setup: Create stream and publish messages
    const opt_start_time = new Date(Date.now() - 60000); // 1 minute ago
    const nc = await wsconnect({ servers: connectionUrl });
    const jsMgr = await jetstreamManager(nc);
    const js = jsMgr.jetstream();

    await jsMgr.streams.add({
      name: streamName,
      subjects: [`${streamName}.>`],
    });

    await js.publish(`${streamName}.test`, new TextEncoder().encode(JSON.stringify({ value: 1 })));
    await js.publish(`${streamName}.test`, new TextEncoder().encode(JSON.stringify({ value: 2 })));
    await js.publish(`${streamName}.test`, new TextEncoder().encode(JSON.stringify({ value: 3 })));
    await nc.close();

    // Reducer that keeps only last 2 messages
    const slidingWindowReducer = {
      reduce: (arr: NatsMessage<unknown>[], elem: NatsMessage<unknown>) => ([...arr, elem].slice(-2)) // Keep only last 2
    };

    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsStream({
        stream: streamName,
        decoder,
        reducer: slidingWindowReducer,
        opt_start_time,
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.length).toBe(2);
    }, { timeout: 10000 });

    // Should only have last 2 messages
    expect(result.current).toHaveLength(2);
    expect(result.current.map(m => m.value)).toEqual([
      { value: 2 },
      { value: 3 },
    ]);
  });

  it('should replay historical messages with opt_start_time', async () => {
    const now = new Date();
    const pastTime = new Date(now.getTime() - 60000); // 1 minute ago

    // Setup: Create stream and publish messages with timestamps
    const nc = await wsconnect({ servers: connectionUrl });
    const jsMgr = await jetstreamManager(nc);
    const js = jsMgr.jetstream();

    await jsMgr.streams.add({
      name: streamName,
      subjects: [`${streamName}.>`],
    });

    // Publish messages
    await js.publish(`${streamName}.test`, new TextEncoder().encode(JSON.stringify({ id: 1 })));
    await js.publish(`${streamName}.test`, new TextEncoder().encode(JSON.stringify({ id: 2 })));
    await nc.close();

    // Subscribe with start time in the past to replay all messages
    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsStream({
        stream: streamName,
        decoder,
        reducer,
        opt_start_time: pastTime,
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.length).toBe(2);
    }, { timeout: 10000 });

    expect(result.current).toHaveLength(2);
    expect(result.current.map(m => m.value)).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });
});
