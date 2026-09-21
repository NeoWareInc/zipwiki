"use node";

import { internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import Stripe from "stripe";
import {
  clampUsdCents,
  creditsForUsdCents,
  MAX_USD_CENTS,
  MIN_USD_CENTS,
} from "./lib/credits";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}

function webOrigin(): string {
  const site = process.env.SITE_URL?.trim();
  if (site) return site.replace(/\/+$/, "");
  return (process.env.WEB_ORIGIN?.trim() || "http://localhost:5173")
    .split(",")[0]!
    .trim()
    .replace(/\/+$/, "");
}

export const handleWebhook = internalAction({
  args: {
    rawBody: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, { rawBody, signature }) => {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!stripe || !secret) {
      return { ok: false as const, error: "stripe_not_configured", status: 503 };
    }
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      return { ok: false as const, error: "invalid_signature", status: 400 };
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment" && session.payment_status === "paid") {
        const accountId = session.metadata?.accountId;
        const usdCentsRaw = session.metadata?.usdCents;
        const creditsRaw = session.metadata?.credits;
        if (accountId && usdCentsRaw && creditsRaw && session.id) {
          await ctx.runMutation(internal.stripeMutations.grantCreditsFromCheckout, {
            accountId: accountId as never,
            stripeSessionId: session.id,
            usdCents: Number(usdCentsRaw),
            credits: Number(creditsRaw),
          });
        }
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await ctx.runMutation(internal.stripeMutations.syncFromSubscription, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        status: sub.status,
      });
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await ctx.runMutation(internal.stripeMutations.downgradeToFree, {
        stripeCustomerId: customerId,
      });
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id;
      if (customerId) {
        await ctx.runMutation(internal.stripeMutations.markPastDue, {
          stripeCustomerId: customerId,
        });
      }
    }

    return { ok: true as const };
  },
});

/** One-time prepaid credit purchase ($5–$10,000). */
export const createCreditCheckout = action({
  args: { usdCents: v.number() },
  handler: async (
    ctx,
    { usdCents },
  ): Promise<{ url: string; via: "checkout" }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const stripe = getStripe();
    if (!stripe) throw new Error("stripe_not_configured");

    if (
      !Number.isFinite(usdCents) ||
      usdCents < MIN_USD_CENTS ||
      usdCents > MAX_USD_CENTS
    ) {
      throw new Error(
        `Amount must be between $${MIN_USD_CENTS / 100} and $${MAX_USD_CENTS / 100}`,
      );
    }

    const cents = clampUsdCents(usdCents);
    const credits = creditsForUsdCents(cents);

    const account: {
      accountId: string;
      email: string;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      status: string;
    } | null = await ctx.runQuery(internal.stripeMutations.getAccountForUser, {
      userId,
    });
    if (!account) throw new Error("no_account");

    let customerId: string = account.stripeCustomerId ?? "";
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: account.email,
        metadata: { accountId: account.accountId, userId },
      });
      customerId = customer.id;
      await ctx.runMutation(internal.stripeMutations.setStripeCustomerId, {
        accountId: account.accountId as never,
        stripeCustomerId: customerId,
      });
    }

    const dollars = (cents / 100).toFixed(2);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: cents,
            product_data: {
              name: "ZipWiki credits",
              description: `${credits.toLocaleString()} credits ($${dollars})`,
            },
          },
        },
      ],
      success_url: `${webOrigin()}/dashboard/billing?checkout=success`,
      cancel_url: `${webOrigin()}/dashboard/billing?checkout=cancel`,
      metadata: {
        accountId: account.accountId,
        usdCents: String(cents),
        credits: String(credits),
      },
    });
    if (!session.url) throw new Error("checkout_failed");
    return { url: session.url, via: "checkout" };
  },
});

/** @deprecated Prefer createCreditCheckout — kept for leftover callers. */
export const createCheckout = action({
  args: { plan: v.union(v.literal("standard"), v.literal("pro")) },
  handler: async (): Promise<{ url: string; via: "portal" | "checkout" }> => {
    throw new Error(
      "Subscription plans were replaced by prepaid credits. Use createCreditCheckout.",
    );
  },
});

export const createBillingPortal = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const stripe = getStripe();
    if (!stripe) throw new Error("stripe_not_configured");

    const account: {
      stripeCustomerId: string | null;
    } | null = await ctx.runQuery(internal.stripeMutations.getAccountForUser, {
      userId,
    });
    if (!account?.stripeCustomerId) throw new Error("no_customer");

    const portal = await stripe.billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: `${webOrigin()}/dashboard/billing`,
    });
    return { url: portal.url };
  },
});
