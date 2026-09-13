import { useEffect, useMemo, useState } from "react";
import {
  fetchAdminPacks,
  hardDeletePack,
  hidePack,
  publicPreview,
  rebuildCatalog,
  uploadAsset,
  uploadZip,
  upsertPack,
} from "./ops.js";

const TOKEN_KEY = "lucky-theme-admin-token";

function emptyDraft(id = "") {
  return {
    id,
    displayName: "",
    audience: "standard",
    author: "Lucky Theme Studio",
    summary: "",
    tags: "",
    sort: 0,
    featured: false,
    status: "published",
  };
}

export function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [packs, setPacks] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState(emptyDraft());
  const [zipFile, setZipFile] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [busy, setBusy] = useState("");
  const [confirmHard, setConfirmHard] = useState("");

  const published = useMemo(() => publicPreview(packs), [packs]);

  function persistToken(value) {
    setToken(value);
    sessionStorage.setItem(TOKEN_KEY, value);
  }

  async function run(label, work) {
    setError("");
    setStatus("");
    setBusy(label);
    try {
      const result = await work();
      setStatus(label);
      return result;
    } catch (cause) {
      setError(String(cause.message || cause));
      return null;
    } finally {
      setBusy("");
    }
  }

  async function loadAdmin() {
    await run("loaded", async () => {
      const data = await fetchAdminPacks(token);
      setPacks(data.packs ?? []);
    });
  }

  useEffect(() => {
    loadAdmin();
  }, []);

  function edit(pack) {
    setDraft({
      id: pack.id,
      displayName: pack.displayName || "",
      audience: pack.audience || "standard",
      author: pack.author || "",
      summary: pack.summary || "",
      tags: (pack.tags || []).join(","),
      sort: pack.sort ?? 0,
      featured: Boolean(pack.featured),
      status: pack.status || "published",
    });
    setConfirmHard("");
  }

  async function saveDraft() {
    if (!draft.id) {
      setError("id required");
      return;
    }
    await run("saved", async () => {
      await upsertPack(token, draft.id, {
        displayName: draft.displayName,
        audience: draft.audience,
        author: draft.author,
        summary: draft.summary,
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        sort: Number(draft.sort) || 0,
        featured: draft.featured,
        status: draft.status,
      });
      if (zipFile) await uploadZip(token, draft.id, zipFile);
      if (previewFile) await uploadAsset(token, draft.id, "preview.webp", previewFile);
      await rebuildCatalog(token);
      setZipFile(null);
      setPreviewFile(null);
      await loadAdmin();
    });
  }

  async function setStatusFor(pack, statusValue) {
    await run(statusValue, async () => {
      if (statusValue === "hidden") await hidePack(token, pack.id);
      else await upsertPack(token, pack.id, { ...pack, status: statusValue });
      await rebuildCatalog(token);
      await loadAdmin();
    });
  }

  async function hardDelete(pack) {
    await run("hard-delete", async () => {
      const result = await hardDeletePack(token, pack.id, confirmHard === pack.id);
      if (result?.cancelled) {
        setError("confirm hard delete by typing the pack id");
        return;
      }
      setConfirmHard("");
      await loadAdmin();
    });
  }

  return (
    <main>
      <h1>Lucky Theme Admin</h1>
      <p>货架 SSOT 是 Worker 目录。上架 / 隐藏 / 换图 / 传 zip 后会 rebuild catalog。</p>
      {error ? <p className="error">{error}</p> : null}
      {status ? <p>{busy ? `${busy}…` : status}</p> : null}
      <div className="row">
        <input
          placeholder="admin token"
          value={token}
          onChange={(event) => persistToken(event.target.value)}
        />
        <button type="button" onClick={loadAdmin}>刷新货架</button>
        <button type="button" onClick={() => setDraft(emptyDraft())}>新建</button>
      </div>
      <table className="shelf">
        <thead>
          <tr>
            <th>封面</th>
            <th>id</th>
            <th>名称</th>
            <th>受众</th>
            <th>ver</th>
            <th>status</th>
            <th>sort</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {packs.map((pack) => (
            <tr key={pack.id}>
              <td>{pack.preview ? <img className="thumb" src={pack.preview} alt="" /> : "—"}</td>
              <td>{pack.id}</td>
              <td>{pack.displayName}</td>
              <td>{pack.audience}</td>
              <td>{pack.version}</td>
              <td>{pack.status || "published"}</td>
              <td>{pack.sort ?? 0}</td>
              <td className="row">
                <button type="button" onClick={() => edit(pack)}>编辑</button>
                {pack.status === "hidden" ? (
                  <button type="button" onClick={() => setStatusFor(pack, "published")}>上架</button>
                ) : (
                  <button type="button" onClick={() => setStatusFor(pack, "hidden")}>下架</button>
                )}
                <button type="button" onClick={() => upsertPack(token, pack.id, { ...pack, featured: !pack.featured }).then(loadAdmin)}>
                  {pack.featured ? "取消置顶" : "置顶"}
                </button>
                <button type="button" onClick={() => hardDelete(pack)}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="editor">
        <h2>{draft.id ? `编辑 ${draft.id}` : "新建主题"}</h2>
        <div className="row">
          <input placeholder="id" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
          <input placeholder="displayName" value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
          <select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value })}>
            <option value="standard">standard</option>
            <option value="mature">mature</option>
          </select>
          <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
            <option value="published">published</option>
            <option value="hidden">hidden</option>
          </select>
        </div>
        <div className="row">
          <input placeholder="author" value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} />
          <input placeholder="summary" value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
          <input placeholder="tags" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
          <input type="number" placeholder="sort" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: e.target.value })} />
          <label>
            <input type="checkbox" checked={draft.featured} onChange={(e) => setDraft({ ...draft, featured: e.target.checked })} />
            featured
          </label>
        </div>
        <div className="row">
          <label>zip <input type="file" accept=".zip,application/zip" onChange={(e) => setZipFile(e.target.files?.[0] ?? null)} /></label>
          <label>preview <input type="file" accept="image/webp,image/png,image/jpeg" onChange={(e) => setPreviewFile(e.target.files?.[0] ?? null)} /></label>
          <button type="button" onClick={saveDraft} disabled={Boolean(busy)}>保存并 rebuild</button>
        </div>
        <div className="row">
          <input
            placeholder="type pack id to confirm hard delete"
            value={confirmHard}
            onChange={(e) => setConfirmHard(e.target.value)}
          />
        </div>
      </section>
      <h2>公开货架预览</h2>
      <div className="grid">
        {published.map((pack) => (
          <article className="card" key={pack.id}>
            {pack.preview ? <img src={pack.preview} alt={pack.displayName} /> : null}
            <p>
              {pack.displayName}
              <br />
              <small>{pack.id} · v{pack.version} · {pack.audience}</small>
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
