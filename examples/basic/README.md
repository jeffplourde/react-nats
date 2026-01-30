# Basic Example

This example demonstrates basic usage of react-nats with a simple price table.

## Setup

1. Start NATS server with JetStream and WebSocket enabled:

```bash
nats-server -js -m 8222 --port 4222 --http_port 8080
```

2. Create a KV bucket:

```bash
nats kv add prices
```

3. Add some test data:

```bash
nats kv put prices BTC '{"symbol":"BTC","price":45000,"timestamp":1234567890}'
nats kv put prices ETH '{"symbol":"ETH","price":3000,"timestamp":1234567890}'
```

4. Run your React app and watch the prices update in real-time!

## Key Concepts

- **NatsProvider** wraps the app and manages the connection
- **useNatsKvTable** watches the KV bucket and returns reactive entries
- Updates are batched with `refreshInterval` for performance
- TypeScript types ensure type safety throughout
