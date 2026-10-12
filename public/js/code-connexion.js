// Code envoyé par email pour terminer une connexion à un compte qui a déjà cette adresse.
const form = document.getElementById('code-form');
const error = document.getElementById('code-error');
const intro = document.getElementById('code-intro');

const pending = await fetch('/api/connexion/code').catch(() => null);
if (pending?.ok) {
  const { email } = await pending.json();
  intro.textContent = `Un compte Co-Loto existe déjà avec l’adresse ${email}. Pour vous y connecter, saisissez le code à 6 chiffres que nous venons d’y envoyer.`;
} else {
  intro.textContent = 'Aucune connexion n’est en attente de code. Reconnectez-vous pour en recevoir un.';
  form.hidden = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  const res = await fetch('/api/connexion/code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: form.code.value }),
  }).catch(() => null);
  const body = await res?.json().catch(() => ({}));
  if (res?.ok) {
    location.href = body.retour;
    return;
  }
  error.textContent = body?.error ?? 'La vérification a échoué, réessayez.';
  if (res?.status === 410) form.hidden = true;
});
