import React from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

function Login() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");

  async function login(e) {
    e.preventDefault();
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) setError(error.message);
  }

  return (
    <main className="login">
      <section>
        <b className="logo">M</b>
        <h1>MitsuChat</h1>
        <p>Comunicación interna</p>

        <form onSubmit={login}>
          <input
            type="email"
            placeholder="Correo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <div className="err">{error}</div>}

          <button type="submit">Iniciar sesión</button>
        </form>
      </section>
    </main>
  );
}

function Chat({ user }) {
  const [people, setPeople] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    async function loadProfiles() {
      setError("");

      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,department,role")
        .order("full_name", { ascending: true });

      if (error) {
        console.error(error);
        setError(error.message);
        return;
      }

      setPeople(
        (data || []).filter(
          (profile) => String(profile.id) !== String(user.id)
        )
      );
    }

    loadProfiles();
  }, [user.id]);

  React.useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }

    async function loadMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${selected.id}),and(sender_id.eq.${selected.id},recipient_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        return;
      }

      setMessages(data || []);
    }

    loadMessages();

    const channel = supabase
      .channel(`chat-${user.id}-${selected.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const message = payload.new;

          const belongs =
            (String(message.sender_id) === String(user.id) &&
              String(message.recipient_id) === String(selected.id)) ||
            (String(message.sender_id) === String(selected.id) &&
              String(message.recipient_id) === String(user.id));

          if (belongs) {
            setMessages((current) =>
              current.some((m) => m.id === message.id)
                ? current
                : [...current, message]
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selected?.id, user.id]);

  async function sendMessage(e) {
    e.preventDefault();

    const messageText = text.trim();

    if (!messageText || !selected) return;

    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      recipient_id: selected.id,
      body: messageText,
    });

    if (error) {
      console.error(error);
      alert(`No se pudo enviar el mensaje: ${error.message}`);
      return;
    }

    setText("");
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <div className="app">
      <header>
        <b>
          <span className="mini">M</span>
          MitsuChat
        </b>

        <button className="out" onClick={logout}>
          Salir
        </button>
      </header>

      <div className="layout">
        <aside>
          <h3>Empleados</h3>

          {error && (
            <div className="err">
              Error al cargar empleados: {error}
            </div>
          )}

          {!error && people.length === 0 && (
            <p style={{ color: "#6b7280", fontSize: 14 }}>
              No hay otros empleados disponibles.
            </p>
          )}

          {people.map((person) => (
            <button
              className={`person ${
                selected?.id === person.id ? "sel" : ""
              }`}
              key={person.id}
              onClick={() => setSelected(person)}
            >
              <span className="avatar">
                {(person.full_name || "?")[0].toUpperCase()}
              </span>

              <span>
                {person.full_name || "Empleado"}
              </span>
            </button>
          ))}
        </aside>

        <main className="chat">
          {selected ? (
            <>
              <div className="chathead">
                <span className="avatar">
                  {(selected.full_name || "?")[0].toUpperCase()}
                </span>

                <div>
                  <b>{selected.full_name || "Empleado"}</b>
                  {selected.department && (
                    <small style={{ display: "block", color: "#6b7280" }}>
                      {selected.department}
                    </small>
                  )}
                </div>
              </div>

              <div className="msgs">
                {messages.length > 0 ? (
                  messages.map((message) => (
                    <div
                      className={`msg ${
                        String(message.sender_id) === String(user.id)
                          ? "mine"
                          : ""
                      }`}
                      key={message.id}
                    >
                      {message.body}
                    </div>
                  ))
                ) : (
                  <p>Comienza la conversación.</p>
                )}
              </div>

              <form onSubmit={sendMessage} className="send">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Escribe un mensaje..."
                />

                <button type="submit">Enviar</button>
              </form>
            </>
          ) : (
            <div className="empty">
              <h2>Bienvenido a MitsuChat</h2>
              <p>Selecciona un empleado para comenzar.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = React.useState(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (!ready) {
    return <div className="loading">Cargando...</div>;
  }

  return session ? <Chat user={session.user} /> : <Login />;
}

createRoot(document.getElementById("root")).render(<App />);
