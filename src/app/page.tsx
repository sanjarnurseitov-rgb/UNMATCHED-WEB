import { Dashboard } from '@/components/Dashboard';
import { loadAppData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const data = await loadAppData();
  return <Dashboard data={data} />;
}
