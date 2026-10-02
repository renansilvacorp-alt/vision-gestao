import App from '@/src/App';
import { ConfirmProvider } from '@/src/components/ConfirmProvider';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  );
}
