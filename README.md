# react-nats

React hooks for NATS messaging and JetStream.

## Features

- 🔌 **NatsProvider** - WebSocket connection management with auto-reconnect
- 📊 **useNatsKvTable** - Reactive NATS KV bucket with real-time updates
- 📨 **useNatsStream** - JetStream consumer with time-based replay
- ⚡ **Performance optimized** - Batched updates and stable sorting
- 🎯 **TypeScript first** - Full type safety with generics
- 🧪 **Zero dependencies** - Only peer dependencies on React and NATS

## Installation

```bash
npm install react-nats @nats-io/nats-core @nats-io/jetstream @nats-io/kv
```

## Quick Start

### 1. Wrap your app with NatsProvider

```tsx
import { NatsProvider } from 'react-nats';

function App() {
  return (
    <NatsProvider url="ws://localhost:4222">
      <YourApp />
    </NatsProvider>
  );
}
```

### 2. Use NATS KV for real-time data

```tsx
import { useNatsKvTable } from 'react-nats';

interface MyData {
  id: string;
  value: number;
}

function MyComponent() {
  const entries = useNatsKvTable({
    bucketName: 'my-bucket',
    decoder: {
      decode: (data: Uint8Array) => JSON.parse(new TextDecoder().decode(data)),
    },
    refreshInterval: 50, // Batch updates every 50ms
  });

  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.key}>
          {entry.key}: {entry.value.value}
        </li>
      ))}
    </ul>
  );
}
```

### 3. Consume JetStream messages

```tsx
import { useNatsStream } from 'react-nats';

function StreamComponent() {
  const messages = useNatsStream({
    stream: 'my-stream',
    subject: 'events.*',
    decoder: {
      decode: (data: Uint8Array) => JSON.parse(new TextDecoder().decode(data)),
    },
    reducer: {
      reduce: (arr, msg) => [...arr, msg].slice(-100), // Keep last 100
    },
    opt_start_time: new Date(Date.now() - 3600000), // Last hour
  });

  return <div>Received {messages.length} messages</div>;
}
```

## API Reference

### `<NatsProvider>`

Manages WebSocket connection to NATS server.

**Props:**
- `url: string` - NATS WebSocket URL (e.g., `ws://localhost:4222`)
- `options?: Partial<ConnectionOptions>` - Additional NATS connection options
- `children: React.ReactNode`

**Example:**
```tsx
<NatsProvider
  url="wss://nats.example.com"
  options={{
    maxReconnectAttempts: 10,
    reconnectTimeWait: 2000,
  }}
>
  <App />
</NatsProvider>
```

### `useNatsConnection()`

Returns the current NATS connection or `null` if not connected.

```tsx
const connection = useNatsConnection();
if (connection) {
  // Use connection directly
}
```

### `useNatsKvTable<T, U>(options)`

Watches a NATS KV bucket and returns reactive entries.

**Options:**
- `bucketName: string` - Name of the KV bucket
- `decoder: { decode: (data: Uint8Array) => T }` - Decode function for values
- `enrich?: (key: string, created: Date, decoded: T) => U` - Optional transform
- `refreshInterval?: number` - Batch update interval in ms (default: 50)
- `key?: string | string[]` - Filter specific keys

**Returns:** `NatsEntry<U>[]`
```typescript
type NatsEntry<T> = {
  key: string;
  value: T;
  created: Date;
};
```

**Example with enrichment:**
```tsx
const entries = useNatsKvTable({
  bucketName: 'prices',
  decoder: { decode: (data) => parseFloat(new TextDecoder().decode(data)) },
  enrich: (key, created, price) => ({
    symbol: key,
    price,
    age: Date.now() - created.getTime(),
  }),
});
```

### `useNatsStream<T>(options)`

Consumes messages from a JetStream stream.

**Options:**
- `stream?: string` - Stream name (required)
- `subject?: string | string[]` - Filter subjects
- `decoder: { decode: (data: Uint8Array) => T }` - Decode function
- `reducer: { reduce: (arr: NatsMessage<T>[], msg: NatsMessage<T>) => NatsMessage<T>[] }` - State reducer
- `opt_start_time?: Date` - Start consuming from this time

**Returns:** `NatsMessage<T>[]`
```typescript
type NatsMessage<T> = {
  subject: string;
  value: T;
  received: Date;
};
```

**Example with filtering:**
```tsx
const trades = useNatsStream({
  stream: 'TRADES',
  subject: 'trades.BTC.*',
  decoder: { decode: (data) => JSON.parse(new TextDecoder().decode(data)) },
  reducer: {
    reduce: (arr, msg) => {
      // Keep only profitable trades
      if (msg.value.profit > 0) {
        return [...arr, msg];
      }
      return arr;
    },
  },
  opt_start_time: new Date(Date.now() - 86400000), // Last 24 hours
});
```

## Common Patterns

### JSON Decoder

```tsx
const jsonDecoder = {
  decode: (data: Uint8Array) => JSON.parse(new TextDecoder().decode(data)),
};
```

### Protobuf Decoder

```tsx
import { MyMessage } from './generated/proto';

const protobufDecoder = {
  decode: (data: Uint8Array) => MyMessage.decode(data),
};
```

### Sliding Window Reducer

```tsx
const slidingWindowReducer = (windowSize: number) => ({
  reduce: (arr: NatsMessage<any>[], msg: NatsMessage<any>) =>
    [...arr, msg].slice(-windowSize),
});
```

## Performance Tips

1. **Batch updates** - Use `refreshInterval` in `useNatsKvTable` to batch rapid updates
2. **Filter early** - Use `key` parameter to watch only specific keys
3. **Limit state** - Use reducer to keep only necessary messages in memory
4. **Memoize decoders** - Create decoder objects outside components

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
