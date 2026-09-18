import { Component, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  OPS_MODULES,
  clearOpsToken,
  isOpenModule,
  moduleByPath,
  opsUrl,
  parseOpsPath,
  persistOpsToken,
  readStoredToken,
} from "./modules.js";
import { fetchAdminPacks, mapAdminError } from "./themeOps.js";
import { ThemeConsole } from "./ThemeConsole.jsx";
import loginHero from "./assets/login-hero.webp";
import coverThemes from "./assets/cover-themes.webp";
import coverPrompts from "./assets/cover-prompts.webp";
import coverSkills from "./assets/cover-skills.webp";
import coverPets from "./assets/cover-pets.webp";
import emptySoon from "./assets/empty-soon.webp";

const COVERS = {
  themes: coverThemes,
  prompts: coverPrompts,
  skills: coverSkills,
  pets: coverPets,
};

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot">
          <p className="error">运营台渲染失败：{this.state.error.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            刷新
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Mark({ className }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 26V6h4.4l4.6 11.4L20.6 6H25v20h-3.6V12.1L17.3 26h-2.6l-4.1-13.9V26H7z"
      />
    </svg>
  );
}

function IconGlyph({ id }) {
  const paths = {
    themes: "M6 7h20v4H6zm0 7h12v4H6zm0 7h20v4H6z",
    prompts: "M8 6h16v14H14l-6 6V6zm4 5h8v2h-8zm0 4h6v2h-6z",
    skills: "M7 20l5-5 3 3 8-8 2 2-10 10-3-3-3 3zm15-13l3 3-2 2-3-3z",
    pets: "M10 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm12 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM16 26c-5 0-8-3.4-8-7.5S12.2 14 16 14s8 1.6 8 4.5S21 26 16 26z",
  };
  return (
    <svg className="nav-icon" viewBox="0 0 32 32" aria-hidden="true">
      <path fill="currentColor" d={paths[id] || paths.themes} />
    </svg>
  );
}

function useOpsRoute() {
  const [path, setPath] = useState(() => parseOpsPath(window.location.pathname));
  useEffect(() => {
    function sync() {
      setPath(parseOpsPath(window.location.pathname));
    }
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function navigate(routePath) {
    const next = opsUrl(routePath);
    if (`${window.location.pathname}${window.location.search}` === next) return;
    window.history.pushState({}, "", next);
    setPath(parseOpsPath(next));
  }

  return { path, navigate };
}

function LoginScreen({ onSubmit, busy, error, value, onChange }) {
  const reduce = useReducedMotion();
  return (
    <div className="login-shell">
      <img className="login-hero" src={loginHero} alt="" />
      <div className="login-veil" />
      <motion.form
        className="login-card"
        onSubmit={onSubmit}
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="eyebrow">LuckyAgent</p>
        <h1>一站式运营平台</h1>
        <p className="muted">主题、Prompt、Skills 与 Pets 的统一入口。口令只存在本页会话，关闭标签页即失效。</p>
        <label>
          运营口令
          <input
            type="password"
            autoComplete="current-password"
            data-testid="login-token"
            value={value}
            onChange={onChange}
            placeholder="输入运营口令"
          />
        </label>
        {error ? (
          <p className="error" data-testid="login-error">
            {error}
          </p>
        ) : null}
        <button type="submit" className="primary" data-testid="login-submit" disabled={busy === "login"}>
          {busy === "login" ? "验证中…" : "进入平台"}
        </button>
      </motion.form>
    </div>
  );
}

function HomeScreen({ onOpen }) {
  const reduce = useReducedMotion();
  return (
    <div className="home" data-testid="home">
      <header className="home-head">
        <p className="eyebrow">Command deck</p>
        <h1>选择一个运营域</h1>
        <p className="muted">目前仅主题管理开放。其余入口已预留，不会写入任何货架接口。</p>
      </header>
      <div className="bento">
        {OPS_MODULES.map((mod, index) => (
          <motion.button
            key={mod.id}
            type="button"
            className={`module-card ${mod.status}`}
            data-testid={`module-${mod.id}`}
            data-status={mod.status}
            onClick={() => onOpen(mod.href)}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.45 }}
            whileHover={reduce ? undefined : { y: -4 }}
          >
            <img src={COVERS[mod.cover]} alt="" />
            <span className="module-copy">
              <small>{mod.kicker}</small>
              <strong>{mod.title}</strong>
              <em>{mod.blurb}</em>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function ComingSoon({ mod }) {
  return (
    <div className="coming" data-testid={`coming-${mod.id}`}>
      <img src={emptySoon} alt="" />
      <p className="eyebrow">{mod.kicker}</p>
      <h1>{mod.title}</h1>
      <p className="muted">{mod.blurb} 此入口仅作预留，当前不会请求任何写接口。</p>
    </div>
  );
}

export function App() {
  const { path, navigate } = useOpsRoute();
  const [token, setToken] = useState(() => readStoredToken());
  const [authed, setAuthed] = useState(false);
  const [loginValue, setLoginValue] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState("");
  const [bootstrapping, setBootstrapping] = useState(Boolean(readStoredToken()));

  useEffect(() => {
    function move(event) {
      document.documentElement.style.setProperty("--spot", `${event.clientX}px ${event.clientY}px`);
    }
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  function logout(message = "") {
    clearOpsToken();
    setToken("");
    setAuthed(false);
    setLoginValue("");
    setLoginError(message);
    navigate("/");
  }

  async function verify(nextToken) {
    await fetchAdminPacks(nextToken);
    persistOpsToken(nextToken);
    setToken(nextToken);
    setAuthed(true);
  }

  useEffect(() => {
    if (!token) {
      setBootstrapping(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await verify(token);
      } catch (cause) {
        if (!cancelled) logout(mapAdminError(cause));
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitLogin(event) {
    event.preventDefault();
    setLoginError("");
    const next = loginValue.trim();
    if (!next) {
      setLoginError("请输入运营口令。");
      return;
    }
    setBusy("login");
    try {
      await verify(next);
    } catch (cause) {
      clearOpsToken();
      setToken("");
      setLoginError(mapAdminError(cause));
    } finally {
      setBusy("");
    }
  }

  if (bootstrapping) {
    return (
      <div className="boot">
        <p>正在核验会话…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <LoginScreen
        onSubmit={submitLogin}
        busy={busy}
        error={loginError}
        value={loginValue}
        onChange={(event) => setLoginValue(event.target.value)}
      />
    );
  }

  const current = moduleByPath(path);

  return (
    <div className="ops-shell">
      <aside className="rail">
        <button type="button" className="brand" onClick={() => navigate("/")}>
          <Mark className="mark" />
          <span>
            <small>LuckyAgent</small>
            <strong>运营平台</strong>
          </span>
        </button>
        <nav>
          {OPS_MODULES.map((mod) => (
            <button
              key={mod.id}
              type="button"
              className={`nav-item ${path === mod.href ? "active" : ""} ${mod.status}`}
              onClick={() => navigate(mod.href)}
            >
              <IconGlyph id={mod.id} />
              <span>{mod.title}</span>
              {isOpenModule(mod) ? null : <em>Soon</em>}
            </button>
          ))}
        </nav>
        <button type="button" className="ghost logout" data-testid="logout" onClick={() => logout()}>
          退出
        </button>
      </aside>
      <main className="stage">
        {path === "/" ? <HomeScreen onOpen={navigate} /> : null}
        {path === "/themes" ? <ThemeConsole token={token} onUnauthorized={logout} /> : null}
        {current && !isOpenModule(current) ? <ComingSoon mod={current} /> : null}
        {path !== "/" && !current ? (
          <div className="coming">
            <h1>未找到该入口</h1>
            <button type="button" className="primary" onClick={() => navigate("/")}>
              回到首页
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
