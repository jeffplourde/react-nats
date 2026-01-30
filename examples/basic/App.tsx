import { NatsProvider, useNatsKvTable } from 'react-nats';

// Example data type
interface Price {
  symbol: string;
  price: number;
  timestamp: number;
}

// JSON decoder utility
const jsonDecoder = {
  decode: (data: Uint8Array) => JSON.parse(new TextDecoder().decode(data)),
};

function PriceTable() {
  const prices = useNatsKvTable<Price>({
    bucketName: 'prices',
    decoder: jsonDecoder,
    refreshInterval: 100, // Update UI every 100ms
  });

  return (
    <div>
      <h2>Live Prices</h2>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>Last Update</th>
          </tr>
        </thead>
        <tbody>
          {prices.map((entry) => (
            <tr key={entry.key}>
              <td>{entry.value.symbol}</td>
              <td>${entry.value.price.toFixed(2)}</td>
              <td>{new Date(entry.created).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  return (
    <NatsProvider url="ws://localhost:4222">
      <div className="App">
        <h1>NATS React Example</h1>
        <PriceTable />
      </div>
    </NatsProvider>
  );
}
