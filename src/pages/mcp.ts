import type { APIRoute } from 'astro';
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { findRecipes, getRecipe, listDomains, catalogMeta } from '../lib/catalog';

export const prerender = false;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'find_recipes',
      {
        title: 'Find recipes',
        description:
          'Search the Process Cookbook, an open library of how companies, teams and communities run things. Call it when someone wants to set up, model, understand or run a process (a pipeline, a program, a season, a workflow, a tracker). Returns ranked recipes with id, title, summary and URLs; `fits` is false when nothing really matches: then browse (list_domains, or this tool without a query) before deciding, and design from the process directly when nothing on the shelf is it.',
        inputSchema: z.object({
          query: z
            .string()
            .optional()
            .describe('The process in the person\'s words, in any language, e.g. "we look after street cats" or "repair orders for a phone shop"; it matches by meaning as well as words. Leave it out to browse: with domain or for, their recipes; alone, the whole library in domain order.'),
          domain: z.string().optional().describe('Limit to one domain id, e.g. nonprofit, software, retail'),
          for: z.enum(['solo', 'team', 'company', 'community']).optional().describe('Who runs it'),
          limit: z.number().int().min(1).max(50).optional().describe('How many to return: default 5 for a search (max 20), all for a browse (max 50)'),
        }),
      },
      async ({ query, domain, for: f, limit }) => {
        const result = await findRecipes(query, { domain, for: f, limit });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] };
      },
    );

    server.registerTool(
      'get_recipe',
      {
        title: 'Get a recipe',
        description:
          'Fetch one recipe by id as Markdown. To build it, fetch "all" (the default): the model alone is not enough. `part` = "human" for the process in plain words (to explain or run it), with its rules, its promises (What must stay true) and the questions to ask before setting it up (Making it yours); "model" for Details for building only (databases, fields, states, formulas, views), an appendix that depends on the human part: fetch it after "human", never alone; "all" for the whole recipe. The recipe is CC BY 4.0; its Build it section is part of the recipe.',
        inputSchema: z.object({
          id: z.string().min(1).describe('The recipe id from find_recipes, e.g. tnr-program'),
          part: z.enum(['human', 'model', 'all']).optional().describe('Which part, default all; build from all'),
        }),
      },
      async ({ id, part }) => {
        const r = getRecipe(id, part || 'all');
        if (!r) return { content: [{ type: 'text', text: `No recipe with id "${id}". Use find_recipes to look one up.` }], isError: true };
        const head = [
          `id: ${r.id}`,
          `summary: ${r.summary}`,
          `domain: ${r.domain} · for: ${r.for} · version: ${r.version} · updated: ${r.updated}`,
          `keywords: ${r.keywords.join(', ')}`,
          `url: ${r.url} · file: ${r.file} · source: ${r.source}`,
          `license: ${r.license}`,
        ].join('\n');
        return { content: [{ type: 'text', text: `${head}\n\n${r.markdown}` }] };
      },
    );

    server.registerTool(
      'list_domains',
      {
        title: 'List domains',
        description: 'The whole shelf: every domain with its recipes (id, title, summary). Read it when a query is broad or vague, or when find_recipes says nothing fits; a title often names the process the person is describing.',
        inputSchema: z.object({}),
      },
      async () => ({ content: [{ type: 'text', text: JSON.stringify({ domains: listDomains(), ...catalogMeta }, null, 1) }] }),
    );
  },
  {
    serverInfo: { name: 'process-cookbook', version: '0.2.0' },
    instructions:
      'The Process Cookbook is an open library (CC BY 4.0) of processes written in plain words with the model to build them in any tool. Use find_recipes when a person wants to set up, understand or run a process; when fits is false, read list_domains (every recipe with its summary) before concluding there is none; read the recipe with get_recipe before explaining or building it; when nothing on the shelf is it, design from the process directly.',
  },
);

export const GET: APIRoute = ({ request }) => handler(request);
export const POST: APIRoute = ({ request }) => handler(request);
export const DELETE: APIRoute = ({ request }) => handler(request);
