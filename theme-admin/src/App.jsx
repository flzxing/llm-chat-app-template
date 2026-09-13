import { Component, useEffect, useMemo, useRef, useState } from "react";
import {
  draftToBody,
  fetchAdminPacks,
  filterAndSortPacks,
  formatBytes,
  hardDeletePack,
  hidePack,
  isDraftDirty,
  mapAdminError,
  packToDraft,
  rebuildCatalog,
  resolvePackPreview,
  resolvePackZip,
  shelfStats,
  uploadAsset,
  uploadZip,
  upsertPack,
  validatePackId,
} from "./ops.js";

const TOKEN_KEY = "lucky-theme-admin-token";

function Cover({ pack, className }) {
  const [failed, setFailed] = useState(false);
  const src = resolvePackPreview(pack);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) {
    return (
      <div className={`cover fallback ${className || ""}`} aria-hidden="true">
        {(pack?.displayName || pack?.id || "?").slice(0, 1)}
      </div>
    );
  }
  return (
    <img
      className={`cover ${className || ""}`}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      data-testid="cover"
      onError={() => setFailed(true)}
    />
  );
}

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
          <button type="button" onClick={() => window.location.reload()}>刷新</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <button key={toast.id} type="button" className={`toast ${toast.kind}`} onClick={() => onDismiss(toast.id)}>
          {toast.text}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [authed, setAuthed] = useState(false);
  const [loginValue, setLoginValue] = useState("");
  const [loginError, setLoginError] = useState("");
  const [packs, setPacks] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [audience, setAudience] = useState("all");
  const [sort, setSort] = useState("sort");
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(packToDraft(null));
  const [zipFile, setZipFile] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [busy, setBusy] = useState("");
  const [bootstrapping, setBootstrapping] = useState(Boolean(sessionStorage.getItem(TOKEN_KEY)));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);

  const selected = useMemo(() => packs.find((pack) => pack.id === selectedId) || null, [packs, selectedId]);
  const visible = useMemo(
    () => filterAndSortPacks(packs, { query, status, audience, sort }),
    [packs, query, status, audience, sort],
  );
  const stats = useMemo(() => shelfStats(packs), [packs]);
  const dirty = creating || isDraftDirty(draft, selected) || Boolean(zipFile) || Boolean(previewFile);

  function toast(text, kind = "ok") {
    const id = ++toastSeq.current;
    setToasts((current) => [...current, { id, text, kind }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }

  function persistSession(value) {
    setToken(value);
    sessionStorage.setItem(TOKEN_KEY, value);
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setAuthed(false);
    setPacks([]);
    setSelectedId("");
    setCreating(false);
    setLoginValue("");
  }

  async function loadShelf(nextToken = token) {
    const data = await fetchAdminPacks(nextToken);
    const list = data.packs ?? [];
    setPacks(list);
    setAuthed(true);
    return list;
  }

  async function run(label, work) {
    setBusy(label);
    try {
      const result = await work();
      return result;
    } catch (cause) {
      const message = mapAdminError(cause);
      if (cause?.message === "unauthorized") {
        logout();
        setLoginError(message);
      } else {
        toast(message, "err");
      }
      return null;
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (!token) {
      setBootstrapping(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await loadShelf(token);
      } catch (cause) {
        if (!cancelled) {
          logout();
          setLoginError(mapAdminError(cause));
        }
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
      persistSession(next);
      await loadShelf(next);
      toast("已进入运营台");
    } catch (cause) {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken("");
      setLoginError(mapAdminError(cause));
    } finally {
      setBusy("");
    }
  }

  function askLeaveEditor() {
    if (!dirty) return true;
    return window.confirm("当前编辑尚未保存，确定离开？");
  }

  function openPack(pack) {
    if (pack.id === selectedId && !creating) return;
    if (!askLeaveEditor()) return;
    setCreating(false);
    setSelectedId(pack.id);
    setDraft(packToDraft(pack));
    setZipFile(null);
    setPreviewFile(null);
    setDeleteOpen(false);
    setDeleteConfirm("");
  }

  function startCreate() {
    if (!askLeaveEditor()) return;
    setCreating(true);
    setSelectedId("");
    setDraft(packToDraft(null));
    setZipFile(null);
    setPreviewFile(null);
  }

  async function saveDraft() {
    const id = String(draft.id || "").trim();
    if (!validatePackId(id)) {
      toast("主题 id 需为小写字母、数字或下划线，2–64 位。", "err");
      return;
    }
    const existed = packs.some((pack) => pack.id === id);
    if (creating && existed) {
      toast("该 id 已存在。", "err");
      return;
    }
    await run("save", async () => {
      await upsertPack(token, id, draftToBody(draft));
      if (zipFile) await uploadZip(token, id, zipFile);
      if (previewFile) await uploadAsset(token, id, "preview.webp", previewFile);
      await rebuildCatalog(token);
      const list = await loadShelf();
      setCreating(false);
      setSelectedId(id);
      const fresh = list.find((pack) => pack.id === id);
      setDraft(packToDraft(fresh));
      setZipFile(null);
      setPreviewFile(null);
      toast(existed ? "已保存并刷新货架" : "已新建并上架目录");
    });
  }

  async function setPackStatus(nextStatus) {
    if (!selected) return;
    await run(nextStatus, async () => {
      if (nextStatus === "hidden") await hidePack(token, selected.id);
      else await upsertPack(token, selected.id, { ...selected, status: nextStatus });
      await rebuildCatalog(token);
      const list = await loadShelf();
      const fresh = list.find((pack) => pack.id === selected.id);
      setDraft(packToDraft(fresh));
      toast(nextStatus === "hidden" ? "已下架，客户端货架不再展示" : "已上架");
    });
  }

  async function toggleFeatured() {
    if (!selected) return;
    await run("featured", async () => {
      await upsertPack(token, selected.id, { ...selected, featured: !selected.featured });
      const list = await loadShelf();
      const fresh = list.find((pack) => pack.id === selected.id);
      setDraft(packToDraft(fresh));
      toast(fresh?.featured ? "已置顶" : "已取消置顶");
    });
  }

  async function confirmHardDelete() {
    if (!selected) return;
    if (deleteConfirm !== selected.id) {
      toast("请输入完整主题 id 以确认删除。", "err");
      return;
    }
    await run("delete", async () => {
      const result = await hardDeletePack(token, selected.id, true);
      if (result?.cancelled) return;
      await rebuildCatalog(token);
      await loadShelf();
      setSelectedId("");
      setCreating(false);
      setDraft(packToDraft(null));
      setDeleteOpen(false);
      setDeleteConfirm("");
      toast("已从货架和对象存储删除");
    });
  }

  async function confirmRebuild() {
    await run("rebuild", async () => {
      const result = await rebuildCatalog(token);
      await loadShelf();
      setRebuildOpen(false);
      toast(`目录已重建，共 ${result?.count ?? packs.length} 个主题`);
    });
  }

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") {
        setDeleteOpen(false);
        setRebuildOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const localPreviewUrl = useMemo(() => (previewFile ? URL.createObjectURL(previewFile) : ""), [previewFile]);
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  if (bootstrapping) {
    return (
      <div className="boot">
        <p>正在核验会话…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="login-shell">
        <form className="login-card" onSubmit={submitLogin}>
          <p className="eyebrow">Lucky Theme</p>
          <h1>主题运营台</h1>
          <p className="muted">上架、下架、换封面与发布目录。口令只存在本页会话，关闭标签页即失效。</p>
          <label>
            运营口令
            <input
              type="password"
              autoComplete="current-password"
              data-testid="login-token"
              value={loginValue}
              onChange={(event) => setLoginValue(event.target.value)}
              placeholder="输入 THEME_ADMIN_TOKEN"
            />
          </label>
          {loginError ? <p className="error" data-testid="login-error">{loginError}</p> : null}
          <button type="submit" data-testid="login-submit" disabled={busy === "login"}>
            {busy === "login" ? "验证中…" : "进入"}
          </button>
        </form>
      </div>
    );
  }

  const previewPack = creating
    ? { id: draft.id, displayName: draft.displayName, version: 1, preview: localPreviewUrl || undefined }
    : selected
      ? { ...selected, preview: localPreviewUrl || selected.preview }
      : null;

  return (
    <div className="console">
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))} />
      <header className="topbar" data-testid="console">
        <div>
          <p className="eyebrow">Lucky Theme</p>
          <h1>运营台</h1>
        </div>
        <dl className="stats">
          <div>
            <dt>全部</dt>
            <dd>{stats.total}</dd>
          </div>
          <div>
            <dt>在架</dt>
            <dd>{stats.published}</dd>
          </div>
          <div>
            <dt>下架</dt>
            <dd>{stats.hidden}</dd>
          </div>
          <div>
            <dt>工坊</dt>
            <dd>{stats.mature}</dd>
          </div>
          <div>
            <dt>置顶</dt>
            <dd>{stats.featured}</dd>
          </div>
        </dl>
        <div className="top-actions">
          <button type="button" className="ghost" onClick={() => setRebuildOpen(true)} disabled={Boolean(busy)}>
            重建目录
          </button>
          <button type="button" className="ghost" data-testid="logout" onClick={logout}>
            退出
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="shelf">
          <div className="toolbar">
            <input
              className="search"
              data-testid="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、id、标签"
              aria-label="搜索主题"
            />
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="状态">
              <option value="all">全部状态</option>
              <option value="published">在架</option>
              <option value="hidden">已下架</option>
            </select>
            <select value={audience} onChange={(event) => setAudience(event.target.value)} aria-label="受众">
              <option value="all">全部受众</option>
              <option value="standard">常规画廊</option>
              <option value="mature">成人向工坊</option>
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="排序">
              <option value="sort">权重 / 置顶</option>
              <option value="name">名称</option>
              <option value="id">id</option>
            </select>
            <button type="button" className="primary" onClick={startCreate}>
              新建主题
            </button>
          </div>
          <p className="count" data-testid="shelf-count">{visible.length} / {stats.total}</p>
          <ul className="pack-list" data-testid="pack-list">
            {visible.length === 0 ? (
              <li className="empty">没有匹配的主题。</li>
            ) : (
              visible.map((pack) => (
                <li key={pack.id}>
                  <button
                    type="button"
                    className={`pack-row ${pack.id === selectedId && !creating ? "active" : ""}`}
                    data-testid={`pack-${pack.id}`}
                    onClick={() => openPack(pack)}
                  >
                    <Cover pack={pack} />
                    <span className="meta">
                      <strong>{pack.displayName || pack.id}</strong>
                      <small>{pack.id}</small>
                      <span className="badges">
                        <span className={`badge ${(pack.status || "published") === "published" ? "on" : "off"}`}>
                          {(pack.status || "published") === "published" ? "在架" : "下架"}
                        </span>
                        {pack.audience === "mature" ? <span className="badge mature">工坊</span> : null}
                        {pack.featured ? <span className="badge feat">置顶</span> : null}
                        {pack.bundled ? <span className="badge">预置</span> : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <section className="editor" aria-live="polite">
          {!creating && !selected ? (
            <div className="blank">
              <h2>选择一个主题</h2>
              <p>从左侧货架打开详情，或新建主题。保存后会自动重建公开目录。</p>
            </div>
          ) : (
            <>
              <div className="editor-head">
                <div>
                  <p className="eyebrow">{creating ? "新建" : selected.id}</p>
                  <h2 data-testid="editor-title">{creating ? "新主题" : selected.displayName || selected.id}</h2>
                </div>
                {!creating && selected ? (
                  <div className="row">
                    {(selected.status || "published") === "published" ? (
                      <button type="button" onClick={() => setPackStatus("hidden")} disabled={Boolean(busy)}>
                        下架
                      </button>
                    ) : (
                      <button type="button" onClick={() => setPackStatus("published")} disabled={Boolean(busy)}>
                        上架
                      </button>
                    )}
                    <button type="button" onClick={toggleFeatured} disabled={Boolean(busy)}>
                      {selected.featured ? "取消置顶" : "置顶"}
                    </button>
                    <button type="button" className="danger" onClick={() => setDeleteOpen(true)} disabled={Boolean(busy)}>
                      删除
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="editor-grid">
                <div className="preview-pane">
                  <Cover pack={previewPack} className="hero" />
                  <dl className="facts">
                    <div>
                      <dt>包体积</dt>
                      <dd>{formatBytes(selected?.packBytes)}</dd>
                    </div>
                    <div>
                      <dt>版本</dt>
                      <dd>{selected?.version ?? (creating ? 1 : "—")}</dd>
                    </div>
                    <div>
                      <dt>zip</dt>
                      <dd>
                        {selected?.packUrl ? (
                          <a href={resolvePackZip(selected)} target="_blank" rel="noreferrer">
                            下载
                          </a>
                        ) : (
                          "未上传"
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="fields">
                  <label>
                    主题 id
                    <input
                      value={draft.id}
                      disabled={!creating}
                      onChange={(event) => setDraft({ ...draft, id: event.target.value.trim() })}
                      placeholder="chibi_maruko"
                    />
                  </label>
                  <label>
                    展示名
                    <input
                      value={draft.displayName}
                      onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                      placeholder="樱桃小丸子"
                    />
                  </label>
                  <label>
                    受众
                    <select value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value })}>
                      <option value="standard">常规画廊</option>
                      <option value="mature">成人向工坊</option>
                    </select>
                  </label>
                  <label>
                    状态
                    <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                      <option value="published">在架</option>
                      <option value="hidden">下架</option>
                    </select>
                  </label>
                  <label>
                    作者
                    <input value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} />
                  </label>
                  <label>
                    排序权重
                    <input
                      type="number"
                      value={draft.sort}
                      onChange={(event) => setDraft({ ...draft, sort: event.target.value })}
                    />
                  </label>
                  <label className="span-2">
                    简介
                    <input value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
                  </label>
                  <label className="span-2">
                    标签（逗号分隔）
                    <input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} />
                  </label>
                  <label>
                    主题包 zip
                    <input type="file" accept=".zip,application/zip" onChange={(event) => setZipFile(event.target.files?.[0] ?? null)} />
                    <small>{zipFile ? zipFile.name : "未选择新文件"}</small>
                  </label>
                  <label>
                    封面 preview.webp
                    <input
                      type="file"
                      accept="image/webp,image/png,image/jpeg"
                      onChange={(event) => setPreviewFile(event.target.files?.[0] ?? null)}
                    />
                    <small>{previewFile ? previewFile.name : "未选择新文件"}</small>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.featured}
                      onChange={(event) => setDraft({ ...draft, featured: event.target.checked })}
                    />
                    货架置顶
                  </label>
                </div>
              </div>

              <footer className="editor-foot">
                <p className="muted">{dirty ? "有未保存的更改" : "已与货架同步"}{busy ? ` · ${busy}…` : ""}</p>
                <button type="button" className="primary" onClick={saveDraft} disabled={Boolean(busy)}>
                  {busy === "save" ? "保存中…" : "保存并发布目录"}
                </button>
              </footer>
            </>
          )}
        </section>
      </div>

      {deleteOpen && selected ? (
        <div className="modal-backdrop" onClick={() => setDeleteOpen(false)}>
          <div className="modal" role="dialog" aria-labelledby="delete-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="delete-title">永久删除 {selected.displayName || selected.id}</h3>
            <p>会从公开货架和对象存储移除该主题的全部文件，不可恢复。</p>
            <label>
              输入 <code>{selected.id}</code> 确认
              <input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} />
            </label>
            <div className="row end">
              <button type="button" onClick={() => setDeleteOpen(false)}>取消</button>
              <button type="button" className="danger" onClick={confirmHardDelete} disabled={Boolean(busy)}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rebuildOpen ? (
        <div className="modal-backdrop" onClick={() => setRebuildOpen(false)}>
          <div className="modal" role="dialog" aria-labelledby="rebuild-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="rebuild-title">重建公开目录</h3>
            <p>按当前运营目录重写 catalog，并纠正旧域名资源地址。客户端会在下次刷新时拿到新 etag。</p>
            <div className="row end">
              <button type="button" onClick={() => setRebuildOpen(false)}>取消</button>
              <button type="button" className="primary" onClick={confirmRebuild} disabled={Boolean(busy)}>
                重建
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
