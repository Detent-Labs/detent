import { useState } from "react";
import { useRoute } from "./routing.js";
import { loadSession, persistSession, clearSession, type Session } from "./session.js";
import { LoginScreen } from "./screens/LoginScreen.js";
import { ProcessesScreen } from "./screens/ProcessesScreen.js";
import { EditScreen } from "./screens/EditScreen.js";

/** Mirrors src/auth/authorize.ts::DEVELOPER_ROLE — the server is the enforcement; this is presentational only (studio-app spec's "An authenticated actor without the developer role sees an explanatory empty state"). */
const DEVELOPER_ROLE = "system:developer";

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
          navigate({ name: "processes" });
        }}
      />
    );
  }

  if (!session.roles.includes(DEVELOPER_ROLE)) {
    return (
      <main className="studio-empty-role">
        <h1>Studio access required</h1>
        <p>Your account can sign in, but it does not hold the {DEVELOPER_ROLE} role needed to use this area.</p>
        <button type="button" onClick={logout}>
          Log out
        </button>
      </main>
    );
  }

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <nav>
          <button
            type="button"
            aria-current={route.name === "processes" || route.name === "edit" ? "page" : undefined}
            onClick={() => navigate({ name: "processes" })}
          >
            Processes
          </button>
        </nav>
        <div className="studio-header-right">
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {route.name === "processes" && <ProcessesScreen token={session.token} navigate={navigate} onUnauthorized={logout} />}
      {route.name === "edit" && <EditScreen processId={route.processId} token={session.token} navigate={navigate} onUnauthorized={logout} />}
    </div>
  );
}
