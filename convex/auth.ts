import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { resolveAuthRedirect } from "./authRedirects";
import { ResendOTP } from "./otp/ResendOTP";

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
  },
});
