import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { PRESETS } from "./personas";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

const http = httpRouter();

const routes: [string, "GET" | "POST", (ctx: any, body: any) => Promise<Response>][] = [
  [
    "/api/argue",
    "POST",
    async (ctx, body) => {
      try {
        return json(await ctx.runAction(api.engine.argue, body));
      } catch (e) {
        console.error("argue failed:", e);
        return json({ error: "The court is in recess. Try again." }, 503);
      }
    },
  ],
  [
    "/api/tts",
    "POST",
    async (ctx, body) => {
      try {
        return json(await ctx.runAction(api.engine.tts, body));
      } catch (e) {
        console.error("tts failed:", e);
        return json({ error: "TTS failed" }, 502);
      }
    },
  ],
  [
    "/api/signup",
    "POST",
    async (ctx, body) => {
      await ctx.runMutation(api.db.addSignup, body);
      return json({ ok: true });
    },
  ],
  [
    "/api/character",
    "POST",
    async (ctx, body) => {
      try {
        return json(await ctx.runAction(api.engine.createCharacter, body));
      } catch (e) {
        console.error("character failed:", e);
        return json({ error: "The court is in recess. Try again." }, 503);
      }
    },
  ],
  [
    "/api/characters",
    "GET",
    async (ctx) => {
      const custom = await ctx.runQuery(api.db.listCharacters, {});
      return json({
        characters: [
          ...PRESETS.map(({ id, name, blurb, voiceId, role }) => ({ id, name, blurb, voiceId, role })),
          ...custom.map((c: any) => ({ id: c._id, name: c.name, blurb: c.blurb, voiceId: c.voiceId, role: c.role })),
        ],
      });
    },
  ],
];

for (const [path, method, handler] of routes) {
  http.route({
    path,
    method,
    handler: httpAction(async (ctx, req) => {
      const body = method === "POST" ? await req.json().catch(() => ({})) : undefined;
      return handler(ctx, body);
    }),
  });
  http.route({
    path,
    method: "OPTIONS",
    handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
  });
}

export default http;
