import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { StartedTestContainer } from 'testcontainers';
import { wsconnect } from '@nats-io/nats-core';
import { jetstream, jetstreamManager } from '@nats-io/jetstream';
import { Kvm } from '@nats-io/kv';
import { createTestWrapper, decoder, useNatsKvTable, getWebSocketUrl, startNatsWithWebSocket } from './helpers';
import { act } from 'react';

describe('useNatsKvTable', () => {
  let natsContainer: StartedTestContainer;
  let connectionUrl: string;
  let bucketName: string;

  beforeAll(async () => {
    natsContainer = await startNatsWithWebSocket();
    connectionUrl = getWebSocketUrl(natsContainer);
  }, 60000);

  afterAll(async () => {
    await natsContainer.stop();
  });

  beforeEach(() => {
    // Unique bucket name per test
    bucketName = `test-bucket-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  });

  it('should return empty array for new bucket', async () => {
    // Create bucket first
    const nc = await wsconnect({ servers: connectionUrl });
    const js = jetstream(nc);
    const kvm = new Kvm(js);
    await kvm.create(bucketName, { history: 1 });
    await nc.close();

    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsKvTable({ bucketName, decoder }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current).toEqual([]);
    }, { timeout: 5000 });
  });

  it('should return existing entries from bucket', async () => {
    // Setup: Create bucket and add entries
    const nc = await wsconnect({ servers: connectionUrl });
    const js = jetstream(nc);
    const kvm = new Kvm(js);
    const kv = await kvm.create(bucketName, { history: 1 });

    await kv.put('key1', new TextEncoder().encode(JSON.stringify({ value: 'test1' })));
    await kv.put('key2', new TextEncoder().encode(JSON.stringify({ value: 'test2' })));
    await nc.close();

    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsKvTable({ bucketName, decoder }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.length).toBe(2);
    }, { timeout: 5000 });

    expect(result.current).toHaveLength(2);
    expect(result.current.map(e => e.key).sort()).toEqual(['key1', 'key2']);
    expect(result.current.find(e => e.key === 'key1')?.value).toEqual({ value: 'test1' });
    expect(result.current.find(e => e.key === 'key2')?.value).toEqual({ value: 'test2' });
  });

  it('should update when new entries are added', async () => {
    // Setup: Create empty bucket
    const nc = await wsconnect({ servers: connectionUrl });
    const js = jetstream(nc);
    const kvm = new Kvm(js);
    await kvm.create(bucketName, { history: 1 });
    await nc.close();

    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsKvTable({ bucketName, decoder }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current).toEqual([]);
    }, { timeout: 5000 });

    await act( async () => {
      // Add entry after hook is watching
      const nc2 = await wsconnect({ servers: connectionUrl });
      const js2 = jetstream(nc2);
      const kvm2 = new Kvm(js2);
      const kv2 = await kvm2.open(bucketName);
      await kv2.put('newkey', new TextEncoder().encode(JSON.stringify({ value: 'newvalue' })));
      await nc2.close();
    });


    await waitFor(() => {
      expect(result.current.length).toBe(1);
      expect(result.current[0].key).toBe('newkey');
      expect(result.current[0].value).toEqual({ value: 'newvalue' });
    }, { timeout: 5000 });


  });

  it('should handle entry updates', async () => {
    // Setup: Create bucket with initial entry
    const nc = await wsconnect({ servers: connectionUrl });
    const jsMgr = await jetstreamManager(nc);
    const js = jsMgr.jetstream();
    const kvm = new Kvm(js);
    const kv = await kvm.create(bucketName, { history: 1 });
    await kv.put('key1', new TextEncoder().encode(JSON.stringify({ value: 'initial' })));
    await nc.close();

    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsKvTable({ bucketName, decoder }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    }, { timeout: 5000 });

    expect(result.current[0].value).toEqual({ value: 'initial' });

    await act( async () => {
      // Update the entry
      const nc2 = await wsconnect({ servers: connectionUrl });
      const js2 = jetstream(nc2);
      const kvm2 = new Kvm(js2);
      const kv2 = await kvm2.open(bucketName);
      await kv2.put('key1', new TextEncoder().encode(JSON.stringify({ value: 'updated' })));
      await nc2.close();
    });

    await waitFor(() => {
      expect(result.current[0].value).toEqual({ value: 'updated' });
    }, { timeout: 5000 });
  });

  it('should remove deleted entries', async () => {
    // Setup: Create bucket with entries
    const nc = await wsconnect({ servers: connectionUrl });
    const jsMgr = await jetstreamManager(nc);
    const js = jsMgr.jetstream();
    const kvm = new Kvm(js);
    const kv = await kvm.create(bucketName, { history: 1 });
    await kv.put('key1', new TextEncoder().encode(JSON.stringify({ value: 'test1' })));
    await kv.put('key2', new TextEncoder().encode(JSON.stringify({ value: 'test2' })));
    await nc.close();

    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsKvTable({ bucketName, decoder }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.length).toBe(2);
    }, { timeout: 5000 });

    await act( async () => {
      // Delete one entry
      const nc2 = await wsconnect({ servers: connectionUrl });
      const js2 = jetstream(nc2);
      const kvm2 = new Kvm(js2);
      const kv2 = await kvm2.open(bucketName);
      await kv2.delete('key1');
      await nc2.close();
    });

    await waitFor(() => {
      expect(result.current.length).toBe(1);
      expect(result.current[0].key).toBe('key2');
    }, { timeout: 5000 });
  });

  it('should filter by specific key', async () => {
    // Setup: Create bucket with multiple entries
    const nc = await wsconnect({ servers: connectionUrl });
    const jsMgr = await jetstreamManager(nc);
    const js = jsMgr.jetstream();
    const kvm = new Kvm(js);
    const kv = await kvm.create(bucketName, { history: 1 });
    await kv.put('prefix.key1', new TextEncoder().encode(JSON.stringify({ value: 'test1' })));
    await kv.put('prefix.key2', new TextEncoder().encode(JSON.stringify({ value: 'test2' })));
    await kv.put('other.key', new TextEncoder().encode(JSON.stringify({ value: 'test3' })));
    await nc.close();

    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsKvTable({ bucketName, decoder, key: 'prefix.>' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.length).toBe(2);
    }, { timeout: 5000 });

    const keys = result.current.map(e => e.key).sort();
    expect(keys).toEqual(['prefix.key1', 'prefix.key2']);
  });

  it('should apply enrich function to values', async () => {
    // Setup: Create bucket with entries
    const nc = await wsconnect({ servers: connectionUrl });
    const jsMgr = await jetstreamManager(nc);
    const js = jsMgr.jetstream();
    const kvm = new Kvm(js);
    const kv = await kvm.create(bucketName, { history: 1 });
    await kv.put('key1', new TextEncoder().encode(JSON.stringify({ value: 'test1' })));
    await nc.close();

    const enrichFn = (_key: string, _created: Date, val: unknown) => {
      const obj = val as { value: string };
      return { ...obj, enriched: true };
    };

    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(
      () => useNatsKvTable({
        bucketName,
        decoder,
        enrich: enrichFn
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.length).toBe(1);
    }, { timeout: 5000 });

    expect(result.current[0].value).toEqual({ value: 'test1', enriched: true });
  });
});
