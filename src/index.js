import { createApp } from './app.js';
import { devLoginAllowed } from './auth.js';
import { databaseFrom, openStore } from './store.js';

const port = Number(process.env.PORT ?? 3000);
const database = databaseFrom(process.env);
const store = await openStore({ ...database, superadminEmail: process.env.SUPERADMIN_EMAIL });
const { httpServer } = createApp({ store });
const storage = database.url ? 'base Turso' : `fichier ${database.file}`;

httpServer.listen(port, () => {
  console.log(`Co-Loto est lancé sur http://localhost:${port} (${storage})`);
  if (devLoginAllowed(process.env)) console.warn('Compte de test activé (AUTH_DEV_LOGIN=1) : n’importe qui peut se connecter avec n’importe quelle adresse. Développement local seulement.');
  else if (process.env.AUTH_DEV_LOGIN === '1') console.warn('AUTH_DEV_LOGIN=1 ignoré : le compte de test est refusé sur Render, avec NODE_ENV=production et avec la base Turso.');
});
