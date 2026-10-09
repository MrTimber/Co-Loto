// Service worker : permet d'installer Co-Loto comme une application sur mobile et tablette.
// Module à part, pour que l'enregistrement ne retarde pas le chargement des pages.
if ('serviceWorker' in navigator) {
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('Service worker non enregistré :', err);
  }
}
