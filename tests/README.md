# Testing react-nats

## Overview

This directory contains integration tests for the react-nats library hooks. The tests use:

- **Vitest** - Fast test runner with modern features
- **@testing-library/react** - React hooks testing utilities
- **@testcontainers/nats** - Manages real NATS server instances
- **happy-dom** - Lightweight DOM implementation with WebSocket support

## Current Status

The test infrastructure is set up but requires WebSocket-enabled NATS configuration. The NATS Docker image doesn't support WebSocket via command-line flags and requires a configuration file.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in UI mode
npm run test:ui

# Run with coverage
npm run test:coverage
```

## Test Files

- `useNatsConnection.test.tsx` - Tests basic NATS connection hook
- `useNatsKvTable.test.tsx` - Tests KV bucket watching
- `useNatsStream.test.tsx` - Tests JetStream message consumption
- `helpers.tsx` - Shared test utilities and setup
- `setup.ts` - Global test configuration

## WebSocket Configuration

To enable WebSocket support in NATS for testing, you need a configuration file:

```conf
# nats-ws.conf
port: 4222
jetstream: enabled

websocket {
  port: 8080
  no_tls: true
}
```

Then run NATS with:
```bash
docker run -p 4222:4222 -p 8080:8080 -v $(pwd)/nats-ws.conf:/nats-ws.conf nats:2.10-alpine -c /nats-ws.conf
```

## Alternative: Manual Testing

For now, the recommended approach is to test the library using the `examples/` directory with a locally running NATS server configured with WebSocket support.

## Future Improvements

- Add NATS configuration file to testcontainers setup
- Configure testcontainers to mount and use the WebSocket config
- Add end-to-end tests once WebSocket support is properly configured
