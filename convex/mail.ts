"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Resend } from "resend";
import { OPS_ALERT_EMAIL } from "./lib/adminEmails";

function fromAddress(): string {
  return process.env.AUTH_EMAIL?.trim() || "ZipWiki <onboarding@resend.dev>";
}

async function send(to: string, subject: string, text: string, html: string) {
  const apiKey = process.env.AUTH_RESEND_KEY?.trim();
  if (!apiKey || !to) return { ok: false as const, reason: "mail_not_configured" };
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: [to],
    subject,
    text,
    html,
  });
  if (error) return { ok: false as const, reason: JSON.stringify(error) };
  return { ok: true as const };
}

export const sendLowCredit = internalAction({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }): Promise<{ ok: boolean; reason?: string }> => {
    const account: { email: string } | null = await ctx.runQuery(
      internal.stripeMutations.getAccountBilling,
      { accountId },
    );
    if (!account?.email) return { ok: false as const, reason: "no_email" };
    const origin = (process.env.SITE_URL?.trim() || "https://zipwiki.ai").replace(
      /\/+$/,
      "",
    );
    const billing = `${origin}/dashboard/billing`;
    return await send(
      account.email,
      "Your ZipWiki credits are running low",
      `Your ZipWiki credit balance is at or below $5. Buy more credits to keep hosted LlamaParse and ZipWiki OKF available: ${billing}`,
      `<p style="font-family:sans-serif;font-size:16px;line-height:1.5">Your ZipWiki credit balance is at or below $5.</p>
<p style="font-family:sans-serif;font-size:16px;line-height:1.5">Buy more credits to keep hosted LlamaParse and ZipWiki OKF available.</p>
<p><a href="${billing}">Buy credits</a></p>`,
    );
  },
});

export const sendReceipt = internalAction({
  args: {
    accountId: v.id("accounts"),
    credits: v.number(),
    usdCents: v.number(),
    creditsRemaining: v.number(),
    receiptUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    const account: { email: string } | null = await ctx.runQuery(
      internal.stripeMutations.getAccountBilling,
      { accountId: args.accountId },
    );
    if (!account?.email) return { ok: false as const, reason: "no_email" };
    const dollars = (args.usdCents / 100).toFixed(2);
    const receiptLine = args.receiptUrl
      ? `Stripe receipt: ${args.receiptUrl}`
      : "Stripe will also email its own receipt.";
    return await send(
      account.email,
      `ZipWiki receipt — $${dollars}`,
      `We added ${args.credits.toLocaleString()} credits ($${dollars}). Your balance is ${args.creditsRemaining.toLocaleString()} credits. ${receiptLine}`,
      `<p style="font-family:sans-serif;font-size:16px;line-height:1.5">We added <strong>${args.credits.toLocaleString()}</strong> credits ($${dollars}).</p>
<p style="font-family:sans-serif;font-size:16px;line-height:1.5">Your balance is <strong>${args.creditsRemaining.toLocaleString()}</strong> credits.</p>
${args.receiptUrl ? `<p><a href="${args.receiptUrl}">View the Stripe receipt</a></p>` : `<p style="font-family:sans-serif;font-size:14px;color:#5a6b78">Stripe will also email its own receipt.</p>`}`,
    );
  },
});

/** Ops alert when LlamaParse or Anthropic vendor float crosses the low threshold. */
export const sendLowProviderFloat = internalAction({
  args: {
    slug: v.string(),
    displayName: v.optional(v.string()),
    floatUsdCents: v.optional(v.number()),
    lowFloatUsdCents: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    const provider = await ctx.runQuery(internal.adminBilling.getProviderForAlert, {
      slug: args.slug,
    });
    const displayName =
      args.displayName?.trim() ||
      provider?.displayName ||
      args.slug;
    const floatCents = args.floatUsdCents ?? provider?.floatUsdCents ?? 0;
    const thresholdCents =
      args.lowFloatUsdCents ?? provider?.lowFloatUsdCents ?? 0;
    const origin = (process.env.SITE_URL?.trim() || "https://zipwiki.ai").replace(
      /\/+$/,
      "",
    );
    const billingUrl = `${origin}/admin/billing`;
    const float = (floatCents / 100).toFixed(2);
    const threshold = (thresholdCents / 100).toFixed(2);
    return await send(
      OPS_ALERT_EMAIL,
      `ZipWiki vendor float low — ${displayName}`,
      `${displayName} estimated float is $${float} (threshold $${threshold}). Top up in the vendor console (LlamaCloud or Anthropic billing) and enable their auto-reload / email alerts. Admin billing: ${billingUrl}`,
      `<p style="font-family:sans-serif;font-size:16px;line-height:1.5"><strong>${displayName}</strong> estimated float is <strong>$${float}</strong> (threshold $${threshold}).</p>
<p style="font-family:sans-serif;font-size:16px;line-height:1.5">Top up in the vendor console and turn on their auto-reload / billing alert emails.</p>
<p><a href="${billingUrl}">Open Admin Billing</a> (console links)</p>`,
    );
  },
});
