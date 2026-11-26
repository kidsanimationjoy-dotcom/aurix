import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createDefaultAdapters } from './adapters/registry';
import { AppProvider } from './state/AppState';
import { bootstrap } from './state/bootstrap';
import { IndexedDbBackend, MemoryBackend, type Backend } from './storage/backend';
import { Db } from './storage/db';
import './styles/app.css';

async function start() {
  let backend: Backend = new IndexedDbBackend();
  let persistent = true;
  let db = new Db(backend);
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable');
    await db.load();
  } catch {
    persistent = false;
    backend = new MemoryBackend();
    db = new Db(backend);
    await db.load();
  }
  await bootstrap(db, persistent);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProvider db={db} adapters={createDefaultAdapters()} persistent={persistent}>
        <App />
      </AppProvider>
    </StrictMode>,
  );
}
void start();
