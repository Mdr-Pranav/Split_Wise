import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Writes this build's files and a version into dist/sw.js, so the service
// worker can cache the whole app on install and drop the old copy on update
function precacheServiceWorker() {
  let files = [];
  let outDir = 'dist';
  return {
    name: 'precache-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    generateBundle(_, bundle) {
      files = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/') && !f.endsWith('.map'))
        .map((f) => `/${f}`)
        .sort();
    },
    closeBundle() {
      const sw = path.join(outDir, 'sw.js');
      if (!fs.existsSync(sw)) return;
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10);
      const src = fs.readFileSync(sw, 'utf8');
      fs.writeFileSync(sw, src.replace("'__BUILD__'", JSON.stringify(version)).replace('[] /* __PRECACHE__ */', JSON.stringify(files)));
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheServiceWorker()],
  server: { port: 5180 },
});
