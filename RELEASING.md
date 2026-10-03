# Releasing skiptingar

This file is not in `files`, so it is not published. A release is a tag push:
the workflow `.github/workflows/publish.yml` tests, builds, checks that
every built entry loads (`check:dist`) and publishes with npm trusted
publishing. There is no npm token anywhere.

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

Trusted publishing needs npm 11.5.1 or newer and Node 22.14 or newer; the
workflow sets both up.

## Each release

1. In `CHANGELOG.md`, change the top heading to the version and date.
2. Set `version` in `package.json`.
3. Run `bun run size` and `bun run tests:count`, since `sizes.json` and
   `tests.json` ship in the package. Then run `bun run build` and
   `bun run check:dist`, which CI and the publish workflow also run.
4. Commit and push `master`.
5. Tag the commit: `git tag vX.Y.Z`
6. Push the tag: `git push origin vX.Y.Z`

The workflow stops if the tag version differs from `package.json`. Watch the
run in the Actions tab. When it is green, the version is on npm with a
provenance badge, and a GitHub Release for the tag holds that version's
`CHANGELOG.md` section. So the top heading must be `## X.Y.Z (date)`, or the
release step fails after the publish.
