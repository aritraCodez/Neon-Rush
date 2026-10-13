import type { ArenaInput, ArenaSnapshot } from '../../shared/multiplayer';

type Session = { id: string; token: string; code: string };
export interface ConnectionState {
  status: 'unconfigured' | 'connecting' | 'connected' | 'reconnecting' | 'offline';
  room: ArenaSnapshot | null; playerId: string; online: number | null; latency: number | null; error: string; pending: boolean;
}
const SESSION_KEY = 'neon-rush-arena-session';
function readSession(): Session | null {
  try { const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); return value && typeof value.id === 'string' && /^[a-f0-9]{64}$/.test(value.token) && /^[A-Z2-9]{6}$/.test(value.code) ? value : null; }
  catch { return null; }
}
function endpoint(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_URL?.trim();
  if (!configured && !import.meta.env.DEV) return '';
  try {
    const url = new URL(configured || window.location.origin);
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (!['ws:', 'wss:'].includes(url.protocol) || (location.protocol === 'https:' && url.protocol !== 'wss:')) return '';
    url.pathname = '/ws'; url.search = ''; url.hash = ''; return url.toString();
  } catch { return ''; }
}

export class ArenaClient {
  private url = endpoint();
  private session = readSession();
  private state: ConnectionState = { status: this.url ? 'connecting' : 'unconfigured', room: null, playerId: this.session?.id ?? '', online: null, latency: null, error: '', pending: false };
  private listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private disposed = false;
  private attempt = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private pendingTimeout: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastReceived = 0;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(value: Partial<ConnectionState>) { this.state = { ...this.state, ...value }; this.listeners.forEach(listener => listener()); }
  private remember(session: Session | null) {
    this.session = session;
    try { if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); else sessionStorage.removeItem(SESSION_KEY); } catch { /* Reconnect still works within this page. */ }
  }
  private clearPending() { clearTimeout(this.pendingTimeout); this.patch({ pending: false }); }
  connect = () => {
    this.disposed = false; clearTimeout(this.retry); clearTimeout(this.timeout); clearInterval(this.heartbeat);
    if (!this.url) { this.patch({ status: 'unconfigured' }); return; }
    const previous = this.socket; this.socket = null; previous?.close();
    this.patch({ status: this.session || this.attempt ? 'reconnecting' : 'connecting', error: '', online: null, latency: null });
    const socket = new WebSocket(this.url); this.socket = socket;
    this.timeout = setTimeout(() => { if (this.socket === socket && socket.readyState !== WebSocket.OPEN) socket.close(); }, 45_000);
    socket.onopen = () => {
      if (this.disposed || this.socket !== socket) return;
      clearTimeout(this.timeout); this.attempt = 0; this.lastReceived = Date.now();
      this.patch({ status: 'connected', error: '' });
      if (this.session) this.send({ type: 'resume', ...this.session });
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastReceived > 15_000) { socket.close(); return; }
        this.send({ type: 'ping', sent: Date.now() });
      }, 4000);
      this.send({ type: 'ping', sent: Date.now() });
    };
    socket.onmessage = event => {
      if (this.disposed || this.socket !== socket) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message !== 'object') return;
      this.lastReceived = Date.now();
      switch (message.type) {
        case 'session':
          this.remember({ id: message.id, token: message.token, code: message.code });
          this.clearPending(); this.patch({ playerId: message.id, error: '' }); break;
        case 'snapshot':
          if (message.room && Array.isArray(message.room.players) && Array.isArray(message.room.bullets)) this.patch({ room: message.room }); break;
        case 'hello': case 'presence': if (Number.isFinite(message.online)) this.patch({ online: message.online }); break;
        case 'pong': if (Number.isFinite(message.sent)) this.patch({ latency: Math.max(0, Date.now() - message.sent) }); break;
        case 'left': this.remember(null); this.clearPending(); this.patch({ room: null, playerId: '', error: '' }); break;
        case 'error':
          this.clearPending();
          if (message.code === 'session_expired') { this.remember(null); this.patch({ room: null, playerId: '' }); }
          this.patch({ error: typeof message.message === 'string' ? message.message : 'Unable to complete that action.' }); break;
        case 'shutdown': this.remember(null); this.patch({ room: null, playerId: '', error: message.message }); break;
      }
    };
    socket.onerror = () => { /* onclose owns reconnect and error messaging. */ };
    socket.onclose = event => {
      if (this.disposed || this.socket !== socket) return;
      this.socket = null; clearTimeout(this.timeout); clearInterval(this.heartbeat); this.clearPending();
      if (event.code === 4000) {
        this.remember(null); this.patch({ status: 'offline', room: null, playerId: '', online: null, error: 'This player session was opened in another connection. Reconnect to join with a new name.' }); return;
      }
      this.patch({ status: 'reconnecting', online: null, error: 'Connecting to the arena server. Your match continues during a connection loss.' });
      const delay = Math.min(10_000, 700 * 2 ** Math.min(this.attempt++, 4)) + Math.random() * 400;
      this.retry = setTimeout(this.connect, delay);
    };
  };
  send(message: object) {
    if (this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 8192) return false;
    this.socket.send(JSON.stringify(message)); return true;
  }
  join(name: string, style: string, code?: string) {
    if (this.state.status !== 'connected' || this.state.pending) return;
    this.patch({ pending: true, error: '' });
    if (!this.send({ type: code ? 'join' : 'create', name, style, code })) { this.clearPending(); return; }
    this.pendingTimeout = setTimeout(() => { this.clearPending(); this.patch({ error: 'The server did not respond. Please try again.' }); }, 8000);
  }
  input(value: ArenaInput) { if (this.state.status === 'connected' && this.state.room?.phase === 'playing') this.send({ type: 'input', input: value }); }
  leave() { this.send({ type: 'leave' }); this.remember(null); this.patch({ room: null, playerId: '', error: '' }); }
  dispose() {
    this.disposed = true; clearTimeout(this.retry); clearTimeout(this.timeout); clearTimeout(this.pendingTimeout); clearInterval(this.heartbeat);
    const socket = this.socket; this.socket = null; socket?.close();
  }
}
