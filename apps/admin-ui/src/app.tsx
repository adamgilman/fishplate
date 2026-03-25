import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkflowView } from './routes/workflow-view';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkflowView />
    </QueryClientProvider>
  );
}
