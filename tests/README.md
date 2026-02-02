# Testing react-nats

## Overview

This directory contains comprehensive integration tests for all react-nats library hooks. The tests use:

- **Vitest** - Fast test runner with modern features
- **@testing-library/react** - React hooks testing utilities
- **@testcontainers/nats** - Manages real NATS server instances with JetStream
- **happy-dom** - Lightweight DOM implementation with real WebSocket support
- **ws** - Node.js WebSocket library for real network connections

## Test Status

✅ **All 17 tests passing!**

The test suite validates all three hooks against real NATS infrastructure:
- ✅ useNatsConnection (4 tests)
- ✅ useNatsKvTable (7 tests)
- ✅ useNatsStream (6 tests)

## Running Tests

```bash
# Run all tests
npm test

# Run tests in UI mode
npm run test:ui

# Run with coverage
npm run test:coverage
```

**Requirements:**
- Docker must be running (for Testcontainers)
- First run will download the NATS Docker image (~50MB)

## Test Files

- **`useNatsConnection.test.tsx`** - Tests WebSocket connection establishment and lifecycle
- **`useNatsKvTable.test.tsx`** - Tests KV bucket watching with real-time updates
- **`useNatsStream.test.tsx`** - Tests JetStream message consumption with time-based replay
- **`helpers.tsx`** - Shared utilities (test wrapper, decoder, reducer, container setup)
- **`setup.ts`** - Global test configuration with real WebSocket injection
- **`nats-ws.conf`** - NATS server configuration with WebSocket and JetStream enabled

## Architecture

### Real Integration Testing

These are true integration tests that:
1. Start isolated NATS containers with JetStream + WebSocket
2. Test actual library hooks (not mocks) with real connections
3. Validate real-time messaging, KV watching, and stream consumption
4. Clean up containers automatically after tests

### WebSocket Configuration

The tests use a custom NATS configuration (`nats-ws.conf`) that enables:
- **WebSocket server** on port 8080 (no TLS for testing)
- **JetStream** for stream and KV functionality
- **Standard NATS** on port 4222

Testcontainers automatically:
- Copies the config file into the container
- Maps ports to random host ports
- Waits for "Server is ready" log message
- Cleans up after test completion

### Test Utilities

**`helpers.tsx` exports:**
- `createTestWrapper(url)` - Wraps components with NatsProvider
- `decoder` - Standard JSON decoder for tests
- `reducer` - Default message reducer (appends to array)
- `startNatsWithWebSocket()` - Creates configured NATS container
- `getWebSocketUrl(container)` - Gets WebSocket URL from container

## Example Test Pattern

```typescript
describe('useNatsConnection', () => {
  let natsContainer: StartedTestContainer;
  let connectionUrl: string;

  beforeAll(async () => {
    natsContainer = await startNatsWithWebSocket();
    connectionUrl = getWebSocketUrl(natsContainer);
  }, 60000);

  afterAll(async () => {
    await natsContainer.stop();
  });

  it('should establish connection', async () => {
    const wrapper = createTestWrapper(connectionUrl);
    const { result } = renderHook(() => useNatsConnection(), { wrapper });

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
  });
});
```

## CI/CD Integration

The tests are ready for CI/CD pipelines that support Docker:
- ✅ GitHub Actions (Docker available by default)
- ✅ GitLab CI (with Docker executor)
- ✅ CircleCI (with Docker executor)

No additional services or setup needed - Testcontainers handles everything.
