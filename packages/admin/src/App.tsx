import { useState } from "react";
import { useRoute } from "./routing.js";
import { loadSession, persistSession, clearSession, type Session } from "./session.js";
import { LoginScreen } from "./screens/LoginScreen.js";
import { InstancesScreen } from "./screens/InstancesScreen.js";
import { InstanceScreen } from "./screens/InstanceScreen.js";
import { OutboxScreen } from "./screens/OutboxScreen.js";
import { TimersScreen } from "./screens/TimersScreen.js";

/** Mirrors src/auth/authorize.ts::ADMIN_ROLE — the server is the enforcement; this is presentational only (admin-app spec's "An actor without the admin role sees an explanatory empty state"). */
const ADMIN_ROLE = "system:admin";

export function App() {
  const { route, navigate } = useRoute();
  const [session, setSession] = useState<Session | undefined>(() => loadSession());

  const logout = () => {
    clearSession();
    setSession(undefined);
    navigate({ name: "login" });
  };

  if (!session || route.name === "login") {
    return (
      <LoginScreen
        onLoggedIn={(s) => {
          setSession(s);
          persistSession(s);
          navigate({ name: "instances" });
        }}
      />
    );
  }

  if (!session.roles.includes(ADMIN_ROLE)) {
    return (
      <main className="admin-empty-role">
        <h1>Operator role required</h1>
        <p>Your account can sign in, but it does not hold the {ADMIN_ROLE} role needed to use this area.</p>
        <button type="button" onClick={logout}>
          Log out
        </button>
      </main>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <nav>
          <button type="button" aria-current={route.name === "instances" || route.name === "instance" ? "page" : undefined} onClick={() => navigate({ name: "instances" })}>
            Instances
          </button>
          <button type="button" aria-current={route.name === "outbox" ? "page" : undefined} onClick={() => navigate({ name: "outbox" })}>
            Outbox
          </button>
          <button type="button" aria-current={route.name === "timers" ? "page" : undefined} onClick={() => navigate({ name: "timers" })}>
            Timers
          </button>
        </nav>
        <div className="admin-header-right">
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {route.name === "instances" && <InstancesScreen token={session.token} navigate={navigate} onUnauthorized={logout} />}
      {route.name === "instance" && <InstanceScreen instanceId={route.instanceId} token={session.token} navigate={navigate} onUnauthorized={logout} />}
      {route.name === "outbox" && <OutboxScreen token={session.token} onUnauthorized={logout} />}
      {route.name === "timers" && <TimersScreen token={session.token} navigate={navigate} onUnauthorized={logout} />}
    </div>
  );
}
