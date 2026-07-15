# @truenas/api-client

Framework-agnostic TypeScript client for the TrueNAS JSON-RPC 2.0 WebSocket API.

> **Status:** early extraction in progress. The client is being pulled out of the TrueNAS Connect UI
> into this standalone package.

## Requirements

- **Node ≥ 22** (provides a global `WebSocket`) or a browser. On older Node, supply a `WebSocket`
  implementation (e.g. the [`ws`](https://www.npmjs.com/package/ws) package) via the socket config.
- **`rxjs` ^7.8** is a peer dependency — the consuming project provides it.

## Documentation

The API reference is generated from the TSDoc comments in the source with
[TypeDoc](https://typedoc.org/) and published to GitHub Pages on every push to `main`:
<https://truenas.github.io/api-client-ts/>

```bash
yarn docs                # generate locally into docs/ (gitignored)
```

## Development

```bash
corepack enable          # once, to enable Yarn 4
yarn install
yarn build               # bundle to dist/ (ESM + CJS + .d.ts) via tsup
yarn typecheck           # tsc --noEmit
yarn test                # vitest
yarn lint                # eslint
```

## Layout

Sources live under `src/`, grouped by role:

```
src/
  connection/   api/   auth/   client/        # the WebSocket client, split by responsibility
  types/   enums/   utils/   config/   errors/
  logger.ts   factory.ts   version-discovery.ts   index.ts
```

Internal modules import each other through the `@/*` path alias (`@/* → src/*`). The alias is a
build-time convenience only — it is inlined away during bundling and never reaches consumers; the public
API is solely what `src/index.ts` (the barrel) re-exports.
