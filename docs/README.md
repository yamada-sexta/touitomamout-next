# Touitomamout documentation

The documentation is a static site built with
[Astro Starlight](https://starlight.astro.build/) and Bun. Its dependencies are
isolated from the application in this directory.

Install dependencies and start the development server:

```sh
bun install --frozen-lockfile
bun run dev
```

Create and preview a production build:

```sh
bun run build
bun run preview
```

The production site is written to `dist/`. Pushes to `main` that change the
documentation deploy it to GitHub Pages.
