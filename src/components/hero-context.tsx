'use client';

/**
 * Hero primitives shared by the whole app.
 *
 * The context and the clickable hero avatar live in their own module so that
 * the player modal can use them without importing the hero modal back (the
 * hero modal shows player avatars, the player modal shows hero avatars — a
 * direct import between the two files would be a cycle).
 *
 * `HeroModal.tsx` re-exports everything from here, so existing imports
 * (`from './HeroModal'`) keep working unchanged.
 */
import { createContext, useContext } from 'react';
import { identityKey } from '@/lib/normalize';
import { Avatar } from './ui';

/* ---------------------------------------------------------------------------
   Context
--------------------------------------------------------------------------- */

export interface HeroModalContextValue {
  openHero: (name: string) => void;
  /**
   * Artwork of a hero, taken from the IMAGES tab.
   *
   * Every hero avatar resolves its picture through this lookup, so a caller
   * never has to remember to pass `image` — that is how images went missing
   * in some blocks before.
   */
  heroImage: (name: string) => string | null;
}

export const HeroModalContext = createContext<HeroModalContextValue | null>(null);

/**
 * Open the hero modal from anywhere inside the app shell.
 * Outside the provider the call is a no-op, so components stay reusable.
 */
export function useHeroModal(): HeroModalContextValue {
  return useContext(HeroModalContext) ?? { openHero: () => {}, heroImage: () => null };
}

/* ---------------------------------------------------------------------------
   Clickable hero avatar
--------------------------------------------------------------------------- */

/**
 * A hero avatar that opens the hero modal when clicked.
 *
 * The click handler stops the event from bubbling, so a hero avatar inside
 * a clickable table row opens the hero modal and not the row modal.
 */
export function HeroAvatar({
  name,
  image,
  size = 30,
  rounded = 'rounded-lg',
  className = '',
}: {
  name: string;
  image?: string | null;
  size?: number;
  rounded?: string;
  className?: string;
}) {
  const { openHero, heroImage } = useHeroModal();

  // The caller may pass an explicit picture; otherwise it is looked up in the
  // IMAGES tab, so avatars never silently fall back to a monogram.
  const src = image ?? heroImage(name);

  // An empty hero slot renders the plain monogram and is not clickable.
  if (!name.trim()) {
    return <Avatar name={name} image={src} size={size} rounded={rounded} />;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openHero(name);
      }}
      title={`Подробнее о герое: ${name}`}
      aria-label={`Подробнее о герое ${name}`}
      className={`shrink-0 rounded-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${className}`}
    >
      <Avatar name={name} image={src} size={size} rounded={rounded} />
    </button>
  );
}
