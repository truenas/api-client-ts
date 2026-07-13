# Releasing

## Versioning

This package follows [semver](https://semver.org/). It is **`0.x` while the API is
still unstable** — minor bumps may include breaking changes until `1.0.0`. The public
API surface is exactly what `src/index.ts` re-exports.

## Cutting a release

1. Ensure `main` is green (CI runs `typecheck`, `lint`, `test`, `build`, `check:dist`,
   `check:package` on Node 22 and 24).
2. Bump the version and create a matching tag:
   ```sh
   yarn version <patch|minor|major>   # updates package.json
   git commit -am "release: vX.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```
3. Pushing a `vX.Y.Z` tag triggers the **publish** job in `.github/workflows/ci.yml`,
   which runs after `verify` and publishes to npm via `yarn npm publish`
   (`prepack` rebuilds, so the published tarball is always fresh).

## Registry & auth

- **Registry:** public npm. The package is scoped `@truenas` with
  `publishConfig.access: "public"`.
- **Auth:** the publish job reads `YARN_NPM_AUTH_TOKEN` from the `NPM_TOKEN` repository
  secret. A maintainer must add an npm **automation** token with publish rights to the
  `@truenas` scope as the `NPM_TOKEN` secret before the first release.

> If the target is instead GitHub Packages or an internal registry, change the
> `publishConfig.registry` in `package.json` and the auth in the publish job.

## Local validation

Before tagging you can reproduce what CI checks:

```sh
yarn build
yarn check:dist       # no `@/` alias leak in emitted dist; ESM + CJS both load
yarn check:package    # publint + are-the-types-wrong on the packed tarball
```
