import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Regression test for the consumer leak + full-replay mode in useNatsStream.
// Like useNatsKvTable, the watch/consume effect must create its JetStream
// consumer ONCE and not re-subscribe per render (callers pass inline
// decoder/reducer/subject). Mocked (no container) so it isolates the behavior.

const { getConsumer, consume, del, capturedOpts, fakeConn } = vi.hoisted(() => {
  const consume = vi.fn(async () => ({
    stop: vi.fn(),
    async *[Symbol.asyncIterator]() {}, // a live consumer that yields nothing
  }));
  const del = vi.fn(async () => true);
  const capturedOpts: Array<Record<string, unknown>> = [];
  const getConsumer = vi.fn(async (_stream: string, opts: Record<string, unknown>) => {
    capturedOpts.push(opts);
    return { consume, delete: del };
  });
  return { getConsumer, consume, del, capturedOpts, fakeConn: {} };
});

vi.mock('@nats-io/jetstream', () => ({
  jetstream: () => ({ consumers: { get: getConsumer } }),
  DeliverPolicy: { All: 'all', StartTime: 'by_start_time' },
}));
vi.mock('../src/useNatsConnection', () => ({ useNatsConnection: () => fakeConn }));

import { useNatsStream } from '../src/useNatsStream';

const decoder = { decode: (d: Uint8Array) => d };
const reducer = { reduce: (arr: unknown[], e: unknown) => [...arr, e] };

describe('useNatsStream: full replay + consumer-leak regression', () => {
  beforeEach(() => {
    getConsumer.mockClear();
    consume.mockClear();
    del.mockClear();
    capturedOpts.length = 0;
  });

  it('replays the whole stream (DeliverPolicy.All) when no start time', async () => {
    renderHook(() =>
      useNatsStream({ stream: 'pv-io', subject: 'a.b.events', decoder, reducer })
    );
    await waitFor(() => expect(getConsumer).toHaveBeenCalledTimes(1));
    expect(capturedOpts[0].deliver_policy).toBe('all');
    expect(capturedOpts[0].filter_subjects).toBe('a.b.events');
  });

  it('uses StartTime when a start time is given', async () => {
    const t = new Date('2026-01-01T00:00:00.000Z');
    renderHook(() => useNatsStream({ stream: 'pv-io', decoder, reducer, opt_start_time: t }));
    await waitFor(() => expect(getConsumer).toHaveBeenCalledTimes(1));
    expect(capturedOpts[0].deliver_policy).toBe('by_start_time');
    expect(capturedOpts[0].opt_start_time).toBe(t.toISOString());
  });

  it('creates the consumer once across re-renders with inline options', async () => {
    const { rerender } = renderHook(() =>
      // New decoder/reducer objects every render — the pattern that leaked.
      useNatsStream({ stream: 'pv-io', decoder: { decode: (d) => d }, reducer: { reduce: (a, e) => [...a, e] } })
    );
    await waitFor(() => expect(getConsumer).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 25; i++) rerender();
    await new Promise((r) => setTimeout(r, 50));
    expect(getConsumer).toHaveBeenCalledTimes(1);
  });

  it('recreates the consumer when the stream changes', async () => {
    const { rerender } = renderHook(
      ({ s }) => useNatsStream({ stream: s, decoder, reducer }),
      { initialProps: { s: 'pv-io' } }
    );
    await waitFor(() => expect(getConsumer).toHaveBeenCalledTimes(1));
    rerender({ s: 'other' });
    await waitFor(() => expect(getConsumer).toHaveBeenCalledTimes(2));
  });
});
