import { useState } from "react";
import { AccountSettingsForm } from "./SettingsPage";
import { AuthCard } from "../components/AuthChrome";

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
      <p className="mb-6 text-sm text-(--muted)">
        Finish these preferences so zipwiki can download your account settings.
      </p>
      <AccountSettingsForm embedded onSaved={() => setDone(true)} />
    </AuthCard>
  );
}
