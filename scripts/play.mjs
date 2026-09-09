// Headless duty runner: node scripts/play.mjs 101|201
import { createServer } from "vite";
const which = process.argv[2] ?? "101";
const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const mod = await server.ssrLoadModule("/src/dev/play.ts");
  try {
    const res = which === "502" ? mod.play502() : which === "501" ? mod.play501() : which === "401" ? mod.play401() : which === "301" ? mod.play301() : which === "201" ? mod.play201() : mod.play101();
    console.log(JSON.stringify(res, null, 1));
  } catch (e) {
    console.log(JSON.stringify({ error: String(e.message), ...(mod.last ? mod.last.report() : {}) }, null, 1));
  }
} finally {
  await server.close();
}
