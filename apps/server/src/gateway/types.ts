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
};

export type ValidateResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      accountId: string;
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

export interface ConvexGateway {
  validateKey(token: string, kind?: UsageKind): Promise<ValidateResult>;
  recordUsage(args: {
    accountId: string;
    kind: UsageKind;
    billable: boolean;
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
  }): Promise<void>;
  recordActivity(args: {
    accountId: string;
    type: "pack" | "query";
    engine?: string;
    status?: string;
    filename?: string;
    bytes?: number;
    pages?: number;
  }): Promise<void>;
}

export type GatewayResponse = {
  status: number;
  body: unknown;
};
