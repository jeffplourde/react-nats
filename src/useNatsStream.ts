import { useEffect, useState } from 'react';
import {
  jetstream,
  Consumer,
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

  useEffect(() => {
    setData([]);
    if (!connection) return;
    if (!opt_start_time) return;
    if (!stream) return;

    let isCurrent = true;
    let c: Consumer | null = null;

    const setupNats = async () => {
      const js = jetstream(connection);
      const opt: Partial<OrderedConsumerOptions> = {};

      if (opt_start_time) {
        opt.opt_start_time = opt_start_time.toISOString();
        opt.deliver_policy = DeliverPolicy.StartTime;
      }

      if (subject) {
        opt.filter_subjects = subject;
      }

      c = await js.consumers.get(stream, opt);

      try {
        const messages = await c.consume({ max_messages: 1 });
        let effectData: NatsMessage<T>[] = [];

        for await (const m of messages) {
          const d: NatsMessage<T> = {
            received: m.time,
            subject: m.subject,
            value: decoder.decode(m.data),
          };

          effectData = reducer.reduce(effectData, d);
          m.ack();

          if (!isCurrent) {
            break;
          }

          setData(effectData);
        }
      } finally {
        if (!(await c.delete())) {
          console.warn(`Failed to delete consumer for stream ${stream}`);
        }
      }
    };

    setupNats().catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      if (isCurrent) {
        console.error('NATS setup error:', error);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [connection, stream, decoder, reducer, subject, opt_start_time]);

  return data;
}
