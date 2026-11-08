import { HeroModalProvider } from '@/components/HeroModal';
import { Matchups } from '@/components/Matchups';
import { loadAppData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function MatchupsPage() {
  const data = await loadAppData();
  return (
    <HeroModalProvider data={data}>
      <Matchups data={data} />
    </HeroModalProvider>
  );
}
