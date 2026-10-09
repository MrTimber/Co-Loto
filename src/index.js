import { createApp } from './app.js';
import { databaseFrom, openStore } from './store.js';

const port = Number(process.env.PORT ?? 3000);
const database = databaseFrom(process.env);
const store = await openStore(database);
const { httpServer } = createApp({ store });

httpServer.listen(port, () => {
  console.log(`Co-Loto est lancé sur http://localhost:${port} (${database.url ? 'base Turso' : `fichier ${database.file}`})`);
});
