import recipesJson from '../data/recipes.json';
import metaJson from '../data/meta.json';
import { numberWord } from './setup';

// What scripts/fetch-recipes.mjs parsed out of a recipe for the page; null where the recipe didn't match.
export type Framed<T> = { intro: string; items: T[]; outro: string };
export type Step = { n: number | null; title: string; gist: string; detail: string };
export type ViewRow = { when: string; view: string; kind: string; answers: string };
export type Rule = { name: string; when: string; does: string };
export type PromiseRow = { core: boolean; promise: string; more: string; keptBy: string };
export type Question = {
  text: string;
  yesNo: boolean;
  defaultLabel: string;
  otherLabel: string;
  defaultNote: string;
  otherNote: string;
  change: string;
};
export type Parsed = {
  steps: Framed<Step> | null;
  views: Framed<ViewRow> | null;
  rules: Framed<Rule> | null;
  promises: Framed<PromiseRow> | null;
  questions: Framed<Question> | null;
  adaptations: { name: string; text: string }[] | null;
  words: { name: string; definition: string }[] | null;
  minutes: { sections: Record<string, number>; human: number; model: number };
  model: { databases: number; views: boolean; app: string | null; reports: number; story: boolean } | null;
};

export type Recipe = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  for: string;
  roles?: string;
  needs?: string;
  parsed?: Parsed;
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

export const HUMAN_SECTIONS = ['The idea', 'How it runs', 'What people look at', 'The rules', 'What must stay true', 'Making it yours'];
export const sectionId = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// The human half of a recipe, sections 1 to 6, as Markdown with its headings.
export function humanMarkdown(r: Recipe) {
  return HUMAN_SECTIONS.filter((h) => r.sections[h]).map((h) => `## ${h}\n\n${r.sections[h]}`).join('\n\n');
}

// "**Every cat fixed.** For a volunteer group…": the bold promise and the sentences after it.
export function promiseParts(r: Recipe) {
  const m = r.promise.match(/^\*\*([\s\S]+?)\*\*\s*([\s\S]*)$/);
  return m ? { bold: m[1].trim(), rest: m[2].trim() } : { bold: '', rest: r.promise.trim() };
}

// "six databases with their fields, states and formulas, the views, the Colony portrait app, one report and a sample story"
export function modelSummary(r: Recipe) {
  const m = r.parsed?.model;
  if (!m) return '';
  const parts = [
    m.databases ? `${numberWord(m.databases)} database${m.databases === 1 ? '' : 's'} with their fields, states and formulas` : '',
    m.views ? 'the views' : '',
    m.app ? `the ${m.app} app` : '',
    m.reports ? `${numberWord(m.reports)} report${m.reports === 1 ? '' : 's'}` : '',
    m.story ? 'a sample story' : '',
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || '';
}

export function buildMarkdown(r: Recipe) {
  return r.sections['Details for building'] ? `## Details for building\n\n${r.sections['Details for building']}` : '';
}
