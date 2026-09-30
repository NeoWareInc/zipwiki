import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { resolveAuthRedirect } from "./authRedirects";
import { ResendOTP } from "./otp/ResendOTP";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ResendOTP,
    Password,
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      return resolveAuthRedirect(redirectTo);
    },
    async beforeSessionCreation(ctx, { userId }) {
      const account = await (ctx as MutationCtx).db
        .query("accounts")
        .withIndex("by_userId", (q) => q.eq("userId", userId as Id<"users">))
        .unique();
      if (account?.disabled) {
        throw new Error("This account is disabled.");
      }
    },
  },
});
