import { useEffect, useState } from 'react';
import type { ArenaClient } from './client';

export function NetworkDiagnostics({ client }: { client: ArenaClient }) {
  const [enabled, setEnabled] = useState(() => new URLSearchParams(location.search).get('netdebug') === '1');
  const [, refresh] = useState(0);
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => { if (event.code === 'F3') { event.preventDefault(); setEnabled(value => !value); } };
    window.addEventListener('keydown', toggle); return () => window.removeEventListener('keydown', toggle);
  }, []);
  useEffect(() => { if (!enabled) return; const timer = setInterval(() => refresh(value => value + 1), 500); return () => clearInterval(timer); }, [enabled]);
  if (!enabled) return null;
  const state = client.getSnapshot(), sim = client.simulation, d = client.diagnostics;
  return <pre className="arena-diagnostics" aria-label="Network diagnostics">{[
    `NETWORK / F3   ${state.status}`,
    `RTT ${state.latency ?? '—'} ms   jitter ${sim.jitter.toFixed(1)} ms`,
    `FPS ${d.fps.toFixed(0)}   server ${sim.room?.tickRate ?? '—'} Hz`,
    `snapshots ${d.snapshots.toFixed(1)}/s   inputs ${d.inputs.toFixed(1)}/s`,
    `pending ${sim.pending.length}   snapshot age ${d.snapshotAge.toFixed(0)} ms`,
    `corrections ${d.correctionsPerSecond.toFixed(1)}/s   last ${sim.correctionMagnitude.toFixed(3)} u`,
    `max correction ${sim.maxCorrection.toFixed(3)} u   step ${sim.room?.serverStepMs ?? '—'} ms`,
    `~ down ${(d.bytesIn / 1024).toFixed(1)} / up ${(d.bytesOut / 1024).toFixed(1)} KiB/s`,
    `socket queue ${d.queuedBytes} bytes`,
  ].join('\n')}</pre>;
}
