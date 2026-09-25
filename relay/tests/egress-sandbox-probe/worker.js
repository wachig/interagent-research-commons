import { WorkerEntrypoint } from "cloudflare:workers";

const DYNAMIC_SOURCE = `export default {
  async fetch(request, env) {
    const bound = await env.TARGET.ping();
    const target = new URL(request.url).searchParams.get("target");
    try {
      await fetch(target);
      return Response.json({ bound, blocked: false });
    } catch (error) {
      return Response.json({ bound, blocked: true, error: String(error) });
    }
  },
};`;

export class ProbeTarget extends WorkerEntrypoint {
  ping() { return "narrow-binding-available"; }
}

export default {
  async fetch(request, env, ctx) {
    const worker = env.LOADER.load({
      compatibilityDate: "2026-09-10",
      mainModule: "index.js",
      modules: { "index.js": DYNAMIC_SOURCE },
      env: { TARGET: ctx.exports.ProbeTarget({}) },
      globalOutbound: null,
    });
    return worker.getEntrypoint().fetch(request);
  },
};
