import type { APIRoute } from 'astro';
import { findRecipes } from '../../lib/catalog';

export const prerender = false;

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60, s-maxage=300',
};

export const GET: APIRoute = ({ url }) => {
  const q = url.searchParams.get('q') || '';
  if (!q.trim()) {
    return new Response(JSON.stringify({ error: 'q is required', example: '/api/search?q=volunteer+cats' }), { status: 400, headers });
  }
  const result = findRecipes(q, {
    domain: url.searchParams.get('domain') || undefined,
    for: url.searchParams.get('for') || undefined,
    limit: Number(url.searchParams.get('limit') || 5),
  });
  return new Response(JSON.stringify(result), { headers });
};
