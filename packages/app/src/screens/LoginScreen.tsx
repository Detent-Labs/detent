import { useState } from "react";
import { login } from "../api/client.js";
import { AppClientError } from "../api/client.js";
import { describeCaughtError } from "../errors.js";
import { persistSession } from "../session.js";
import { t } from "../i18n/catalog.js";
import type { UiLocale } from "../i18n/locale.js";
import type { Session } from "../session.js";

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
      const session: Session = { token: result.token, actorId: result.actor.id };
      persistSession(session);
      onLoggedIn(session);
    } catch (err) {
      // A 401 here is a credential answer — there is no session yet to have
      // expired, so it means "wrong email or password", not session expiry.
      // Anything else (network down, 5xx) is a different failure and must
      // say so rather than reusing the wrong-credentials copy.
      if (err instanceof AppClientError && err.status === 401) setFailed(true);
      else setError(describeCaughtError(err, locale));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-screen app-login">
      <form
        className="app-login-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1>{t(locale, "login.title")}</h1>
        <label>
          {t(locale, "login.email")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label>
          {t(locale, "login.password")}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button type="submit" disabled={loading || !email || !password}>
          {t(locale, "login.submit")}
        </button>
        {failed && <p className="app-error">{t(locale, "login.failed")}</p>}
        {error && <p className="app-error">{error}</p>}
      </form>
    </main>
  );
}
