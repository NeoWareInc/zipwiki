"use node";

import { action, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

function allowedOrigins(): string[] {
  const raw = [
    process.env.SITE_URL ?? "",
    ...(process.env.WEB_ORIGIN ?? "").split(","),
  ];
  const out = new Set<string>();
  for (const item of raw) {
    const trimmed = item.trim().replace(/\/+$/, "");
    if (trimmed) out.add(trimmed);
  }
  if (out.size === 0) out.add("http://localhost:5173");
  return [...out];
}

function originContext(origin: string): { origin: string; rpID: string } {
  const clean = origin.trim().replace(/\/+$/, "");
  if (!allowedOrigins().includes(clean)) {
    throw new Error("This site is not allowed to register an admin passkey");
  }
  return { origin: clean, rpID: new URL(clean).hostname };
}

function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

async function requireAdminUser(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const admin = await ctx.runQuery(internal.adminPasskey.getAdmin, { userId });
  if (!admin) throw new Error("Admin only");
  return { userId, admin };
}

export const beginRegistration = action({
  args: { origin: v.string() },
  handler: async (ctx, { origin }) => {
    const { userId, admin } = await requireAdminUser(ctx);
    const { rpID } = originContext(origin);
    const options = await generateRegistrationOptions({
      rpName: "ZipWiki",
      rpID,
      userName: admin.email,
      userID: new TextEncoder().encode(userId),
      attestationType: "none",
      excludeCredentials: admin.credentials.map(
        (key: { credentialId: string; transports: string[] }) => ({
          id: key.credentialId,
          transports: key.transports,
        }),
      ),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });
    await ctx.runMutation(internal.adminPasskey.saveChallenge, {
      userId,
      challenge: options.challenge,
      kind: "register",
    });
    return options;
  },
});

export const finishRegistration = action({
  args: { origin: v.string(), response: v.any() },
  handler: async (ctx, { origin, response }) => {
    const { userId } = await requireAdminUser(ctx);
    const { origin: expectedOrigin, rpID } = originContext(origin);
    const challenge = await ctx.runQuery(internal.adminPasskey.takeChallenge, {
      userId,
      kind: "register",
    });
    if (!challenge) throw new Error("Passkey registration expired. Try again.");
    const verified = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verified.verified) throw new Error("Passkey registration was rejected");
    const credential = verified.registrationInfo.credential;
    await ctx.runMutation(internal.adminPasskey.storePasskey, {
      userId,
      credentialId: credential.id,
      publicKey: bytesToB64(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
    });
    return { ok: true as const };
  },
});

export const beginAuthentication = action({
  args: { origin: v.string() },
  handler: async (ctx, { origin }) => {
    const { userId, admin } = await requireAdminUser(ctx);
    if (admin.credentials.length === 0) {
      throw new Error("Register an admin passkey first");
    }
    const { rpID } = originContext(origin);
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: admin.credentials.map(
        (key: { credentialId: string; transports: string[] }) => ({
          id: key.credentialId,
          transports: key.transports,
        }),
      ),
    });
    await ctx.runMutation(internal.adminPasskey.saveChallenge, {
      userId,
      challenge: options.challenge,
      kind: "authenticate",
    });
    return options;
  },
});

export const finishAuthentication = action({
  args: { origin: v.string(), response: v.any() },
  handler: async (ctx, { origin, response }) => {
    const { userId, admin } = await requireAdminUser(ctx);
    const { origin: expectedOrigin, rpID } = originContext(origin);
    const challenge = await ctx.runQuery(internal.adminPasskey.takeChallenge, {
      userId,
      kind: "authenticate",
    });
    if (!challenge) throw new Error("Passkey check expired. Try again.");
    const body = response as AuthenticationResponseJSON;
    const stored = admin.credentials.find(
      (key: { credentialId: string; publicKey: string; counter: number; transports: string[] }) =>
        key.credentialId === body.id,
    );
    if (!stored) throw new Error("Unknown passkey");
    const verified = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64url")),
        counter: stored.counter,
        transports: stored.transports as never,
      },
    });
    if (!verified.verified) throw new Error("Passkey check was rejected");
    await ctx.runMutation(internal.adminPasskey.touchPasskey, {
      userId,
      credentialId: stored.credentialId,
      counter: verified.authenticationInfo.newCounter,
    });
    return { ok: true as const };
  },
});
