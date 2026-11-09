import { AppProviders } from '@/components/AppProviders';
import { Dashboard } from '@/components/Dashboard';
import { loadAppData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const data = await loadAppData();
  return (
    <AppProviders data={data}>
      <Dashboard data={data} />
    </AppProviders>
  );
}
