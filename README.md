# Process Cookbook site

The website and the search endpoint of the [Process Cookbook](https://github.com/Fibery-inc/process-cookbook), an open library of how companies, teams and communities run things.

The recipes live in the cookbook repo and only there. On every build this project clones it, turns each recipe into JSON, and prints two things from the same files: the static site (a page and a raw `.md` per recipe, domain pages, collections, `llms.txt`, a sitemap) and the search index that the search page, the REST routes and the MCP endpoint share.

## Run it locally

```bash
npm install
npm run dev        # fetches the cookbook, then http://localhost:4321
npm run build      # fetches, then builds to .vercel/output
```

`npm run fetch` alone refreshes `src/data/*.json` and `public/search-index.json`. Set `COOKBOOK_REF` to build from a branch or tag, or `COOKBOOK_DIR=/path/to/clone` to build from a local clone.

## What it serves

| Path | What |
| --- | --- |
| `/` | Home: search, recipes, collections, requested recipes, contribute |
| `/r/<id>` | A recipe page; `/r/<id>.md` is the recipe file itself |
| `/d/<domain>`, `/domains`, `/recipes`, `/collections/<id>` | Browsing |
| `/search?q=` | Search in the browser (MiniSearch over `search-index.json`) |
| `/api/search?q=&domain=&for=&limit=` | The same search as JSON, for agents and other sites; without `q` it lists recipes; `&debug=1` adds the matched terms |
| `/api/recipes/<id>?part=human\|build\|all` | One recipe as JSON with its Markdown (frontmatter folded into the fields) |
| `/api/domains` | Domains with counts and their recipes |
| `/mcp` | MCP (streamable HTTP, no sign-in): `find_recipes` (search, or browse without a query), `get_recipe`, `list_domains` |

Search is MiniSearch (BM25) over title, keywords, summary, the promise line and the human sections, with stopwords dropped, plurals folded, prefix matching from four letters and fuzzy matching from five; a result `fits` when most of the query's content words are in the best hit and at least half of them in its header fields, or the hit leaves the runner-up far behind.
| `/llms.txt`, `/sitemap-index.xml`, `/robots.txt` | For crawlers and assistants |

Requested recipes are GitHub issues on the cookbook labelled `recipe request`; 👍 reactions are the votes. The build reads them from the GitHub API.

## Deploy on Vercel

1. Import this repository in Vercel (framework preset: Astro; no environment variables needed). Every push to `main` deploys.
2. Set `SITE_URL` in the project's environment variables once the domain is known (default `https://processcookbook.org`); it drives canonical URLs, the sitemap and the URLs the endpoint returns.
3. Create a Deploy Hook in Vercel (Settings → Git → Deploy Hooks) and add it as a secret `VERCEL_DEPLOY_HOOK` on the cookbook repo, with this step at the end of the cookbook's `.github/workflows/check.yml` for pushes to `main`:

   ```yaml
   - name: Rebuild the site
     if: github.event_name == 'push' && github.ref == 'refs/heads/main'
     run: curl -fsS -X POST "${{ secrets.VERCEL_DEPLOY_HOOK }}"
   ```

   A merged recipe is then live on the site, in the search index and on the MCP endpoint about two minutes later.
4. Add the domain under Settings → Domains.

## Connect an agent

Claude: Customize → Connectors → Add custom connector, URL `https://<your deployment>/mcp`, no authentication. Any MCP client that speaks streamable HTTP works the same way; stdio-only clients can use `npx mcp-remote <url>`.

## Layout

- `scripts/fetch-recipes.mjs`: clones the cookbook, parses headers and sections, writes the JSON files (git-ignored).
- `src/lib/search.ts`: the MiniSearch index, used in the browser and on the server.
- `src/lib/catalog.ts`: what the REST routes and the MCP tools share.
- `src/pages/mcp.ts`: the MCP server, on [mcp-handler](https://www.npmjs.com/package/mcp-handler).
- `src/data/collections.json`: the curated collections (the one piece of content that lives here, not in the cookbook).

## License

MIT for this code. The recipes are CC BY 4.0, from the cookbook.
