import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <h1 className="p-4 text-xl font-semibold">Fishplate — Workflow Monitor</h1>
      </div>
    </QueryClientProvider>
  );
}
