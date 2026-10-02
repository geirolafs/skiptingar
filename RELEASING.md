# Releasing skiptingar

This file is not in `files`, so it is not published. A release is a tag push:
the workflow `.github/workflows/publish.yml` tests, builds and
publishes with npm trusted publishing. There is no npm token anywhere.

## One time

Open the package on npmjs.com: `skiptingar` → Settings → Trusted publisher →
GitHub Actions. Fill in:

- Organization or user: `geirolafs`
- Repository: `skiptingar`
- Workflow filename: `publish.yml`
- Environment name: leave empty
- Allowed actions: tick `npm publish`. Setups made after 3 September 2026
  allow only `npm stage publish` by default, and the workflow runs
  `npm publish`.

Then, under Settings → Publishing access, pick "Require two-factor
authentication and disallow tokens".

The package name already exists on npm (a `0.0.0` placeholder), so the settings
page is there. Trusted publishing needs npm 11.5.1 or newer and Node 22.14 or
newer; the workflow sets both up.

## Each release

1. In `CHANGELOG.md`, change the top heading to the version and date. For
   `0.1.0`, replace `(not released)`.
2. In `README.md`, replace the "Not on npm yet" wording with the install
   instructions. Do this for `0.1.0` only.
3. Set `version` in `package.json`.
4. Run `bun run size` and `bun run tests:count`, since `sizes.json` and
   `tests.json` ship in the package.
5. Commit and push `master`.
6. Tag the commit: `git tag vX.Y.Z`
7. Push the tag: `git push origin vX.Y.Z`

The workflow stops if the tag version differs from `package.json`. Watch the
run in the Actions tab. When it is green, the version is on npm with a
provenance badge.
