import './store.js';

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/public/sw.js').then(reg => console.log('Service Worker registered:', reg)).catch(err => console.error('SW registration failed:', err));
}
