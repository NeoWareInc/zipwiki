/** Parse email + OTP from a magic login URL (`?email=&code=`). */
export function parseAuthEmailLinkParams(
  params: URLSearchParams,
): { email: string; code: string } | null {
  const email = params.get("email")?.trim() ?? "";
  const code = (params.get("code") ?? "").replace(/\D/g, "").slice(0, 8);
  if (!email.includes("@") || code.length < 8) return null;
  return { email, code };
}
