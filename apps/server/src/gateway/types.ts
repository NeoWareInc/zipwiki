export type UsageKind = "parse" | "okf";

export type UsageMeta = {
  provider: string;
  model?: string;
  pages?: number;
  inputTokens?: number;
  outputTokens?: number;
  bytes?: number;
  engine?: string;
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

export interface ConvexGateway {
  validateKey(token: string, kind: UsageKind): Promise<ValidateResult>;
  recordUsage(args: {
    accountId: string;
    kind: UsageKind;
    billable: boolean;
    usage: UsageMeta;
  }): Promise<RecordResult>;
}

export type GatewayResponse = {
  status: number;
  body: unknown;
};
