export const RUNNER_STYLES = [
  { id: 'ion', name: 'Ion', color: '#57e8f5', armor: '#526579', trim: '#dce6ef', description: 'Cold steel. Electric cyan.' },
  { id: 'nova', name: 'Nova', color: '#ff78ce', armor: '#655075', trim: '#ead9ef', description: 'Violet armor. A pink pulse.' },
  { id: 'solar', name: 'Solar', color: '#ffc558', armor: '#78614b', trim: '#f1deaf', description: 'Bronze plating. Solar energy.' },
  { id: 'toxic', name: 'Viper', color: '#bdff54', armor: '#4b655a', trim: '#d4e4bc', description: 'Forest alloy. Acid green.' },
] as const;
export type RunnerStyle = typeof RUNNER_STYLES[number];
export type RunnerAppearance = { color: string; armor: string; trim: string };
export function readRunnerStyle(): RunnerStyle {
  try { return RUNNER_STYLES.find(style => style.id === localStorage.getItem('neon-rush-runner-style')) ?? RUNNER_STYLES[0]; }
  catch { return RUNNER_STYLES[0]; }
}
export function saveRunnerStyle(style: RunnerStyle) {
  try { localStorage.setItem('neon-rush-runner-style', style.id); } catch { /* Session customization still works. */ }
}
