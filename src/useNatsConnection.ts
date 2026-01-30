import { useContext } from 'react';
import { NatsConnection } from '@nats-io/nats-core';
import { NatsContext } from './NatsProvider';

export function useNatsConnection(): NatsConnection | null {
  const connection = useContext(NatsContext);
  return connection;
}
