// Mesure d'audience faite par le site lui-même, sans outil externe ni cookie :
// chaque page ouverte incrémente des compteurs quotidiens (page, type d'appareil, site d'origine).
// Les visiteurs uniques sont comptés avec une empreinte qui change chaque jour (voir store.js).

// Pages comptées, regroupées : tous les salons sous « /salon », toutes les parties à distance
// sous « /partie », toutes les grilles sous « /grille ».
const PAGES = new Map([
  ['/', '/'],
  ['/index.html', '/'],
  ['/connexion', '/connexion'],
  ['/mon-espace', '/mon-espace'],
  ['/mes-parties', '/mes-parties'],
  ['/confidentialite', '/confidentialite'],
]);

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python|java\/|go-http|headless|lighthouse|pingdom|uptime|render\//i;

export function pagePath(pathname) {
  const known = PAGES.get(pathname);
  if (known) return known;
  const match = /^\/(salon|partie|grille)\/[\w-]{1,40}$/.exec(pathname);
  return match ? `/${match[1]}` : null;
}

export function deviceOf(userAgent = '') {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) return 'tablette';
  if (/Mobi|iPhone|Android/i.test(userAgent)) return 'mobile';
  return 'ordinateur';
}

export const isBot = (userAgent) => !userAgent || BOT.test(userAgent);

// Nom du site d'origine (sans « www. »), seulement s'il s'agit d'un autre site.
export function referrerHost(referer, ownHosts) {
  if (!referer) return null;
  let host;
  try {
    host = new URL(referer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host || ownHosts.has(host)) return null;
  return host.replace(/^www\./, '').slice(0, 100);
}

export function pageViewTracker({ store, env = process.env }) {
  const configured = [env.PUBLIC_URL, env.RENDER_EXTERNAL_URL].flatMap((url) => {
    try {
      return url ? [new URL(url).hostname] : [];
    } catch {
      return [];
    }
  });
  return (req, res, next) => {
    const path = req.method === 'GET' ? pagePath(req.path) : null;
    const userAgent = req.get('user-agent');
    const prefetch = /prefetch|prerender/i.test(req.get('sec-purpose') ?? req.get('purpose') ?? '');
    // Seules les pages ouvertes par un navigateur demandent explicitement du HTML
    // (le contrôle de santé de Render, lui, interroge « / » sans le faire).
    const navigation = (req.get('accept') ?? '').includes('text/html');
    if (path && navigation && !prefetch && !isBot(userAgent)) {
      const ownHosts = new Set([req.hostname, ...configured].map((h) => h?.toLowerCase()));
      store
        .recordPageView({ path, device: deviceOf(userAgent), referrer: referrerHost(req.get('referer'), ownHosts), visitor: `${req.ip}|${userAgent}` })
        .catch((err) => console.error('Mesure d’audience impossible :', err.message));
    }
    next();
  };
}
