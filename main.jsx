import React from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

function Login({ onLogin }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else onLogin(data.user);
    setLoading(false);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">M</div>
        <h1>MitsuChat</h1>
        <p className="muted">Comunicación interna</p>
        <form onSubmit={submit}>
          <label>Correo</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="correo@empresa.com" />
          <label>Contraseña</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" required placeholder="••••••••" />
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={loading}>{loading ? "Entrando..." : "Iniciar sesión"}</button>
        </form>
      </section>
    </main>
  );
}

function App({ user }) {
  const [profiles, setProfiles] = React.useState([]);
  const [announcements, setAnnouncements] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [text, setText] = React.useState("");
  const [tab, setTab] = React.useState("chat");
  const [loading, setLoading] = React.useState(true);

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from("profiles").select("*").order("name"),
      supabase.from("announcements").select("*").order("created_at", { ascending: false })
    ]);
    setProfiles((p || []).filter(x => x.id !== user.id));
    setAnnouncements(a || []);
    setLoading(false);
  }

  async function loadMessages(other) {
    const { data } = await supabase.from("messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${other.id}),and(sender_id.eq.${other.id},receiver_id.eq.${user.id})`)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  }

  React.useEffect(() => { load(); }, []);
  React.useEffect(() => {
    if (!selected) return;
    loadMessages(selected);
    const channel = supabase.channel("mitsuchat-messages-" + selected.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, payload => {
        const m = payload.new;
        if (m && ((m.sender_id === user.id && m.receiver_id === selected.id) || (m.sender_id === selected.id && m.receiver_id === user.id))) {
          setMessages(prev => {
            if (payload.eventType === "INSERT" && !prev.some(x => x.id === m.id)) return [...prev, m];
            if (payload.eventType === "UPDATE") return prev.map(x => x.id === m.id ? m : x);
            if (payload.eventType === "DELETE") return prev.filter(x => x.id !== m.id);
            return prev;
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected?.id]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !selected) return;
    setText("");
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      receiver_id: selected.id,
      content: body
    });
    if (error) {
      alert(error.message);
      setText(body);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  const myProfile = profiles.find(p => p.id === user.id);
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-small">M</span><strong>MitsuChat</strong></div>
        <div className="top-actions">
          <span className="user-name">{myProfile?.name || user.email}</span>
          <button onClick={logout} className="ghost">Salir</button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="tabs">
            <button className={tab === "chat" ? "tab active" : "tab"} onClick={() => setTab("chat")}>💬 Chats</button>
            <button className={tab === "announcements" ? "tab active" : "tab"} onClick={() => setTab("announcements")}>📢 Avisos</button>
          </div>
          {tab === "chat" && (
            <div className="people">
              <h3>Empleados</h3>
              {loading ? <p className="muted">Cargando...</p> : profiles.length === 0 ? <p className="muted">No hay otros perfiles.</p> :
                profiles.map(p => (
                  <button key={p.id} className={selected?.id === p.id ? "person selected" : "person"} onClick={() => setSelected(p)}>
                    <span className="avatar">{(p.name || "?").slice(0,1).toUpperCase()}</span>
                    <span><strong>{p.name || "Empleado"}</strong><small>{p.email || ""}</small></span>
                  </button>
                ))}
            </div>
          )}
        </aside>

        <section className="content">
          {tab === "announcements" ? (
            <div className="announcements">
              <h2>Avisos internos</h2>
              {announcements.length === 0 ? <p className="muted">No hay avisos publicados.</p> :
                announcements.map(a => (
                  <article className="announcement" key={a.id}>
                    <h3>{a.title}</h3>
                    <p>{a.content}</p>
                    {a.created_at && <small>{new Date(a.created_at).toLocaleString("es-MX")}</small>}
                  </article>
                ))}
            </div>
          ) : selected ? (
            <div className="chat">
              <div className="chat-head">
                <span className="avatar">{(selected.name || "?").slice(0,1).toUpperCase()}</span>
                <div><strong>{selected.name || "Empleado"}</strong><small>{selected.email || ""}</small></div>
              </div>
              <div className="messages">
                {messages.length === 0 ? <div className="empty">Comienza la conversación.</div> :
                  messages.map(m => (
                    <div key={m.id} className={m.sender_id === user.id ? "bubble mine" : "bubble"}>
                      <div>{m.content}</div>
                      {m.created_at && <small>{new Date(m.created_at).toLocaleTimeString("es-MX", {hour:"2-digit", minute:"2-digit"})}</small>}
                    </div>
                  ))}
              </div>
              <form className="composer" onSubmit={send}>
                <input value={text} onChange={e => setText(e.target.value)} placeholder="Escribe un mensaje..." />
                <button className="primary">Enviar</button>
              </form>
            </div>
          ) : (
            <div className="welcome">
              <div className="welcome-icon">💬</div>
              <h2>Bienvenido a MitsuChat</h2>
              <p>Selecciona un empleado para comenzar una conversación.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Root() {
  const [session, setSession] = React.useState(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="loading-screen">Cargando MitsuChat...</div>;
  return session ? <App user={session.user} /> : <Login onLogin={() => {}} />;
}

createRoot(document.getElementById("root")).render(<Root />);
