import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const addSignup = mutation({
  args: {
    email: v.string(),
    source: v.union(v.literal("waitlist"), v.literal("gate")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("signups")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .collect();
    if (!existing.some((s) => s.source === args.source)) {
      await ctx.db.insert("signups", args);
    }
  },
});

export const saveDilemma = mutation({
  args: {
    text: v.string(),
    angelCase: v.string(),
    demonCase: v.string(),
    verdict: v.string(),
    angelName: v.string(),
    demonName: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => await ctx.db.insert("dilemmas", args),
});

export const saveCharacter = mutation({
  args: {
    name: v.string(),
    personaMd: v.string(),
    blurb: v.string(),
    voiceId: v.string(),
    role: v.union(v.literal("angel"), v.literal("demon")),
    byEmail: v.string(),
  },
  handler: async (ctx, args) => await ctx.db.insert("characters", args),
});

export const getCharacter = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const nid = ctx.db.normalizeId("characters", id);
    return nid ? await ctx.db.get(nid) : null;
  },
});

export const listCharacters = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("characters").collect(),
});
