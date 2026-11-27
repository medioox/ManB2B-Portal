// Builds the clickable demo (real UI + in-browser mock API).
//   node scripts/build-demo.mjs               → demo-build/index.html, JS/CSS inlined (Claude artifact sandbox)
//   node scripts/build-demo.mjs --standalone  → demo-server/site/ for any web server (local fonts, no CDN)
// Both expect data.json (manage.py export_demo) and media/ next to the page.
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const standalone = process.argv.includes("--standalone");
const out = standalone ? path.join(root, "..", "deploy", "demo-server", "site") : path.join(root, "demo-build");
mkdirSync(out, { recursive: true });

const res = await build({
  entryPoints: [path.join(root, "src/demo/main.tsx")],
  bundle: true, minify: true, write: false, format: "iife", target: "es2020",
  jsx: "automatic", loader: { ".tsx": "tsx", ".ts": "ts" },
  alias: { "@": path.join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_API_URL": '""',
    // own server: real URLs (refresh / share a page); artifact sandbox: in-memory routing
    "process.env.DEMO_ROUTER": standalone ? '"history"' : '"memory"' },
  logLevel: "error",
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

execSync(`npx tailwindcss -c tailwind.config.js -i src/app/globals.css -o ${out}/app.css --minify`, { cwd: root, stdio: "inherit" });
const css = readFileSync(`${out}/app.css`, "utf8");

if (standalone) {
  // Self-contained: fonts served from the same server (Google Fonts may be unreachable).
  const fontDir = path.join(out, "fonts");
  mkdirSync(fontDir, { recursive: true });
  const weights = { Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, Black: 900 };
  let faces = "";
  for (const [name, w] of Object.entries(weights)) {
    cpSync(path.join(root, `node_modules/vazirmatn/fonts/webfonts/Vazirmatn-${name}.woff2`), path.join(fontDir, `Vazirmatn-${name}.woff2`));
    faces += `@font-face{font-family:Vazirmatn;font-weight:${w};font-display:swap;src:url(fonts/Vazirmatn-${name}.woff2) format("woff2")}`;
  }
  const v = Date.now().toString(36);
  writeFileSync(path.join(out, "app.js"), js);
  writeFileSync(path.join(out, "app.css"), faces + css);
  cpSync(path.join(root, "public/icons"), path.join(out, "icons"), { recursive: true });
  const demo = path.join(root, "demo-build");
  if (existsSync(path.join(demo, "data.json"))) cpSync(path.join(demo, "data.json"), path.join(out, "data.json"));
  if (existsSync(path.join(demo, "media"))) cpSync(path.join(demo, "media"), path.join(out, "media"), { recursive: true });
  writeFileSync(path.join(out, "index.html"), `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1F3A5F">
<base href="/">
<title>پرتال فروش عمده‌ی مَن — نسخه‌ی دمو</title>
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<link rel="stylesheet" href="app.css?v=${v}">
<style>html,body{background:#F6F0E4;color:#1C2733;margin:0}body{font-family:Vazirmatn,Tahoma,sans-serif}#app{min-height:100vh}</style>
</head>
<body>
<div id="app"><div style="min-height:100vh;display:grid;place-items:center;color:#7A7263">در حال بارگذاری پرتال مَن…</div></div>
<script src="app.js?v=${v}"></script>
</body>
</html>
`);
  console.log(`standalone demo → ${out}`);
  process.exit(0);
}

const html = `<title>پرتال مَن</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;900&display=swap">
<style>${css}
html,body{background:#F6F0E4;color:#1C2733}
body{direction:rtl;font-family:Vazirmatn,Tahoma,sans-serif}
#app{min-height:100vh}
</style>
<div id="app" dir="rtl" lang="fa"><div style="min-height:100vh;display:grid;place-items:center;font-family:Vazirmatn,Tahoma,sans-serif;color:#7A7263">در حال بارگذاری پرتال مَن…</div></div>
<script>${js}</script>
`;
writeFileSync(path.join(out, "index.html"), html);
console.log(`demo: ${(html.length / 1024).toFixed(0)} KB → ${out}/index.html`);
