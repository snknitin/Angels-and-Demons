"use node";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { ANGEL_MD, DEMON_MD, PRESETS } from "./personas";

async function llm(system: string, user: string): Promise<string> {
  const res = await fetch(process.env.LLM_API_URL!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      // gpt-5.6-sol only supports the default temperature (1); omit it.
      model: process.env.LLM_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message.content;
}

// Defensive parse: strip fences/prose, grab the outermost {...}
function parseJson(text: string): any {
  const m = text.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text);
}

async function llmJson(system: string, user: string): Promise<any> {
  try {
    return parseJson(await llm(system, user));
  } catch {
    return parseJson(await llm(system, user)); // one retry per spec
  }
}

async function linkup(q: string): Promise<{ snippets: string; source?: string }> {
  try {
    const res = await fetch("https://api.linkup.so/v1/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.LINKUP_API_KEY}`,
      },
      body: JSON.stringify({ q, depth: "standard", outputType: "searchResults" }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { snippets: "" };
    const data = await res.json();
    const top = (data.results ?? []).slice(0, 3);
    return {
      snippets: top
        .map((r: any) => `- ${r.content ?? r.snippet ?? ""} (source: ${r.name ?? r.url ?? "web"})`)
        .join("\n"),
      source: top[0]?.name ?? top[0]?.url,
    };
  } catch {
    return { snippets: "" }; // proceed with no evidence per spec
  }
}

async function resolvePersona(
  ctx: any,
  id: string | undefined,
  fallback: { name: string; md: string }
): Promise<{ name: string; md: string }> {
  if (id) {
    const preset = PRESETS.find((p) => p.id === id);
    if (preset) return { name: preset.name, md: preset.personaMd };
    const c = await ctx.runQuery(api.db.getCharacter, { id });
    if (c) return { name: c.name, md: c.personaMd };
  }
  return fallback;
}

export const argue = action({
  args: {
    dilemma: v.string(),
    angelId: v.optional(v.string()),
    demonId: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const angel = await resolvePersona(ctx, args.angelId, { name: "Seraphina", md: ANGEL_MD });
    const demon = await resolvePersona(ctx, args.demonId, { name: "Baz", md: DEMON_MD });
    const evidence = await linkup(args.dilemma);

    const system = `You stage a comic courtroom: two characters argue a human's dilemma.

ANGEL — argues ONLY from BEHAVIOR: habits, track record, what they actually do.
${angel.md}

DEMON — argues ONLY from DESIRE: what they want, the upside, the bold move.
${demon.md}

Web evidence (may be empty; if present the Demon cites ONE item, naming the source):
${evidence.snippets}

Rules: each case 60–90 words, in character, funny but genuinely persuasive,
PG-13, no moralizing disclaimers. Verdict: max 25 words, picks a side, gives
one concrete next step.
Reply with JSON only: {"angel":"...","demon":"...","verdict":"..."}`;

    const out = await llmJson(system, args.dilemma);

    const dilemmaId = await ctx.runMutation(api.db.saveDilemma, {
      text: args.dilemma,
      angelCase: out.angel,
      demonCase: out.demon,
      verdict: out.verdict,
      angelName: angel.name,
      demonName: demon.name,
      email: args.email,
    });

    return {
      dilemmaId,
      angel: { name: angel.name, text: out.angel },
      demon: { name: demon.name, text: out.demon, ...(evidence.source ? { source: evidence.source } : {}) },
      verdict: out.verdict,
    };
  },
});

export const tts = action({
  args: {
    text: v.string(),
    who: v.union(v.literal("angel"), v.literal("demon")),
    voiceId: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const voiceId =
      args.voiceId ?? (args.who === "angel" ? process.env.VOICE_ANGEL : process.env.VOICE_DEMON);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      },
      body: JSON.stringify({ text: args.text, model_id: "eleven_turbo_v2_5" }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
    return { audio: Buffer.from(await res.arrayBuffer()).toString("base64") };
  },
});

export const createCharacter = action({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    voiceId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(api.db.addSignup, { email: args.email, source: "gate" });

    // ponytail: "name looks original" heuristic = description provided means
    // skip research; refine only if custom characters come out generic.
    const research = args.description
      ? { snippets: "" }
      : await linkup(`${args.name} personality traits catchphrases speech style`);

    const system = `You write persona cards for a comic courtroom app where an Angel and a Demon argue a human's dilemmas.
Write a persona for "${args.name}".
${args.description ? `User description: ${args.description}` : ""}
${research.snippets ? `Web research:\n${research.snippets}` : ""}
The personaMd must use exactly this markdown format:
# Identity
<one line>
# Argues from
<Behavior or Desire, one line on their angle>
# Speech style
<one line>
# Iconic phrases
"<phrase>" / "<phrase>"
Also write a one-line blurb and pick a role: "angel" (argues from behavior/caution) or "demon" (argues from desire/boldness).
Reply with JSON only: {"personaMd":"...","blurb":"...","role":"angel"}`;

    const out = await llmJson(system, `Create the persona for ${args.name}.`);
    const role = out.role === "demon" ? "demon" : "angel";

    const characterId = await ctx.runMutation(api.db.saveCharacter, {
      name: args.name,
      personaMd: out.personaMd,
      blurb: out.blurb,
      voiceId: args.voiceId,
      role,
      byEmail: args.email,
    });

    return { characterId, name: args.name, blurb: out.blurb };
  },
});
