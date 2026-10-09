// Écran d'accueil : affiché quelques secondes à la première page ouverte, une fois par session.
// Script classique placé en tête du <body> pour couvrir la page avant son premier affichage.
(() => {
  const KEY = 'coloto-splash';
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');
  } catch {
    return;
  }
  const splash = document.createElement('div');
  splash.className = 'splash';
  splash.setAttribute('role', 'presentation');
  const img = document.createElement('img');
  img.src = '/img/splash.webp';
  img.alt = 'Co-Loto, créez votre grille de loto ensemble';
  splash.append(img);
  document.body.prepend(splash);

  const close = () => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 400);
  };
  const timer = setTimeout(close, 2500);
  splash.addEventListener('click', () => {
    clearTimeout(timer);
    close();
  });
})();
