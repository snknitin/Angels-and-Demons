import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  signups: defineTable({
    email: v.string(),
    source: v.union(v.literal("waitlist"), v.literal("gate")),
  }).index("by_email", ["email"]),
  dilemmas: defineTable({
    text: v.string(),
    angelCase: v.string(),
    demonCase: v.string(),
    verdict: v.string(),
    angelName: v.string(),
    demonName: v.string(),
    email: v.optional(v.string()),
  }),
  characters: defineTable({
    name: v.string(),
    personaMd: v.string(),
    blurb: v.string(),
    voiceId: v.string(),
    role: v.union(v.literal("angel"), v.literal("demon")),
    byEmail: v.string(),
  }),
});
