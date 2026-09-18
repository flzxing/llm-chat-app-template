export const OPS_BASE = "/ops";

export const OPS_MODULES = [
  {
    id: "themes",
    title: "主题管理",
    status: "open",
    href: "/themes",
    kicker: "开放",
    blurb: "上架、下架、换封面，并发布公开目录。",
    cover: "themes",
  },
  {
    id: "prompts",
    title: "Prompt 管理",
    status: "soon",
    href: "/prompts",
    kicker: "即将开放",
    blurb: "系统提示词、场景模板与版本回滚。",
    cover: "prompts",
  },
  {
    id: "skills",
    title: "Skills 管理",
    status: "soon",
    href: "/skills",
    kicker: "即将开放",
    blurb: "技能包审核、上下架与客户端同步。",
    cover: "skills",
  },
  {
    id: "pets",
    title: "Pets 管理",
    status: "soon",
    href: "/pets",
    kicker: "即将开放",
    blurb: "桌面宠物货架、动作集与商店封面。",
    cover: "pets",
  },
];

export function parseOpsPath(pathname = "/") {
  if (pathname === OPS_BASE || pathname === `${OPS_BASE}/`) return "/";
  if (pathname.startsWith(`${OPS_BASE}/`)) {
    const rest = pathname.slice(OPS_BASE.length);
    return rest.replace(/\/$/, "") || "/";
  }
  return pathname || "/";
}

export function opsUrl(routePath) {
  if (!routePath || routePath === "/") return `${OPS_BASE}/`;
  return `${OPS_BASE}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;
}

export function moduleByPath(routePath) {
  return OPS_MODULES.find((item) => item.href === routePath) || null;
}

export function isOpenModule(mod) {
  return mod?.status === "open";
}

export function readStoredToken(storage = sessionStorage) {
  return storage.getItem("lucky-ops-token") ?? storage.getItem("lucky-theme-admin-token") ?? "";
}

export function persistOpsToken(token, storage = sessionStorage) {
  storage.setItem("lucky-ops-token", token);
  storage.removeItem("lucky-theme-admin-token");
}

export function clearOpsToken(storage = sessionStorage) {
  storage.removeItem("lucky-ops-token");
  storage.removeItem("lucky-theme-admin-token");
}
