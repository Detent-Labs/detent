import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { login, AppClientError } from "../api/client.js";
import { t } from "./catalog.js";
import type { UiLocale } from "../i18n/locale.js";
import type { Session } from "./session.js";
import { colors, space } from "form-ui/tokens.stylex";

/** `.shell-screen`, `.shell-login-form` (+ its `label`) and `.shell-error`
 * from `shell.css`, as StyleX. `.shell-login` carries no rule of its own;
 * it stays a literal hook class beside the compiled `screen` style. */
const styles = stylex.create({
  screen: {
    maxWidth: "46rem",
    marginInline: "auto",
    paddingBlock: space.s6,
    paddingInline: space.s3,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: space.s3,
  },
  formLabel: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.85rem",
  },
  error: {
    color: colors.refusal,
  },
});

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
      // Roles come straight off the login response. The shell persists the
      // session; this screen only reports it upward.
      onLoggedIn({ token: result.token, actorId: result.actor.id, roles: result.actor.roles });
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

  const screenProps = stylex.props(styles.screen);
  return (
    <main className={`shell-login ${screenProps.className}`} style={screenProps.style}>
      <form
        {...stylex.props(styles.form)}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1>{t(locale, "login.title")}</h1>
        <label {...stylex.props(styles.formLabel)}>
          {t(locale, "login.email")}
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label {...stylex.props(styles.formLabel)}>
          {t(locale, "login.password")}
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {t(locale, "login.submit")}
        </button>
        {failed && <p {...stylex.props(styles.error)}>{t(locale, "login.failed")}</p>}
        {error && <p {...stylex.props(styles.error)}>{error}</p>}
      </form>
    </main>
  );
}
