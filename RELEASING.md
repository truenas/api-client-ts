# Releasing

Releases are **fully automated** via [semantic-release](https://semantic-release.gitbook.io/),
modelled on [`truenas-ui-components`](https://github.com/truenas/truenas-ui-components).
There is no manual version bump or tag — the version, changelog, git tag, GitHub
release, and npm publish are all derived from the commit history on `main`.

## How it works

- Every push to `main` runs the `release` job in `.github/workflows/ci.yml` (after
  `verify` passes on Node 22 + 24), which runs `npx semantic-release`.
- `semantic-release` analyzes the [Conventional Commit](https://www.conventionalcommits.org/)
  messages since the last release and decides the next version:

  | Commit type | Release |
  |---|---|
  | `feat`, `fix`, `perf`, `refactor` | patch |
  | any `!` / `BREAKING CHANGE` | minor (while `0.x`) |
  | `docs`, `test`, `build`, `ci`, `chore`, `style` | none |

  If no releasable commits landed, it does nothing.
- The commit subject may be prefixed with `"<ticket> / <version> / "` (the TrueNAS
  convention) — the parser strips it. See `parserOpts.headerPattern` in `.releaserc.json`.

## What contributors do

Just merge PRs with a **Conventional Commit title** — the `Validate PR Title`
workflow enforces this, and a squash merge uses the PR title as the commit subject.
Examples: `feat: add reconnect backoff`, `fix(auth): handle expired token`.

`package.json` keeps `"version": "0.0.0"`; semantic-release computes the real version
from tags at release time (do **not** hand-edit it).

## Registry & auth

- **Registry:** public npm (scope `@truenas`, `publishConfig.access: "public"`).
- **Auth:** the release job needs `NPM_TOKEN` (an npm automation token with publish
  rights to `@truenas`) as a repo secret; `GITHUB_TOKEN` is provided automatically.
- **First release:** semantic-release defaults the very first release to `1.0.0`. To
  start in the `0.x` range instead, push an initial `v0.0.x` git tag before the first
  releasable commit lands.

## Local validation

```sh
yarn build
yarn check:dist       # no `@/` alias leak in emitted dist; ESM + CJS both load
yarn check:package    # publint + are-the-types-wrong on the packed tarball
```
