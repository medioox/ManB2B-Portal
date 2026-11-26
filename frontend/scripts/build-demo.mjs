// Builds the clickable single-file demo: demo-build/index.html (+ data.json + media/).
// JS and CSS are inlined because the artifact sandbox only runs inline scripts.
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "demo-build");
mkdirSync(out, { recursive: true });

const res = await build({
  entryPoints: [path.join(root, "src/demo/main.tsx")],
  bundle: true, minify: true, write: false, format: "iife", target: "es2020",
  jsx: "automatic", loader: { ".tsx": "tsx", ".ts": "ts" },
  alias: { "@": path.join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_API_URL": '""' },
  logLevel: "error",
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

execSync(`npx tailwindcss -c tailwind.config.js -i src/app/globals.css -o ${out}/app.css --minify`, { cwd: root, stdio: "inherit" });
const css = readFileSync(`${out}/app.css`, "utf8");

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
