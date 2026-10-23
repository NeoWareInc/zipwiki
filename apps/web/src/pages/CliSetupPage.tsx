import { useState } from "react";
import { AccountSettingsForm } from "./SettingsPage";
import { AuthCard } from "../components/AuthChrome";
import { SETTINGS_CLI_INTRO } from "../lib/settings-onboarding-copy";

export default function CliSetupPage() {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <AuthCard title="Setup complete">
        <p className="text-sm text-(--muted)">
          Return to your terminal — zipwiki will finish linking.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="ZipWiki CLI setup">
      <div className="mb-6 space-y-3 text-sm text-(--muted)">
        <p>{SETTINGS_CLI_INTRO.lead}</p>
        <p>{SETTINGS_CLI_INTRO.whyParse}</p>
        <p>{SETTINGS_CLI_INTRO.whyLlm}</p>
      </div>
      <AccountSettingsForm embedded onSaved={() => setDone(true)} />
    </AuthCard>
  );
}
