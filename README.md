# Playtools — Extruder

Browser-based 3D extruder for SVG, PNG, and editable vector text. The editor uses Three.js/WebGL and exports transparent or background PNG, embeddable scenes, and OBJ geometry.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

## Builds

```bash
npm run build
npm run build:pages
```

`npm run build` creates the hosted vinext application. `npm run build:pages` creates a fully static GitHub Pages build in `dist-pages`.

## GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` deploys the static application after every push to `main`. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
