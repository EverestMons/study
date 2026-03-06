import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Catch unhandled errors — prevents silent white screens
window.addEventListener('error', (e) => {
  const el = document.createElement('pre');
  el.style.cssText = 'color:orange;padding:20px;font-size:12px;white-space:pre-wrap;position:fixed;bottom:0;left:0;right:0;background:#111;z-index:99999;max-height:40vh;overflow:auto';
  el.textContent = 'UNCAUGHT: ' + e.message + '\n' + (e.error?.stack || '');
  document.body.appendChild(el);
});
window.addEventListener('unhandledrejection', (e) => {
  const el = document.createElement('pre');
  el.style.cssText = 'color:orange;padding:20px;font-size:12px;white-space:pre-wrap;position:fixed;bottom:0;left:0;right:0;background:#111;z-index:99999;max-height:40vh;overflow:auto';
  el.textContent = 'UNHANDLED REJECTION: ' + (e.reason?.message || String(e.reason)) + '\n' + (e.reason?.stack || '');
  document.body.appendChild(el);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
