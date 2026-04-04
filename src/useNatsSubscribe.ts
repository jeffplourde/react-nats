import { useEffect, useState, useCallback } from 'react';
import { useNatsConnection } from './useNatsConnection';

export interface UseNatsSubscribeOptions<T> {
  subject: string | null | undefined;
  decoder?: (data: Uint8Array) => T;
  queue?: string;
}

export interface NatsSubscribeResult<T> {
  messages: T[];
  clear: () => void;
}

const utf8 = new TextDecoder();
const defaultDecoder = (data: Uint8Array): unknown => JSON.parse(utf8.decode(data)) as unknown;

export function useNatsSubscribe<T = unknown>({
  subject,
  decoder = defaultDecoder as (data: Uint8Array) => T,
  queue,
}: UseNatsSubscribeOptions<T>): NatsSubscribeResult<T> {
  const connection = useNatsConnection();
  const [messages, setMessages] = useState<T[]>([]);
  const clear = useCallback(() => setMessages([]), []);

  useEffect(() => {
    if (!connection || !subject) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setMessages([]);

    const sub = connection.subscribe(subject, queue ? { queue } : undefined);

    void (async () => {
      for await (const msg of sub) {
        if (cancelled) break;
        try {
          const decoded = decoder(msg.data);
          setMessages(prev => [...prev, decoded]);
        } catch (err) {
          console.warn(`[useNatsSubscribe] decode error on ${subject}:`, err);
        }
      }
    })();

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, [connection, subject, decoder, queue]);

  return { messages, clear };
}
