import { useState } from "react";
import { login, AdminClientError } from "../api/client.js";
import { persistSession } from "../session.js";
import type { Session } from "../session.js";

interface LoginScreenProps {
  onLoggedIn: (session: Session) => void;
}

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await login(email, password);
      const session: Session = { token: result.token, actorId: result.actor.id, roles: result.actor.roles };
      persistSession(session);
      onLoggedIn(session);
    } catch (err) {
      if (err instanceof AdminClientError) setFailed(true);
      else throw err;
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
      </form>
    </main>
  );
}
