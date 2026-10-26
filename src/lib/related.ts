import MiniSearch from 'minisearch';
import { recipes, type Recipe } from './recipes';
import { tokenize, processTerm } from './search';

// Only what a recipe says it is: words that recur in summaries and bodies ("team", "small", "month") link unrelated recipes.
const FIELDS = ['title', 'keywords'];
const MAX = 3;

let index: MiniSearch<Recipe> | null = null;
function getIndex() {
  if (!index) {
    index = new MiniSearch<Recipe>({
      fields: FIELDS,
      storeFields: ['id'],
      tokenize,
      processTerm,
      extractField: (doc, field) => {
        const v = (doc as any)[field];
        return Array.isArray(v) ? v.join(' ') : v;
      },
    });
    index.addAll(recipes);
  }
  return index;
}

// One shared word is chance unless the two recipes are in the same domain; two shared words are a real overlap.
export function relatedRecipes(r: Recipe): Recipe[] {
  const query = [r.title, ...r.keywords].join(' ');
  const byId = new Map(recipes.map((x) => [x.id, x]));
  return getIndex()
    .search(query, { combineWith: 'OR', fields: FIELDS })
    .filter((hit) => hit.id !== r.id)
    .filter((hit) => {
      const shared = new Set(hit.queryTerms).size;
      return shared >= 2 || (shared >= 1 && byId.get(hit.id)?.domain === r.domain);
    })
    .slice(0, MAX)
    .map((hit) => byId.get(hit.id)!)
    .filter(Boolean);
}
