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
    let active = true;

    async function loadProfiles() {
      setError("");

      const { data, error } = await supabase
        .from("profiles")
        .select("id,name")
        .order("name");

      if (!active) return;

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

    return () => {
      active = false;
    };
  }, [user.id]);

  React.useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }

    let active = true;

    async function loadMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${selected.id}),and(sender_id.eq.${selected.id},receiver_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true });

      if (!active) return;

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
            (message.sender_id === user.id &&
              message.receiver_id === selected.id) ||
            (message.sender_id === selected.id &&
              message.receiver_id === user.id);

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
      active = false;
      supabase.removeChannel(channel);
    };
  }, [selected?.id, user.id]);

  async function sendMessage(e) {
    e.preventDefault();

    const content = text.trim();

    if (!content || !selected) return;

    setText("");

    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      receiver_id: selected.id,
      content,
    });

    if (error) {
      alert(`No se pudo enviar: ${error.message}`);
      setText(content);
    }
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
                {(person.name || "?")[0].toUpperCase()}
              </span>

              {person.name || "Empleado"}
            </button>
          ))}
        </aside>

        <main className="chat">
          {selected ? (
            <>
              <div className="chathead">
                <span className="avatar">
                  {(selected.name || "?")[0].toUpperCase()}
                </span>

                <b>{selected.name || "Empleado"}</b>
              </div>

              <div className="msgs">
                {messages.length ? (
                  messages.map((message) => (
                    <div
                      className={`msg ${
                        message.sender_id === user.id ? "mine" : ""
                      }`}
                      key={message.id}
                    >
                      {message.content}
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

  return session ? (
    <Chat user={session.user} />
  ) : (
    <Login />
  );
}

createRoot(document.getElementById("root")).render(<App />);
