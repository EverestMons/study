// Shared JSZip loader — ensures the CDN script is only appended once
let JSZ = null;
let loading = null;

export function loadJSZip() {
  if (JSZ) return Promise.resolve(JSZ);
  if (window.JSZip) { JSZ = window.JSZip; return Promise.resolve(JSZ); }
  if (loading) return loading;

  loading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = () => { JSZ = window.JSZip; res(JSZ); };
    s.onerror = () => { loading = null; rej(new Error('JSZip load failed')); };
    document.head.appendChild(s);
  });
  return loading;
}
