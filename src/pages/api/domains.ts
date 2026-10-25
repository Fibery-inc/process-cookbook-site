import type { APIRoute } from 'astro';
import { listDomains, catalogMeta } from '../../lib/catalog';

export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ domains: listDomains(), ...catalogMeta }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60, s-maxage=300' },
  });
