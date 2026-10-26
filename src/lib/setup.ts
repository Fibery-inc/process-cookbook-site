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

// The browser remembers the tool picked last, under this key.
export const TOOL_KEY = 'processcookbook.tool';

// Fibery's MCP server as an app in ChatGPT; there is no ChatGPT plugin yet.
export const FIBERY_CHATGPT_APP = 'https://chatgpt.com/plugins/plugin_asdk_app_6a2ab6b4009c8191b74cb3b2c70025e3';

export type Assistant = 'claude' | 'chatgpt';

// Answers to Making it yours, once someone gives any, go at the end.
export function setupPrompt(tool: string, title: string, mdUrl: string, answers = '', assistant: Assistant = 'claude') {
  const ask = answers ? 'use my answers to its Making it yours questions below' : 'ask me the few questions in Making it yours';
  const prompts: Record<string, string> = {
    fibery:
      assistant === 'chatgpt'
        ? `Set up "${title}" in Fibery from the recipe at ${mdUrl}: read it, ${ask}, then build it from Details for building with the Fibery app connected to this chat (${FIBERY_CHATGPT_APP}).`
        : `Set up "${title}" in Fibery from the recipe at ${mdUrl}: read it, ${ask}, then build it with the Fibery plugin.`,
    airtable: `Set up "${title}" in Airtable from the recipe at ${mdUrl}: read it, then build the base from Details for building.`,
    notion: `Set up "${title}" in Notion from the recipe at ${mdUrl}: read it, then build the databases and views from Details for building.`,
    lovable: `Build an app for "${title}" from the recipe at ${mdUrl}: read it, then make the tables, pages and rules from Details for building.`,
    other: `Set up "${title}" in [name your tool] from the recipe at ${mdUrl}: read it, then build it from Details for building.`,
  };
  const base = prompts[tool] || prompts.fibery;
  return answers ? `${base} ${answers}` : base;
}

export const claudeLink = (prompt: string) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
export const chatgptLink = (prompt: string) => `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
