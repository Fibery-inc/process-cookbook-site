import type { APIRoute } from 'astro';
import { findRecipes } from '../../lib/catalog';

export const prerender = false;

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60, s-maxage=300',
};

// GET /api/search?q=&domain=&for=&limit=&debug=1. Without q it lists recipes (a browse); debug adds the matched terms.
export const GET: APIRoute = ({ url }) => {
  const p = url.searchParams;
  const limit = Number(p.get('limit'));
  const result = findRecipes(p.get('q') || '', {
    domain: p.get('domain') || undefined,
    for: p.get('for') || undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    debug: p.get('debug') === '1',
  });
  return new Response(JSON.stringify(result), { headers });
};
