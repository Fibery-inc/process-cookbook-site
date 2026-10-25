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
          'Search the Process Cookbook, an open library of how companies, teams and communities run things. Call it when someone wants to set up, model, understand or run a process (a pipeline, a program, a season, a workflow, a tracker). Returns ranked recipes with id, title, summary and URLs; `fits` is false when nothing really matches, in which case design from the process directly.',
        inputSchema: z.object({
          query: z.string().min(1).describe('The process in the person\'s words, e.g. "volunteer cat rescue" or "repair orders for a phone shop"'),
          domain: z.string().optional().describe('Limit to one domain id, e.g. nonprofit, software, retail'),
          for: z.enum(['solo', 'team', 'company', 'community']).optional().describe('Who runs it'),
          limit: z.number().int().min(1).max(20).optional().describe('How many to return, default 5'),
        }),
      },
      async ({ query, domain, for: f, limit }) => {
        const result = findRecipes(query, { domain, for: f, limit });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] };
      },
    );

    server.registerTool(
      'get_recipe',
      {
        title: 'Get a recipe',
        description:
          'Fetch one recipe by id as Markdown. `part` = "human" for the process in plain words (to explain or run it), "build" for Details for building (the model: databases, fields, states, views, rules), "all" for the whole file (to build it). The recipe is CC BY 4.0; its Build it section is part of the recipe.',
        inputSchema: z.object({
          id: z.string().min(1).describe('The recipe id from find_recipes, e.g. tnr-program'),
          part: z.enum(['human', 'build', 'all']).optional().describe('Which part, default all'),
        }),
      },
      async ({ id, part }) => {
        const r = getRecipe(id, part || 'all');
        if (!r) return { content: [{ type: 'text', text: `No recipe with id "${id}". Use find_recipes to look one up.` }], isError: true };
        const head = `id: ${r.id}\ntitle: ${r.title}\nversion: ${r.version}\nupdated: ${r.updated}\nurl: ${r.url}\nsource: ${r.source}\nlicense: ${r.license}\n\n`;
        return { content: [{ type: 'text', text: head + r.markdown }] };
      },
    );

    server.registerTool(
      'list_domains',
      {
        title: 'List domains',
        description: 'The cookbook\'s domains with recipe counts, for browsing when the query is broad.',
        inputSchema: z.object({}),
      },
      async () => ({ content: [{ type: 'text', text: JSON.stringify({ domains: listDomains(), ...catalogMeta }, null, 1) }] }),
    );
  },
  {
    serverInfo: { name: 'process-cookbook', version: '0.1.0' },
    instructions:
      'The Process Cookbook is an open library (CC BY 4.0) of processes written in plain words with the model to build them in any tool. Use find_recipes when a person wants to set up, understand or run a process; read the recipe with get_recipe before explaining or building it; when fits is false, design from the process directly.',
  },
);

export const GET: APIRoute = ({ request }) => handler(request);
export const POST: APIRoute = ({ request }) => handler(request);
export const DELETE: APIRoute = ({ request }) => handler(request);
