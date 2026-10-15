import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './campaign.css';
import './workshop.css';

if (matchMedia('(pointer: coarse)').matches) {
  const viewport = document.querySelector('meta[name="viewport"]');
  const viewportContent = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=overlays-content';
  const pin = () => {
    viewport?.setAttribute('content', viewportContent);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };
  const editable = (event: Event) => (event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]');
  document.addEventListener('contextmenu', event => { if (!editable(event)) event.preventDefault(); });
  document.addEventListener('selectstart', event => { if (!editable(event)) event.preventDefault(); });
  const blockPinch = (event: TouchEvent) => { if (event.touches.length > 1) event.preventDefault(); };
  document.addEventListener('touchmove', blockPinch, { passive: false });
  document.addEventListener('gesturestart', event => event.preventDefault());
  document.addEventListener('focusin', event => { if (editable(event)) { pin(); requestAnimationFrame(pin); } });
  document.addEventListener('focusout', () => requestAnimationFrame(pin));
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
