import recipesJson from '../data/recipes.json';
import metaJson from '../data/meta.json';

export type Recipe = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  for: string;
  keywords: string[];
  version: number;
  license: string;
  path: string;
  raw: string;
  github: string;
  updated: string | null;
  promise: string;
  italic: string;
  sections: Record<string, string>;
  footer: string;
  markdown: string;
  text: string;
};

export const recipes = recipesJson as Recipe[];
export const meta = metaJson as { commit: string; ref: string; fetchedAt: string; domains: Record<string, number>; count: number };

export const DOMAIN_LABELS: Record<string, string> = { hr: 'HR' };
export const domainLabel = (d: string) => DOMAIN_LABELS[d] || d.charAt(0).toUpperCase() + d.slice(1);

export const FOR_LABELS: Record<string, string> = {
  solo: 'for one person',
  team: 'for a team',
  company: 'for a company',
  community: 'for a community',
};

export const byId = (id: string) => recipes.find((r) => r.id === id);
export const byDomain = (domain: string) => recipes.filter((r) => r.domain === domain);
export const domains = () => Object.keys(meta.domains).sort();

export function formatDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// The human half of a recipe, sections 1 to 6, as Markdown with its headings.
export function humanMarkdown(r: Recipe) {
  const parts = ['The idea', 'How it runs', 'What people look at', 'The rules', 'What must stay true', 'Making it yours'];
  return parts.filter((h) => r.sections[h]).map((h) => `## ${h}\n\n${r.sections[h]}`).join('\n\n');
}

export function buildMarkdown(r: Recipe) {
  return r.sections['Details for building'] ? `## Details for building\n\n${r.sections['Details for building']}` : '';
}
