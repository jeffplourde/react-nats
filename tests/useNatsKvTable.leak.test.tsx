import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Regression test for the consumer leak: useNatsKvTable must create the KV
// watch (a server-side ordered consumer) ONCE and not re-subscribe on every
// render. Callers commonly pass an inline `decoder` object (a fresh identity
// each render); when those options were in the effect dep array, the watch was
// torn down and recreated per render, orphaning a consumer each time — tens of
// thousands accumulated and crashed the NATS server.
//
// Mocked (no container) so it isolates exactly the re-subscription behavior.

const { kvWatch, kvmOpen, watchStop, fakeConn } = vi.hoisted(() => {
  const watchStop = vi.fn();
  const kvWatch = vi.fn(async () => ({
    stop: watchStop,
    // A live watch that simply stays open (yields nothing).
    async *[Symbol.asyncIterator]() {},
  }));
  const kvmOpen = vi.fn(async () => ({ watch: kvWatch }));
  return { kvWatch, kvmOpen, watchStop, fakeConn: {} };
});

vi.mock('@nats-io/jetstream', () => ({ jetstream: () => ({}) }));
vi.mock('@nats-io/kv', () => ({
  Kvm: class {
    open = kvmOpen;
  },
}));
vi.mock('../src/useNatsConnection', () => ({ useNatsConnection: () => fakeConn }));

import { useNatsKvTable } from '../src/useNatsKvTable';

describe('useNatsKvTable: consumer-leak regression', () => {
  beforeEach(() => {
    kvWatch.mockClear();
    kvmOpen.mockClear();
    watchStop.mockClear();
  });

  it('creates exactly one watch despite re-renders with an inline decoder', async () => {
    const { rerender } = renderHook(() =>
      // The exact pattern that leaked: a NEW decoder object every render.
      useNatsKvTable<unknown>({ bucketName: 'pv-agents', decoder: { decode: (d) => d } })
    );
    await waitFor(() => expect(kvWatch).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 25; i++) rerender();
    // Give any (incorrect) re-subscriptions a chance to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(kvWatch).toHaveBeenCalledTimes(1);
    expect(watchStop).not.toHaveBeenCalled();
  });

  it('re-subscribes only when the bucket actually changes', async () => {
    const { rerender } = renderHook(
      ({ bucket }) =>
        useNatsKvTable<unknown>({ bucketName: bucket, decoder: { decode: (d) => d } }),
      { initialProps: { bucket: 'pv-agents' } }
    );
    await waitFor(() => expect(kvWatch).toHaveBeenCalledTimes(1));
    rerender({ bucket: 'pv-workspaces' });
    await waitFor(() => expect(kvWatch).toHaveBeenCalledTimes(2));
  });
});
