import { createApp } from './app.js';
import { openStore } from './store.js';

const port = Number(process.env.PORT ?? 3000);
const store = openStore(process.env.DATABASE_FILE ?? 'data/co-loto.db');
const { httpServer } = createApp({ store });

httpServer.listen(port, () => {
  console.log(`Co-Loto est lancé sur http://localhost:${port}`);
});
