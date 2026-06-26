/**
 * Deterministic user color generator.
 * Given any string (email, nickname), always returns the same HSL color.
 * Used for avatar backgrounds, message bubbles, and typing indicators.
 */
export function stringToColor(str: string): string {
  if (!str) return 'hsl(260, 60%, 55%)';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // Convert to 32bit integer
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

/** Returns 1–2 uppercase initials from an email or nickname. */
export function getInitials(emailOrName: string): string {
  if (!emailOrName) return '?';
  const name = emailOrName.includes('@') ? emailOrName.split('@')[0] : emailOrName;
  const parts = name.trim().split(/[\s._-]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Lightweight avatar component data — no React dependency */
export function avatarProps(emailOrName: string) {
  return {
    color: stringToColor(emailOrName),
    initials: getInitials(emailOrName),
  };
}
