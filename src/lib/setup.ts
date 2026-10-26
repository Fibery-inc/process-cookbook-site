// Shared by the recipe page and its script in the browser, so it must not import the recipe data.

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const numberWord = (n: number) => NUMBERS[n] || String(n);

export const TOOLS = [
  { id: 'fibery', label: 'Fibery' },
  { id: 'airtable', label: 'Airtable' },
  { id: 'notion', label: 'Notion' },
  { id: 'lovable', label: 'Lovable' },
  { id: 'other', label: 'Another tool' },
];

export function allDefaults(n: number) {
  if (n === 1) return 'At its default.';
  if (n === 2) return 'Both at their defaults.';
  return `All ${numberWord(n)} at their defaults.`;
}

// No tool picked yet: the general prompt. Answers, once someone picks any, go at the end.
export function setupPrompt(tool: string | null, title: string, mdUrl: string, answers = '') {
  const ask = answers ? 'use my answers to its Making it yours questions below' : 'ask me the few questions in Making it yours';
  const prompts: Record<string, string> = {
    fibery: `Set up "${title}" in Fibery from the recipe at ${mdUrl}: read it, ${ask}, then build it with the Fibery plugin.`,
    airtable: `Set up "${title}" in Airtable from the recipe at ${mdUrl}: read it, then build the base from Details for building.`,
    notion: `Set up "${title}" in Notion from the recipe at ${mdUrl}: read it, then build the databases and views from Details for building.`,
    lovable: `Build an app for "${title}" from the recipe at ${mdUrl}: read it, then make the tables, pages and rules from Details for building.`,
    other: `Set up "${title}" in my tool from the recipe at ${mdUrl}: read it, ask me which tool I use, then build it from Details for building.`,
  };
  const base = (tool && prompts[tool]) || `Set up the process described at ${mdUrl} in my tool. Read the recipe first; if I use Fibery, use the Fibery plugin.`;
  return answers ? `${base} ${answers}` : base;
}

export const claudeLink = (prompt: string) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
export const chatgptLink = (prompt: string) => `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
