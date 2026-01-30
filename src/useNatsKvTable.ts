import { useEffect, useRef, useState } from 'react';
import { jetstream } from '@nats-io/jetstream';
import { KV, Kvm, KvWatchEntry } from '@nats-io/kv';
import { QueuedIterator } from '@nats-io/nats-core';
import { useNatsConnection } from './useNatsConnection';
import { NatsEntry } from './types';

export interface NatsKvTableOptions<T, U> {
  bucketName: string;
  decoder: { decode: (data: Uint8Array) => T };
  enrich?: (key: string, created: Date, decoded: T) => U;
  refreshInterval?: number;
  key?: string | string[];
}

const stableUpsert = (
  arr: NatsEntry<any>[],
  newEntry: NatsEntry<any>,
  inPlace: boolean = false
) => {
  const index = arr.findIndex((item) => item.key === newEntry.key);
  if (index >= 0) {
    if (inPlace) {
      arr[index] = newEntry;
      return arr;
    }
    return [...arr.slice(0, index), newEntry, ...arr.slice(index + 1)];
  } else {
    if (inPlace) {
      arr.push(newEntry);
      arr.sort((a, b) => a.key.localeCompare(b.key));
      return arr;
    }
    return [...arr, newEntry].sort((a, b) => a.key.localeCompare(b.key));
  }
};

export function useNatsKvTable<T, U = T>({
  bucketName,
  decoder,
  enrich,
  refreshInterval = 50,
  key,
}: NatsKvTableOptions<T, U>) {
  const connection = useNatsConnection();
  const [entries, setEntries] = useState<NatsEntry<U>[]>([]);
  const pendingUpdates = useRef<NatsEntry<U>[]>([]);

  useEffect(() => {
    if (!connection) return;

    let kv: KV | undefined;
    let watch: QueuedIterator<KvWatchEntry> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

    const setupNats = async () => {
      const js = jetstream(connection);
      const kvm = new Kvm(js);
      kv = await kvm.open(bucketName, { bindOnly: true });
      watch = await kv.watch({ key });

      const flushUpdates = () => {
        const updatesToProcess = [...pendingUpdates.current];
        if (updatesToProcess.length > 0) {
          pendingUpdates.current = [];
          setEntries((prev) => {
            const newEntries = [...prev];
            return updatesToProcess.reduce(
              (acc, newEntry) => stableUpsert(acc, newEntry, true),
              newEntries
            );
          });
        }
      };

      if (refreshInterval > 0) {
        flushUpdates();
        interval = setInterval(flushUpdates, refreshInterval);

        (async () => {
          for await (const e of watch) {
            if (e.operation === 'PUT') {
              const decoded = decoder.decode(e.value);
              const enrichedValue = enrich
                ? enrich(e.key, e.created, decoded)
                : (decoded as unknown as U);
              const newEntry: NatsEntry<U> = {
                key: e.key,
                value: enrichedValue,
                created: e.created,
              };
              pendingUpdates.current.push(newEntry);
            } else if (e.operation === 'DEL' || e.operation === 'PURGE') {
              pendingUpdates.current = pendingUpdates.current.filter(
                (item) => item.key !== e.key
              );
              setEntries((prev) => prev.filter((item) => item.key !== e.key));
            }
          }
        })();
      } else {
        (async () => {
          for await (const e of watch) {
            if (e.operation === 'PUT') {
              const decoded = decoder.decode(e.value);
              const enrichedValue = enrich
                ? enrich(e.key, e.created, decoded)
                : (decoded as unknown as U);
              const newEntry: NatsEntry<U> = {
                key: e.key,
                value: enrichedValue,
                created: e.created,
              };
              setEntries((prev) => stableUpsert(prev, newEntry));
            } else if (e.operation === 'DEL' || e.operation === 'PURGE') {
              setEntries((prev) => prev.filter((item) => item.key !== e.key));
            }
          }
        })();
      }
    };

    setupNats().catch((err) => console.error('NATS setup error:', err));

    return () => {
      watch?.stop();
      if (interval) clearInterval(interval);
      kv = undefined;
      watch = undefined;
    };
  }, [bucketName, connection, decoder, enrich, key, refreshInterval]);

  return entries;
}
