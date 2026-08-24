import Image from 'next/image';

/**
 * The Who's on First? wordmark.
 *
 * The PNG is a transparent-background artwork so the app's cream shows
 * through. Two source sizes shipped; next/image handles the responsive
 * srcset from there.
 */
export default function Logo({ width = 180, priority = false }) {
  // Aspect ratio of the cropped artwork: 600 x 560.
  const height = Math.round((width * 560) / 600);
  return (
    <Image
      src="/logo-900.png"
      alt="Who's on First? — Little League Lineup Manager"
      width={width}
      height={height}
      priority={priority}
      style={{ display: 'block', width, height: 'auto' }}
    />
  );
}
