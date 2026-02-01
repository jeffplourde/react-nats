# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React hooks library for NATS messaging and JetStream. Provides WebSocket-based NATS client with React Context, real-time KV bucket watching, and JetStream message consumption with time-based replay capabilities.

## Build Commands

```bash
# Build the library (tsup produces both CJS and ESM formats)
npm run build

# Development watch mode
npm run dev

# Run tests
npm test

# Lint
npm run lint
npm run lint:fix
```

## Architecture

### Core Components

**NatsProvider** (src/NatsProvider.tsx)
- React Context provider that establishes and manages WebSocket connection to NATS
- Creates connection using `wsconnect()` from @nats-io/nats-core
- Handles automatic reconnection via `connectionOptions` with defaults: reconnect=true, pingInterval=10s
- Uses refs to prevent duplicate connections (`isConnectingRef`, `connRef`)
- Monitors connection closure via `connection.closed()` promise
- Exports `NatsContext` for child components

**useNatsConnection** (src/useNatsConnection.ts)
- Simple hook that consumes `NatsContext`
- Returns the active NATS connection or null if not connected

**useNatsKvTable** (src/useNatsKvTable.ts)
- Watches a NATS KV bucket and returns reactive array of entries
- Key implementation details:
  - Uses `kv.watch()` to monitor changes (PUT/DEL/PURGE operations)
  - Implements batched updates via `refreshInterval` (default 50ms) to optimize performance
  - Maintains stable sorting by key using `stableUpsert()` helper
  - Supports optional `enrich` function to transform values
  - Can filter by specific keys via `key` parameter
- Returns `NatsEntry<U>[]` with shape: `{ key: string, value: U, created: Date }`

**useNatsStream** (src/useNatsStream.ts)
- Consumes JetStream messages with time-based replay
- Key implementation details:
  - Creates ordered consumer with `js.consumers.get(stream, options)`
  - Uses `opt_start_time` with `DeliverPolicy.StartTime` to replay historical messages
  - Supports subject filtering via `filter_subjects`
  - Applies `reducer` function to aggregate/filter messages in real-time
  - Automatically deletes consumer on cleanup
  - Processes messages one at a time (`max_messages: 1`) and acknowledges each
- Returns `NatsMessage<T>[]` with shape: `{ subject: string, value: T, received: Date }`

### Key Patterns

**Decoder Pattern**
All hooks accept a `decoder` object with `decode(data: Uint8Array) => T` method. This allows flexible deserialization (JSON, Protobuf, etc.) without hardcoding format.

**Reducer Pattern** (useNatsStream only)
The `reducer` object with `reduce(arr, element) => arr` method enables stateful message processing - e.g., sliding windows, filtering, deduplication.

**Stable Updates** (useNatsKvTable only)
The `stableUpsert()` helper maintains sort order when updating entries by key, preventing unnecessary re-renders when entry positions don't change.

**Batched Updates** (useNatsKvTable only)
When `refreshInterval > 0`, updates accumulate in `pendingUpdates` ref and flush on interval, reducing React render cycles during high-frequency KV changes.

## TypeScript Configuration

- Strict mode enabled with additional checks: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`
- Target: ES2020, JSX transform: react-jsx (automatic runtime)
- Outputs both declaration files and sourcemaps

## ESLint Configuration

Uses modern flat config (eslint.config.mjs) with:
- TypeScript ESLint with type-checking rules enabled
- React plugin with automatic JSX runtime (no React import needed)
- React Hooks rules enforced (exhaustive-deps as warning)
- Unused variables allowed if prefixed with underscore
- Floating promises treated as errors
- Separate configuration for examples/ directory (less strict type-checking)

## Peer Dependencies

- React 19.x
- @nats-io/nats-core ^3.0.2-1 (WebSocket client)
- @nats-io/jetstream ^3.0.2-1 (JetStream API)
- @nats-io/kv ^3.0.2-1 (Key-Value API)

## Development Notes

- Library uses tsup for bundling with dual CJS/ESM output
- External peer deps are marked in tsup.config.ts to avoid bundling
- No test files exist yet in tests/ directory
- Use the examples/basic/ directory to test changes locally
