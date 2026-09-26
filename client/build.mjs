// Standalone client build for Yego (replaces the SDK-owned build).
// Bun.build with the HTML entrypoint; the tailwind plugin compiles theme.css.
import tailwindPlugin from "bun-plugin-tailwind";
import { rm } from "node:fs/promises";

const outdir = new URL("../public/", import.meta.url);

await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [new URL("./index.html", import.meta.url).pathname],
  outdir: outdir.pathname,
  plugins: [tailwindPlugin],
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error("client build failed");
}

console.log(`client build ok -> ${outdir.pathname}`);
for (const out of result.outputs) console.log("  ", out.path);
