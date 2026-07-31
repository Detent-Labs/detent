import { useState, type FormEvent } from "react";
import { login } from "../api/client.js";
import { describeCaughtError } from "./reportingLogic.js";
import { ErrorNote } from "../components.js";
import type { ClientError } from "../api/types.js";
import type { Session } from "../session.js";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ClientError | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      onLoggedIn(await login(email, password));
    } catch (cause) {
      setError(describeCaughtError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="rep-login">
      <form className="rep-login-form" onSubmit={submit}>
        <h1>Reporting</h1>
        <p className="rep-scope">Cycle time, bottlenecks and SLA adherence for the processes you own.</p>
        <label>
          <span>Email</span>
          <input type="email" name="email" value={email} autoComplete="username" spellCheck={false} required onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          <span>Password</span>
          <input type="password" name="password" value={password} autoComplete="current-password" required onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <ErrorNote error={error} />}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
