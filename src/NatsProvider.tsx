import { createContext, useEffect, useState, useRef, useMemo } from 'react';
import { wsconnect, NatsConnection, ConnectionOptions } from '@nats-io/nats-core';

export const NatsContext = createContext<NatsConnection | null>(null);

export interface NatsProviderProps {
  url: string;
  options?: Partial<ConnectionOptions>;
  children: React.ReactNode;
}

const DEFAULT_OPTIONS: Partial<ConnectionOptions> = {
  reconnect: true,
  pingInterval: 10000,
  maxPingOut: 5,
};

export const NatsProvider: React.FC<NatsProviderProps> = ({
  url,
  options,
  children,
}) => {
  const [connection, setConnection] = useState<NatsConnection | null>(null);
  const connRef = useRef<NatsConnection | null>(null);
  const isConnectingRef = useRef(false);
  const connectionOptions = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...options }),
    [options]
  );

  useEffect(() => {
    if (isConnectingRef.current || connRef.current) {
      return;
    }

    isConnectingRef.current = true;
    let isActive = true;

    const establishConnection = async () => {
      try {
        const newConnection = await wsconnect({
          servers: url,
          ...connectionOptions,
        });
        if (isActive) {
          connRef.current = newConnection;
          setConnection(newConnection);

          newConnection.closed()
            .then((err: Error | void) => {
              if (err?.message) {
                console.log('NATS connection closed:', err?.message);
              } else {
                // Connection closed by request
              }

              if (isActive) {
                connRef.current = null;
                setConnection(null);
                isConnectingRef.current = false;
              }
            })
            .catch((err) => {
              console.error('Error monitoring connection closure:', err);
            });
        } else {
          // Component unmounted before connection established
          newConnection.close()
            .catch((err) => {
              console.error('Error closing superseded connection:', err);
            });
        }
      } catch (err) {
        if (isActive) {
          console.error('NATS connection failed:', err);
          setConnection(null);
          isConnectingRef.current = false;
        }
      }
    };

    establishConnection().catch((err) => {
      console.error('Unexpected error in connection establishment:', err);
    });

    return () => {
      isActive = false;
      if (connRef.current) {
        connRef.current.close().catch((err) => {
          console.error('Error closing NATS connection:', err);
        });
        connRef.current = null;
        setConnection(null);
      }
      isConnectingRef.current = false;
    };
  }, [url, connectionOptions]);

  return (
    <NatsContext.Provider value={connection}>
      {children}
    </NatsContext.Provider>
  );
};
