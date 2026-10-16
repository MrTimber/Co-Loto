// Envoi des emails (codes de connexion, vérification d'adresse) par un serveur SMTP.
// Sans serveur configuré, les emails sont affichés dans le journal en développement,
// et l'envoi est indisponible sur Render.
import nodemailer from 'nodemailer';

// Renvoie { send({ to, subject, text, preview }) }, ou null si l'envoi est impossible.
export function createMailer(env = process.env) {
  if (env.SMTP_HOST) {
    const port = Number(env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      // 465 : TLS dès la connexion ; sinon STARTTLS, exigé pour ne jamais envoyer en clair.
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
      requireTLS: port !== 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    const from = env.SMTP_FROM || env.SMTP_USER;
    return { send: ({ preview, ...message }) => transport.sendMail({ from, ...message }) };
  }
  if (!env.RENDER) {
    return {
      // Seul l'aperçu (le code, ou le chemin du lien) est écrit dans le journal : il est produit
      // par le serveur, aucune valeur reçue d'une requête (adresse, nom d'hôte) n'y figure.
      async send({ preview }) {
        console.log('[email non envoyé, SMTP non configuré]', preview);
      },
    };
  }
  return null;
}

const SIGNATURE = '\n\n— Co-Loto (co-loto.com), site gratuit sans affiliation avec la Française des Jeux.';

export function loginCodeEmail(code) {
  const text = `Votre code pour vous connecter à Co-Loto : ${code}\n\nIl est valable 15 minutes. Si vous n'avez pas demandé à vous connecter, ignorez cet email : votre compte reste protégé.${SIGNATURE}`;
  return { subject: `Co-Loto : votre code de connexion ${code}`, text, preview: `code de connexion ${code}` };
}

export function verificationEmail(baseUrl, token) {
  const path = `/verifier-email?jeton=${encodeURIComponent(token)}`;
  const link = `${baseUrl}${path}`;
  const text = `Pour vérifier votre adresse email sur Co-Loto, ouvrez ce lien :\n${link}\n\nIl est valable 24 heures. Si vous n'avez pas fait cette demande, ignorez cet email.${SIGNATURE}`;
  return { subject: 'Co-Loto : vérifiez votre adresse email', text, preview: `lien de vérification ${path}` };
}

// Résultat d'une partie à distance : la grille vient d'être simulée.
export function asyncResultEmail(baseUrl, gridId, rules, numbers, bonus) {
  const path = `/grille/${encodeURIComponent(gridId)}`;
  const [, extra] = rules.phases;
  const extraLabel = bonus.length > 1 ? extra.many : extra.one;
  const text = `Tous les joueurs ont classé leurs numéros : votre grille ${rules.name} co-créée est prête !\n\nNuméros : ${numbers.join(', ')}\n${extraLabel[0].toUpperCase()}${extraLabel.slice(1)} : ${bonus.join(', ')}\n\nRetrouvez-la pendant 30 jours à cette adresse, ou dans « Mon espace » :\n${baseUrl}${path}${SIGNATURE}`;
  return { subject: `Co-Loto : votre grille ${rules.name} est prête`, text, preview: `grille à distance prête ${path}` };
}
