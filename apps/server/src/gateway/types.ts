export type UsageKind = "parse" | "okf";

export type UsageMeta = {
  provider: string;
  model?: string;
  pages?: number;
  inputTokens?: number;
  outputTokens?: number;
  bytes?: number;
  engine?: string;
  /** LlamaParse `job.usage.credits` for this document. */
  llamaCredits?: number;
  filename?: string;
  jobId?: string;
  /** Create ZipWiki session id for step log. */
  createId?: string;
};

export type ValidateResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      accountId: string;
      email?: string;
      billable: boolean;
      fallback: boolean;
    };

export type RecordResult = {
  creditsRemaining: number;
  lowCredits: boolean;
  autoReload: boolean;
};

export type AccountSettingsPayload = {
  settings: unknown;
  setupComplete: boolean;
  setupCompletedAt: string | null;
  updatedAt: string | null;
  setupUrl: string | null;
};

export type ActivityType = "pack_start" | "pack_end" | "pack" | "query";

export interface ConvexGateway {
  validateKey(token: string, kind?: UsageKind): Promise<ValidateResult>;
  recordUsage(args: {
    accountId: string;
    kind: UsageKind;
    billable: boolean;
    /** Account's own LlamaParse key. Record only; do not debit ZipWiki credits. */
    userKey?: boolean;
    usage: UsageMeta;
  }): Promise<RecordResult>;
  getAccountSettings(accountId: string): Promise<AccountSettingsPayload>;
  putAccountSettings(args: {
    accountId: string;
    settings: unknown;
    markSetupComplete?: boolean;
  }): Promise<AccountSettingsPayload>;
  getClientConfig(token: string): Promise<unknown>;
  recordLiteparse(args: {
    accountId: string;
    success: boolean;
    bytes?: number;
    createId?: string;
  }): Promise<void>;
  recordActivity(args: {
    accountId: string;
    type: ActivityType;
    engine?: string;
    status?: string;
    filename?: string;
    bytes?: number;
    pages?: number;
    createId?: string;
    creditCost?: number;
    llamaCredits?: number;
    inputTokens?: number;
    outputTokens?: number;
    okfCount?: number;
    parseCount?: number;
  }): Promise<void>;
  queryBilling(token: string): Promise<
    | { ok: false; status: number; error: string }
    | {
        ok: true;
        accountId: string;
        disabled: boolean;
        creditsRemaining: number;
        creditsUnlimited: boolean;
        creditsLocked: boolean;
      }
  >;
  recordQuery(args: {
    accountId: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    filename?: string;
  }): Promise<{
    creditsCharged: number;
    creditsRemaining: number;
    creditsUnlimited: boolean;
  }>;
}

export type GatewayResponse = {
  status: number;
  body: unknown;
};
