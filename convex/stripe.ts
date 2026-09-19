"use node";

import { internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import Stripe from "stripe";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}

function webOrigin(): string {
  return (process.env.WEB_ORIGIN?.trim() || "http://localhost:5173").replace(
    /\/+$/,
    "",
  );
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
        priceId:
          typeof sub.items.data[0]?.price?.id === "string"
            ? sub.items.data[0].price.id
            : null,
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

export const createCheckout = action({
  args: { plan: v.union(v.literal("standard"), v.literal("pro")) },
  handler: async (ctx, { plan }): Promise<{ url: string; via: "portal" | "checkout" }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const stripe = getStripe();
    if (!stripe) throw new Error("stripe_not_configured");

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

    const priceId =
      plan === "standard"
        ? process.env.STRIPE_PRICE_STANDARD?.trim()
        : process.env.STRIPE_PRICE_PRO?.trim();
    if (!priceId) throw new Error("plan_not_available");

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

    if (account.stripeSubscriptionId && account.status === "active") {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${webOrigin()}/dashboard/billing`,
      });
      return { url: portal.url, via: "portal" };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${webOrigin()}/dashboard/billing?checkout=success`,
      cancel_url: `${webOrigin()}/dashboard/billing?checkout=cancel`,
      metadata: { accountId: account.accountId, plan },
    });
    if (!session.url) throw new Error("checkout_failed");
    return { url: session.url, via: "checkout" };
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
