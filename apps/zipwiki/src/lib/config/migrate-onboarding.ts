import { createInterface } from "node:readline";
import {
  DEFAULT_ACCOUNT_SETTINGS,
  fetchAccountSettings,
  putAccountSettingsBearer,
  type AccountSettingsBody,
  type AccountSettingsBodyInput,
} from "@zipwiki/api-client";
import {
  isOnboardingComplete,
  loadZipwikiOnboarding,
} from "./onboarding.js";
import {
  resolveParseCredentialSource,
  resolveOkfCredentialSource,
} from "./api.js";
import {
  loadCachedAccountSettings,
  saveCachedAccountSettings,
} from "./account-settings-cache.js";

export function onboardingToAccountPatch(input: {
  compression?: "zstd" | "deflate" | "store";
  level?: number;
  recurse?: boolean;
  omitOriginalDocuments?: boolean;
  useAi?: boolean;
  parseCredential?: AccountSettingsBody["parseCredential"];
  okfCredential?: AccountSettingsBody["okfCredential"];
}): AccountSettingsBodyInput {
  const base = structuredClone(DEFAULT_ACCOUNT_SETTINGS);
  return {
    version: 1,
    parseCredential: input.parseCredential ?? base.parseCredential,
    okfCredential: input.okfCredential ?? base.okfCredential,
    parser: base.parser,
    okf: {
      ...base.okf,
      useAi: input.useAi ?? base.okf.useAi,
    },
    pack: {
      ...base.pack,
      compression: input.compression ?? base.pack.compression,
      level: input.level ?? base.pack.level,
      recurse: input.recurse ?? base.pack.recurse,
      omitOriginalDocuments:
        input.omitOriginalDocuments ?? base.pack.omitOriginalDocuments,
    },
  };
}

/**
 * One-time: if local onboarding.json exists and server setup is incomplete,
 * optionally upload mapped fields (marks setup complete when uploaded).
 */
export async function maybeMigrateLocalOnboarding(opts: {
  url: string;
  apiKey: string;
  /** Skip interactive prompt (tests / CI). */
  force?: boolean | "skip";
}): Promise<void> {
  if (opts.force === "skip") return;

  const onboarding = loadZipwikiOnboarding();
  if (!isOnboardingComplete(onboarding)) return;

  // Prefer live remote status over cache (login has no cache yet).
  let remoteComplete = loadCachedAccountSettings()?.setupComplete === true;
  if (!remoteComplete) {
    try {
      const live = await fetchAccountSettings(opts.url, opts.apiKey);
      remoteComplete = live.setupComplete;
      if (live.setupComplete) {
        saveCachedAccountSettings(live);
        return;
      }
    } catch {
      /* fall through to prompt */
    }
  } else {
    return;
  }

  const patch = onboardingToAccountPatch({
    compression: onboarding.compression,
    level: onboarding.level,
    recurse: onboarding.recurse,
    omitOriginalDocuments: onboarding.omitOriginalDocuments,
    useAi: onboarding.useAi,
    parseCredential: resolveParseCredentialSource(),
    okfCredential:
      onboarding.useAi === false
        ? "local"
        : resolveOkfCredentialSource() === "anthropic"
          ? "anthropic"
          : resolveOkfCredentialSource() === "local"
            ? "local"
            : "zipwiki",
  });

  let upload = opts.force === true;
  if (!upload && process.stdin.isTTY) {
    upload = await askYesNo(
      "Upload local ~/.zipwiki onboarding defaults to your account?",
    );
  }
  if (!upload) return;

  try {
    const payload = await putAccountSettingsBearer(opts.url, opts.apiKey, {
      ...patch,
      markSetupComplete: true,
    });
    saveCachedAccountSettings(payload);
    console.error("[zipwiki] Local onboarding uploaded to account settings.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[zipwiki] Onboarding migrate skipped: ${msg}`);
  }
}

function askYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^(y|yes)$/i.test(answer.trim()));
    });
  });
}
