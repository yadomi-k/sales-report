// VISORA：アプリ全体（ログイン・上部バー・Sales／Creativeタブ）

const TABS = [
  { key: "sales", label: "Sales" },
  { key: "creative", label: "Creative" },
];

function readTab() {
  const h = (location.hash || "").replace("#", "");
  return TABS.some((t) => t.key === h) ? h : "sales";
}

function Shell({ mode, profile, onLogout }) {
  const isDemo = mode === "demo";
  const [tab, setTab] = useState(readTab);
  // Creativeタブは、プロジェクト管理の金額を参照できる人にだけ出す（Salesforceの権限で判定）
  const [creative, setCreative] = useState({ checking: true, ok: false });
  const [visited, setVisited] = useState({ [readTab()]: true });

  useEffect(() => {
    AppCreative.checkAccess(mode).then((r) => setCreative({ checking: false, ok: r.ok, reason: r.reason }));
    const onHash = () => setTab(readTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    setVisited((v) => (v[tab] ? v : Object.assign({}, v, { [tab]: true })));
  }, [tab]);

  // 権限のない人が #creative を開いた場合は Sales に戻す
  const current = tab === "creative" && !creative.checking && !creative.ok ? "sales" : tab;
  const go = (k) => {
    try {
      history.replaceState(null, "", "#" + k);
    } catch (e) {}
    setTab(k);
  };
  const tabs = TABS.filter((t) => t.key !== "creative" || creative.ok);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="./assets/logo.png" alt="VISORA" />
          {isDemo && <span className="badge">デモデータ</span>}
        </div>
        <nav className="tabs" aria-label="表示する画面">
          {tabs.map((t) => (
            <button key={t.key} type="button" className={"tab" + (current === t.key ? " on" : "")} aria-current={current === t.key ? "page" : undefined} onClick={() => go(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="who">
          {profile && profile.name && <span className="who-name">{profile.name}</span>}
          {onLogout && (
            <button className="btn sm ghost" onClick={onLogout}>
              {isDemo ? "終了" : "ログアウト"}
            </button>
          )}
        </div>
      </header>
      {(visited.sales || current === "sales") && <SalesPage mode={mode} active={current === "sales"} />}
      {creative.ok && (visited.creative || current === "creative") && <CreativePage mode={mode} active={current === "creative"} />}
    </div>
  );
}

function App() {
  const [state, setState] = useState({ phase: "checking" });

  useEffect(() => {
    AppSSO.consumeRedirect()
      .then((profile) => {
        if (profile) return setState({ phase: "in", mode: "sf", profile });
        const s = AppSSO.getSession();
        if (s) return setState({ phase: "in", mode: "sf", profile: s.profile });
        let demo = false;
        try {
          demo = sessionStorage.getItem(MODE_KEY) === "demo";
        } catch (e) {}
        setState(demo ? { phase: "in", mode: "demo", profile: { name: "デモ利用者" } } : { phase: "out" });
      })
      .catch((e) => setState({ phase: "out", error: e.message }));
    const onExpire = () => setState({ phase: "out", error: "Salesforceの接続の有効期限が切れました。もう一度ログインしてください。" });
    window.addEventListener("salesreport-session-expired", onExpire);
    return () => window.removeEventListener("salesreport-session-expired", onExpire);
  }, []);

  if (AppConfig.demoOnly) return <Shell mode="demo" profile={{ name: "デモ利用者" }} onLogout={null} />;
  if (state.phase === "checking") return <div className="center muted">読み込み中…</div>;
  if (state.phase === "out")
    return (
      <LoginPage
        error={state.error}
        onDemo={() => {
          try {
            sessionStorage.setItem(MODE_KEY, "demo");
          } catch (e) {}
          setState({ phase: "in", mode: "demo", profile: { name: "デモ利用者" } });
        }}
      />
    );
  return (
    <Shell
      mode={state.mode}
      profile={state.profile}
      onLogout={() => {
        if (state.mode === "sf") AppSSO.endSession();
        try {
          sessionStorage.removeItem(MODE_KEY);
        } catch (e) {}
        setState({ phase: "out" });
      }}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
