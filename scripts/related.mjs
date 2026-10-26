// Related recipes are the ones whose meaning is close, judged by an embedding model over what each recipe says it is.
// Without OPENAI_API_KEY, or when the API fails, every recipe gets an empty list and the page hides the section.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MODEL = process.env.RELATED_MODEL || 'text-embedding-3-large';
const MIN_SIMILARITY = Number(process.env.RELATED_MIN_SIMILARITY || 0.4);
const MAX = 3;

// Only what the recipe says it is. Promise and body text share the language of every process and pull all scores together.
// Calibrated with text-embedding-3-large: made-up close pairs (Scrum and Shape Up, football and rugby club) scored 0.40 to 0.69,
// the unrelated pairs among the first 13 recipes 0.39 at most.
const embedText = (r) => `${r.title}. ${r.summary}${r.keywords.length ? ` Keywords: ${r.keywords.join(', ')}.` : ''}`;

async function embed(texts, key) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
};

export async function addRelated(recipes, cachePath) {
  for (const r of recipes) r.related = [];
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn('related: no OPENAI_API_KEY; related recipes hidden');
    return;
  }
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const hashes = recipes.map((r) => createHash('sha256').update(`${MODEL}\n${embedText(r)}`).digest('hex'));
  const missing = recipes.map((r, i) => i).filter((i) => !cache[hashes[i]]);
  try {
    if (missing.length) {
      const vectors = await embed(missing.map((i) => embedText(recipes[i])), key);
      missing.forEach((i, k) => (cache[hashes[i]] = vectors[k]));
      mkdirSync(dirname(cachePath), { recursive: true });
      writeFileSync(cachePath, JSON.stringify(Object.fromEntries(hashes.map((h) => [h, cache[h]]))));
    }
  } catch (e) {
    console.warn(`related: ${e.message}; related recipes hidden`);
    return;
  }
  const vectors = hashes.map((h) => cache[h]);
  recipes.forEach((r, i) => {
    const scored = recipes
      .map((x, j) => ({ id: x.id, score: j === i ? -1 : cosine(vectors[i], vectors[j]) }))
      .filter((x) => x.score >= MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX);
    r.related = scored.map((x) => x.id);
    if (process.env.RELATED_DEBUG) console.log(`related ${r.id}: ${recipes.map((x, j) => (j === i ? null : [x.id, cosine(vectors[i], vectors[j])])).filter(Boolean).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, s]) => `${id} ${s.toFixed(2)}`).join(' | ')}`);
  });
}
