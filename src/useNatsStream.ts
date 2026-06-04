import { useEffect, useRef, useState } from 'react';
import {
  jetstream,
  Consumer,
  ConsumerMessages,
  DeliverPolicy,
  OrderedConsumerOptions,
} from '@nats-io/jetstream';
import { useNatsConnection } from './useNatsConnection';
import { NatsMessage } from './types';

export interface NatsStreamOptions<T> {
  stream?: string;
  subject?: string | string[];
  decoder: { decode: (data: Uint8Array) => T };
  reducer: {
    reduce: (arr: NatsMessage<T>[], element: NatsMessage<T>) => NatsMessage<T>[];
  };
  /**
   * Where to start. Omit to replay the ENTIRE stream (DeliverPolicy.All) and
   * then continue live — i.e. session replay. Pass a Date to replay only from
   * that time onward (DeliverPolicy.StartTime).
   */
  opt_start_time?: Date;
}

export function useNatsStream<T>({
  stream,
  decoder,
  reducer,
  subject,
  opt_start_time,
}: NatsStreamOptions<T>) {
  const connection = useNatsConnection();
  const [data, setData] = useState<NatsMessage<T>[]>([]);

  // Hold render-unstable options in refs so the consumer is NOT recreated on
  // every render. Callers routinely pass inline `decoder`/`reducer`/`subject`
  // and a fresh `opt_start_time` Date — a new identity each render. If those
  // were effect deps, the JetStream ordered consumer would be torn down and
  // recreated on every render, orphaning the previous one on the server (an
  // unbounded consumer leak — the same failure mode fixed in useNatsKvTable).
  // The consumer is recreated only when the connection, stream, subject filter,
  // or start time actually changes.
  const decoderRef = useRef(decoder);
  decoderRef.current = decoder;
  const reducerRef = useRef(reducer);
  reducerRef.current = reducer;
  const subjectRef = useRef(subject);
  subjectRef.current = subject;

  const subjectKey = Array.isArray(subject) ? subject.join(',') : subject ?? '';
  const startKey = opt_start_time ? opt_start_time.toISOString() : '';

  useEffect(() => {
    setData([]);
    if (!connection) return;
    if (!stream) return;

    let stopped = false;
    let messages: ConsumerMessages | undefined;
    let consumer: Consumer | undefined;

    const setupNats = async () => {
      const js = jetstream(connection);
      const opt: Partial<OrderedConsumerOptions> = {};
      if (startKey) {
        opt.opt_start_time = startKey;
        opt.deliver_policy = DeliverPolicy.StartTime;
      } else {
        opt.deliver_policy = DeliverPolicy.All;
      }
      const sub = subjectRef.current;
      if (sub) {
        opt.filter_subjects = sub;
      }

      consumer = await js.consumers.get(stream, opt);
      if (stopped) return;

      messages = await consumer.consume();

      // Flush replayed history in ONE state update at the live edge
      // (info.pending === 0), then append live messages one at a time. This
      // keeps opening a long stream from triggering O(N) re-renders. The
      // reducer is still applied to every message, in order.
      let caughtUp = false;
      let acc: NatsMessage<T>[] = [];
      for await (const m of messages) {
        if (stopped) break;
        const d: NatsMessage<T> = {
          received: m.time,
          subject: m.subject,
          value: decoderRef.current.decode(m.data),
        };
        acc = reducerRef.current.reduce(acc, d);
        if (caughtUp) {
          setData(acc);
        } else if (m.info.pending === 0) {
          caughtUp = true;
          setData(acc);
        }
      }
    };

    setupNats().catch((error: unknown) => {
      if (stopped) return;
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('NATS setup error:', error);
    });

    return () => {
      stopped = true;
      messages?.stop();
      // Ordered consumers are ephemeral and self-clean; best-effort delete.
      void consumer?.delete().catch(() => {});
    };
  }, [connection, stream, subjectKey, startKey]);

  return data;
}
