import { createStore } from '../../server/store.mjs';
const store = createStore(process.argv[2]);
const release = await store.acquire('execution', 200);
process.send('locked');
process.on('message', async () => { await release(); process.exit(0); });
