import { useState } from "react";
import { login, AppClientError } from "../api/client.js";
import { t } from "./catalog.js";
import type { UiLocale } from "../i18n/locale.js";
import type { Session } from "./session.js";

interface LoginScreenProps {
  locale: UiLocale;
  onLoggedIn: (session: Session) => void;
}

export function LoginScreen({ locale, onLoggedIn }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = async () => {
    setLoading(true);
    setFailed(false);
    setError(undefined);
    try {
      const result = await login(email, password);
      // Roles and expiry come straight off the login response. The shell
      // persists the session; this screen only reports it upward.
      onLoggedIn({ token: result.token, actorId: result.actor.id, roles: result.actor.roles, expiresAt: result.expiresAt });
    } catch (err) {
      // A 401 here is a credential answer — there is no session yet to have
      // expired, so it means "wrong email or password", not session expiry.
      // Anything else (network down, 5xx) is a different failure and must
      // say so rather than reusing the wrong-credentials copy.
      if (err instanceof AppClientError && err.status === 401) setFailed(true);
      else setError(t(locale, "error.generic"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="shell-screen shell-login">
      <form
        className="shell-login-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1>{t(locale, "login.title")}</h1>
        <label>
          {t(locale, "login.email")}
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label>
          {t(locale, "login.password")}
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {t(locale, "login.submit")}
        </button>
        {failed && <p className="shell-error">{t(locale, "login.failed")}</p>}
        {error && <p className="shell-error">{error}</p>}
      </form>
    </main>
  );
}
