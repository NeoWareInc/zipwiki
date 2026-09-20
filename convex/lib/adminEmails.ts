/** Emails that receive admin on first profile create / bootstrap. */
const DEFAULT_ADMIN_EMAILS = ["steve@neoware.io", "admin@neoware.io"];

export function bootstrapAdminEmails(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const extra = (env.AUTH_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ADMIN_EMAILS, ...extra])];
}

export function isBootstrapAdminEmail(
  email: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return bootstrapAdminEmails(env).includes(email.trim().toLowerCase());
}
