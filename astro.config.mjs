import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.SITE_URL || 'https://processcookbook.org',
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap({ filter: (page) => !page.includes('/api/') && !page.endsWith('/mcp') })],
  trailingSlash: 'never',
  build: { format: 'file' },
});
