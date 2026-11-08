import { Dashboard } from '@/components/Dashboard';
import { HeroModalProvider } from '@/components/HeroModal';
import { loadAppData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const data = await loadAppData();
  return (
    <HeroModalProvider data={data}>
      <Dashboard data={data} />
    </HeroModalProvider>
  );
}
