'use client';

/**
 * Application providers — the single host of both global modals.
 *
 * Clicking a hero opens the hero profile, clicking a player opens the player
 * profile. Both modals are rendered into <body> through a portal, so they
 * are never affected by the page layout.
 *
 * Both portals live here, above both contexts, on purpose: the hero modal
 * shows player avatars and the player modal shows hero avatars, so each one
 * needs the context of the other. Two nested providers cannot give that to
 * each other — a portal escapes the provider it was rendered inside — so both
 * contexts are provided here, above both portals.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { identityKey } from '@/lib/normalize';
import type { AppData, DetailedRecord, HeroProfile } from '@/lib/types';
import { HeroModal } from './HeroModal';
import { PlayerModal } from './PlayerModal';
import { HeroModalContext, HeroModalContextValue } from './hero-context';
import { PlayerModalContext, PlayerModalContextValue } from './player-context';

export function AppProviders({
  data,
  children,
}: {
  data: AppData;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedHero, setSelectedHero] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  // The modals are rendered into <body> through a portal, so they can never be
  // offset by a transformed ancestor.
  useEffect(() => setMounted(true), []);

  const heroProfiles = useMemo(() => {
    const map = new Map<string, HeroProfile>();
    for (const profile of data.stats.heroProfiles) {
      map.set(identityKey(profile.name), profile);
    }
    return map;
  }, [data.stats.heroProfiles]);

  const playerRecords = useMemo(() => {
    const map = new Map<string, DetailedRecord>();
    for (const record of data.stats.players) {
      map.set(identityKey(record.name), record);
    }
    return map;
  }, [data.stats.players]);

  const hero = selectedHero ? heroProfiles.get(identityKey(selectedHero)) ?? null : null;
  const player = selectedPlayer ? playerRecords.get(identityKey(selectedPlayer)) ?? null : null;

  /*
   * Artwork lookups. Keyed by the normalized name so that the different
   * spellings of the same hero or player always resolve to the same picture.
   */
  const heroImages = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of data.reference.heroes) {
      if (entry.image) map.set(identityKey(entry.name), entry.image);
    }
    return map;
  }, [data.reference.heroes]);

  const playerImages = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of data.reference.players) {
      if (entry.image) map.set(identityKey(entry.name), entry.image);
    }
    return map;
  }, [data.reference.players]);

  /*
   * Escape closes the topmost modal only, so closing the player modal that
   * was opened from the hero modal returns to the hero modal.
   */
  const modalOpen = Boolean(hero || player);
  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (player) setSelectedPlayer(null);
      else if (hero) setSelectedHero(null);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen, hero, player]);

  const heroValue = useMemo<HeroModalContextValue>(
    () => ({
      openHero: (name: string) => setSelectedHero(name),
      heroImage: (name: string) => heroImages.get(identityKey(name)) ?? null,
    }),
    [heroImages],
  );

  const playerValue = useMemo<PlayerModalContextValue>(
    () => ({
      openPlayer: (name: string) => setSelectedPlayer(name),
      playerImage: (name: string) => playerImages.get(identityKey(name)) ?? null,
    }),
    [playerImages],
  );

  return (
    <HeroModalContext.Provider value={heroValue}>
      <PlayerModalContext.Provider value={playerValue}>
        {children}
        {mounted && hero
          ? createPortal(
              <HeroModal
                profile={hero}
                matches={data.matches}
                onClose={() => setSelectedHero(null)}
              />,
              document.body,
            )
          : null}
        {mounted && player
          ? createPortal(
              <PlayerModal
                record={player}
                matches={data.matches}
                heroImages={Object.fromEntries(
                  data.reference.heroes.map((h) => [h.name, h.image ?? null]),
                )}
                onClose={() => setSelectedPlayer(null)}
              />,
              document.body,
            )
          : null}
      </PlayerModalContext.Provider>
    </HeroModalContext.Provider>
  );
}
