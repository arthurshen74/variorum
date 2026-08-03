import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import {
  deliverBackup,
  deliverExport,
  readDumpFile,
} from '@/components/dialogs/file-io';
import { repository } from '@/persistence/repository';
import { initTheme } from '@/state/theme';

initTheme();

// Dev-console escape hatch until the configuration and transport dialogs
// land: lets a human drive the interface-only functions, e.g.
//   await variorum.repository.createConfiguration(
//     { name: 'linkml', artifactType: 'yaml' },
//     { modelName: 'qwen/qwen3-14b', systemPrompt: 'You are…' })
//   await variorum.repository.exportDatabase(variorum.deliverExport)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).variorum = {
    repository,
    deliverExport,
    deliverBackup,
    readDumpFile,
  };
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('missing #root element');
}
const root = createRoot(container);

// Hydrate-at-boot (DESIGN.md "State Architecture"): the store is the
// working copy of the database before the first render.
repository
  .boot()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    root.render(
      <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
        Failed to open the Variorum database: {String(error)}
      </div>,
    );
  });
