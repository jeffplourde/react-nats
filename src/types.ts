export type NatsEntry<T> = {
  key: string;
  value: T;
  created: Date;
};

export type NatsMessage<T> = {
  subject: string;
  value: T;
  received: Date;
};
