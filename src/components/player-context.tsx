'use client';

/**
 * Player primitives shared by the whole app.
 *
 * The context, the avatar and the clickable player name live in their own
 * module so that both modals can use them without importing each other:
 * `PlayerModal.tsx` renders the hero avatars of the player profile, and
 * `HeroModal.tsx` renders the player avatars of the hero breakdown — a direct
 * import between the two would be a cycle.
 *
 * `PlayerModal.tsx` re-exports everything from here, so existing imports
 * (`from './PlayerModal'`) keep working unchanged.
 */
import { createContext, useContext } from 'react';
import { identityKey } from '@/lib/normalize';
import { Avatar } from './ui';

/* ---------------------------------------------------------------------------
   Context
--------------------------------------------------------------------------- */

export interface PlayerModalContextValue {
  openPlayer: (name: string) => void;
  /**
   * Artwork of a player, taken from the IMAGES tab.
   *
   * Every player avatar resolves its picture through this lookup, so a caller
   * never has to remember to pass `image` — that is how images went missing
   * in some blocks before.
   */
  playerImage: (name: string) => string | null;
}

export const PlayerModalContext = createContext<PlayerModalContextValue | null>(null);

/**
 * Open the player modal from anywhere inside <PlayerModalProvider>.
 * Outside the provider the call is a no-op, so components stay reusable.
 */
export function usePlayerModal(): PlayerModalContextValue {
  return useContext(PlayerModalContext) ?? { openPlayer: () => {}, playerImage: () => null };
}

/* ---------------------------------------------------------------------------
   Clickable player avatar / name
--------------------------------------------------------------------------- */

/**
 * A player avatar that opens the player modal when clicked.
 *
 * The click handler stops the event from bubbling, so a player avatar inside
 * a clickable table row opens the player modal and not the row modal.
 */
export function PlayerAvatar({
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
  const { openPlayer, playerImage } = usePlayerModal();

  // The caller may pass an explicit picture; otherwise it is looked up in the
  // IMAGES tab, so avatars never silently fall back to a monogram.
  const src = image ?? playerImage(name);

  // An empty player slot renders the plain monogram and is not clickable.
  if (!name.trim()) {
    return <Avatar name={name} image={src} size={size} rounded={rounded} />;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openPlayer(name);
      }}
      title={`Подробнее об игроке: ${name}`}
      aria-label={`Подробнее об игроке ${name}`}
      className={`shrink-0 rounded-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${className}`}
    >
      <Avatar name={name} image={src} size={size} rounded={rounded} />
    </button>
  );
}

/** A player name that opens the player modal when clicked. */
export function PlayerLink({
  name,
  className = '',
}: {
  name: string;
  className?: string;
}) {
  const { openPlayer } = usePlayerModal();

  if (!name.trim()) {
    return <span className={className}>{name}</span>;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openPlayer(name);
      }}
      title={`Подробнее об игроке: ${name}`}
      className={`text-left transition-colors hover:text-gold-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${className}`}
    >
      {name}
    </button>
  );
}
