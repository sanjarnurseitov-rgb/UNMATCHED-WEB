'use client';

/**
 * Application providers.
 *
 * Both global modals live here so every page gets them: clicking a hero opens
 * the hero profile, clicking a player opens the player profile. The providers
 * are mounted around the page content, so the modals are rendered into
 * <body> through a portal and are never affected by the page layout.
 */
import { HeroModalProvider } from './HeroModal';
import { PlayerModalProvider } from './PlayerModal';
import type { AppData } from '@/lib/types';

export function AppProviders({
  data,
  children,
}: {
  data: AppData;
  children: React.ReactNode;
}) {
  return (
    <HeroModalProvider data={data}>
      <PlayerModalProvider data={data}>{children}</PlayerModalProvider>
    </HeroModalProvider>
  );
}
