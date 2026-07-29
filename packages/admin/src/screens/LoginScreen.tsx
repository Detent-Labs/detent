import { useState } from "react";
import { login, AdminClientError } from "../api/client.js";
import { persistSession } from "../session.js";
import type { Session } from "../session.js";
import { describeCaughtError } from "../errors.js";

interface LoginScreenProps {
  onLoggedIn: (session: Session) => void;
}

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
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
      const session: Session = { token: result.token, actorId: result.actor.id, roles: result.actor.roles };
      persistSession(session);
      onLoggedIn(session);
    } catch (err) {
      // A 401 here is a credential answer — there is no session yet to have
      // expired, so it means "wrong email or password", not session expiry.
      // Anything else (network down, 5xx) is a different failure and must
      // say so rather than reusing the wrong-credentials copy.
      if (err instanceof AdminClientError && err.status === 401) setFailed(true);
      else setError(describeCaughtError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-screen admin-login">
      <form
        className="admin-login-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1>Operations sign-in</h1>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button type="submit" disabled={loading || !email || !password}>
          Sign in
        </button>
        {failed && <p className="admin-error">Incorrect email or password.</p>}
        {error && <p className="admin-error">{error}</p>}
      </form>
    </main>
  );
}
