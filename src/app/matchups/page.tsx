import { AppProviders } from '@/components/AppProviders';
import { Matchups } from '@/components/Matchups';
import { loadAppData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function MatchupsPage() {
  const data = await loadAppData();
  return (
    <AppProviders data={data}>
      <Matchups data={data} />
    </AppProviders>
  );
}
