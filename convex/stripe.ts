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
import { resolveAuthRedirect } from "./authRedirects";

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

/** Dashboard on the site the buyer started from, when that origin is allowed. */
function dashboardUrl(returnOrigin?: string): string {
  const origin = returnOrigin?.trim().replace(/\/+$/, "");
  if (origin) return resolveAuthRedirect(`${origin}/dashboard`);
  return `${webOrigin()}/dashboard`;
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
          const charge = await paymentDetails(stripe, session.payment_intent);
          await ctx.runMutation(internal.stripeMutations.grantCreditsFromCheckout, {
            accountId: accountId as never,
            stripeSessionId: session.id,
            stripePaymentIntentId: charge.paymentIntentId,
            usdCents: Number(usdCentsRaw),
            credits: Number(creditsRaw),
            receiptUrl: charge.receiptUrl,
          });
          if (charge.paymentMethodId) {
            await ctx.runMutation(internal.stripeMutations.setStripePaymentMethod, {
              accountId: accountId as never,
              stripePaymentMethodId: charge.paymentMethodId,
            });
          }
        }
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata?.source === "auto_reload") {
        const accountId = intent.metadata.accountId;
        const usdCentsRaw = intent.metadata.usdCents;
        const creditsRaw = intent.metadata.credits;
        if (accountId && usdCentsRaw && creditsRaw) {
          const charge = await paymentDetails(stripe, intent.id);
          await ctx.runMutation(internal.stripeMutations.grantCreditsFromCheckout, {
            accountId: accountId as never,
            stripePaymentIntentId: intent.id,
            usdCents: Number(usdCentsRaw),
            credits: Number(creditsRaw),
            receiptUrl: charge.receiptUrl,
            clearReloadPending: true,
          });
        }
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata?.source === "auto_reload" && intent.metadata.accountId) {
        await ctx.runMutation(internal.stripeMutations.markReloadFailed, {
          accountId: intent.metadata.accountId as never,
          error: intent.last_payment_error?.message ?? "payment_failed",
        });
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
  args: { usdCents: v.number(), returnOrigin: v.optional(v.string()) },
  handler: async (
    ctx,
    { usdCents, returnOrigin },
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
              // Managed Payments requires an eligible tax code. Credits pay for
              // hosted cloud AI (parse and LLM), not a download.
              tax_code: "txcd_10105001",
            },
          },
        },
      ],
      success_url: `${dashboardUrl(returnOrigin)}?checkout=success`,
      cancel_url: `${dashboardUrl(returnOrigin)}?checkout=cancel`,
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: {
          accountId: account.accountId,
          usdCents: String(cents),
          credits: String(credits),
          source: "checkout",
        },
      },
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
  args: { returnOrigin: v.optional(v.string()) },
  handler: async (ctx, { returnOrigin }): Promise<{ url: string }> => {
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
      return_url: dashboardUrl(returnOrigin),
    });
    return { url: portal.url };
  },
});

async function paymentDetails(
  stripe: Stripe,
  paymentIntent: string | Stripe.PaymentIntent | null | undefined,
): Promise<{
  paymentIntentId?: string;
  paymentMethodId?: string;
  receiptUrl?: string;
}> {
  const id =
    typeof paymentIntent === "string"
      ? paymentIntent
      : paymentIntent?.id;
  if (!id) return {};
  const intent = await stripe.paymentIntents.retrieve(id, {
    expand: ["latest_charge"],
  });
  const pm = intent.payment_method;
  const charge = intent.latest_charge;
  return {
    paymentIntentId: intent.id,
    paymentMethodId: typeof pm === "string" ? pm : pm?.id,
    receiptUrl:
      charge && typeof charge !== "string"
        ? (charge.receipt_url ?? undefined)
        : undefined,
  };
}

/** Off-session credit reload. Idempotent while `autoReloadPending` is fresh. */
export const maybeAutoReload = internalAction({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.runQuery(internal.stripeMutations.getAccountBilling, {
      accountId,
    });
    if (!account?.autoReloadPending) return { ok: false as const, reason: "not_pending" };
    const stripe = getStripe();
    if (!stripe) {
      await ctx.runMutation(internal.stripeMutations.markReloadFailed, {
        accountId,
        error: "stripe_not_configured",
      });
      return { ok: false as const, reason: "stripe_not_configured" };
    }
    if (!account.stripeCustomerId || !account.stripePaymentMethodId || !account.email) {
      await ctx.runMutation(internal.stripeMutations.markReloadFailed, {
        accountId,
        error: "no_payment_method",
      });
      return { ok: false as const, reason: "no_payment_method" };
    }

    const cents = account.autoReloadUsdCents;
    const credits = creditsForUsdCents(cents);
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: cents,
          currency: "usd",
          customer: account.stripeCustomerId,
          payment_method: account.stripePaymentMethodId,
          off_session: true,
          confirm: true,
          metadata: {
            accountId,
            usdCents: String(cents),
            credits: String(credits),
            source: "auto_reload",
          },
        },
        {
          idempotencyKey: `auto-reload-${accountId}-${account.autoReloadPendingAt ?? 0}`,
        },
      );
      if (intent.status !== "succeeded") {
        return { ok: true as const, status: intent.status };
      }
      const charge = await paymentDetails(stripe, intent.id);
      await ctx.runMutation(internal.stripeMutations.grantCreditsFromCheckout, {
        accountId,
        stripePaymentIntentId: intent.id,
        usdCents: cents,
        credits,
        receiptUrl: charge.receiptUrl,
        clearReloadPending: true,
      });
      return { ok: true as const, status: "succeeded" as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : "auto_reload_failed";
      await ctx.runMutation(internal.stripeMutations.markReloadFailed, {
        accountId,
        error: message,
      });
      return { ok: false as const, reason: message };
    }
  },
});
