import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import tailwind from '@astrojs/tailwind';

const lifecycleEvent = process.env.npm_lifecycle_event || '';
const isDevScript = lifecycleEvent.startsWith('dev');

export default defineConfig({
  output: 'server',
  adapter: isDevScript ? undefined : netlify(),
  integrations: [tailwind()],
  server: {
    port: 4300,
  },
  preview: {
    port: 4301,
  },
  vite: {
    ssr: {
      // Manter o pdfkit fora do bundle para os ficheiros de fonte (.afm) irem
      // intactos para a função serverless (evita "ENOENT Helvetica.afm" em produção).
      external: ['pdfkit'],
    },
  },
});
