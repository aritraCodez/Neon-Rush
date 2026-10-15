import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './campaign.css';
import './workshop.css';

if (matchMedia('(pointer: coarse)').matches) {
  const editable = (event: Event) => (event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]');
  document.addEventListener('contextmenu', event => { if (!editable(event)) event.preventDefault(); });
  document.addEventListener('selectstart', event => { if (!editable(event)) event.preventDefault(); });
  const blockPinch = (event: TouchEvent) => { if (event.touches.length > 1) event.preventDefault(); };
  document.addEventListener('touchmove', blockPinch, { passive: false });
  document.addEventListener('gesturestart', event => event.preventDefault());
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
