// VISORA：アプリ全体（ログイン・上部バー・Sales／Creativeタブ）

const TABS = [
  { key: "sales", label: "Sales" },
  { key: "creative", label: "Creative" },
];

// Salesタブの中の画面：売上レポート／変更履歴（週次）
const SALES_VIEWS = [
  { key: "report", label: "売上レポート", hash: "sales" },
  { key: "history", label: "変更履歴（週次）", hash: "sales-history" },
];

function readHash() {
  return (location.hash || "").replace("#", "");
}
function readTab() {
  const h = readHash();
  if (h === "sales-history") return "sales";
  return TABS.some((t) => t.key === h) ? h : "sales";
}
function readSalesView() {
  return readHash() === "sales-history" ? "history" : "report";
}

function Shell({ mode, profile, onLogout }) {
  const isDemo = mode === "demo";
  const [tab, setTab] = useState(readTab);
  // Creativeタブは、プロジェクト管理の金額を参照できる人にだけ出す（Salesforceの権限で判定）
  const [creative, setCreative] = useState({ checking: true, ok: false });
  const [salesView, setSalesView] = useState(readSalesView);
  const [visited, setVisited] = useState({ [readTab()]: true, [readSalesView()]: true });

  useEffect(() => {
    AppCreative.checkAccess(mode).then((r) => setCreative({ checking: false, ok: r.ok, reason: r.reason }));
    const onHash = () => {
      setTab(readTab());
      setSalesView(readSalesView());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    setVisited((v) => (v[tab] && v[salesView] ? v : Object.assign({}, v, { [tab]: true, [salesView]: true })));
  }, [tab, salesView]);

  // 権限のない人が #creative を開いた場合は Sales に戻す
  const current = tab === "creative" && !creative.checking && !creative.ok ? "sales" : tab;
  const go = (k) => {
    const hash = k === "sales" && salesView === "history" ? "sales-history" : k;
    try {
      history.replaceState(null, "", "#" + hash);
    } catch (e) {}
    setTab(k);
  };
  const goSales = (v) => {
    try {
      history.replaceState(null, "", "#" + SALES_VIEWS.find((x) => x.key === v).hash);
    } catch (e) {}
    setSalesView(v);
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
      {current === "sales" && (
        <nav className="subtabs" aria-label="Salesの画面">
          {SALES_VIEWS.map((v) => (
            <button key={v.key} type="button" className={"subtab" + (salesView === v.key ? " on" : "")} aria-current={salesView === v.key ? "page" : undefined} onClick={() => goSales(v.key)}>
              {v.label}
            </button>
          ))}
        </nav>
      )}
      {(visited.report || (current === "sales" && salesView === "report")) && <SalesPage mode={mode} active={current === "sales" && salesView === "report"} />}
      {(visited.history || (current === "sales" && salesView === "history")) && <HistoryPage mode={mode} active={current === "sales" && salesView === "history"} />}
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

// 画面の途中でエラーが起きても真っ白にせず、内容と対処を表示する
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center">
        <div className="alert error" style={{ maxWidth: "36rem", margin: "0 auto", textAlign: "left" }}>
          <b>画面を表示できませんでした。</b>
          <br />
          キーボードの <b>Ctrl + F5</b>（Macは Command + Shift + R）でページを再読み込みしてください。直らない場合は、下の内容を管理者に伝えてください。
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", marginTop: "0.5rem" }}>{String(this.state.error && (this.state.error.message || this.state.error))}</pre>
        </div>
      </div>
    );
  }
}

const rootEl = document.getElementById("root");
rootEl.setAttribute("data-mounted", "1");
ReactDOM.createRoot(rootEl).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
