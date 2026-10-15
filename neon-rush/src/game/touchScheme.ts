export type TouchScheme = 'buttons' | 'swipes' | 'both';
const KEY = 'neon-rush-touch';
const values: TouchScheme[] = ['buttons', 'swipes', 'both'];
export function readTouchScheme(): TouchScheme {
  try {
    const value = localStorage.getItem(KEY);
    return values.includes(value as TouchScheme) ? value as TouchScheme : 'both';
  } catch { return 'both'; }
}
export function saveTouchScheme(value: TouchScheme) { try { localStorage.setItem(KEY, value); } catch { /* Optional preference. */ } }
