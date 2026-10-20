import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  CONTACT_MAX_PER_EMAIL,
  CONTACT_MAX_PER_HOUR,
  contactRateLimited,
  normalizeContact,
} from "./lib/contactForm";

/** Store a contact message after the hourly limits. */
export const record = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const parsed = normalizeContact(args);
    if (!parsed.ok) throw new ConvexError(parsed.error);
    const emailRows = await ctx.db
      .query("contactMessages")
      .withIndex("by_email", (q) => q.eq("email", parsed.value.email))
      .order("desc")
      .take(CONTACT_MAX_PER_EMAIL);
    const recentRows = await ctx.db
      .query("contactMessages")
      .order("desc")
      .take(CONTACT_MAX_PER_HOUR);
    const reason = contactRateLimited({
      emailTimes: emailRows.map((row) => row._creationTime),
      recentTimes: recentRows.map((row) => row._creationTime),
      now: Date.now(),
    });
    if (reason) throw new ConvexError(reason);
    await ctx.db.insert("contactMessages", parsed.value);
  },
});
