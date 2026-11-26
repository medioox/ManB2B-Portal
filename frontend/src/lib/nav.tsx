"use client";
import React, { createContext, useContext } from "react";

export type Params = Record<string, string>;
export type Nav = {
  path: string;
  params: Params;
  push: (path: string, params?: Params) => void;
  replace: (path: string, params?: Params) => void;
};

export const NavContext = createContext<Nav>({ path: "/", params: {}, push: () => {}, replace: () => {} });
export const useNav = () => useContext(NavContext);

export function href(path: string, params?: Params) {
  const q = params && Object.keys(params).length ? "?" + new URLSearchParams(params).toString() : "";
  return path + q;
}

export function splitHref(h: string): [string, Params] {
  const [p, q] = h.split("?");
  return [p || "/", Object.fromEntries(new URLSearchParams(q || ""))];
}

export function Link({ to, className, children, onClick, ...rest }: {
  to: string; className?: string; children: React.ReactNode; onClick?: () => void; title?: string;
}) {
  const nav = useNav();
  return (
    <a
      href={to}
      className={className}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onClick?.();
        const [p, q] = splitHref(to);
        nav.push(p, q);
      }}
    >
      {children}
    </a>
  );
}

/**
 * Self-contained client router over the History API. Used by the Next.js shell (all routes
 * render the same client app) and adaptable to the single-file demo via `mode="memory"`.
 */
export function HistoryNavProvider({ children, mode = "history" }: { children: React.ReactNode; mode?: "history" | "memory" }) {
  const read = (): [string, Params] => {
    if (typeof window === "undefined" || mode === "memory") return ["/", {}];
    return [window.location.pathname || "/", Object.fromEntries(new URLSearchParams(window.location.search))];
  };
  const [state, setState] = React.useState<[string, Params]>(read);
  React.useEffect(() => {
    if (mode === "memory") return;
    const on = () => setState(read());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []); // eslint-disable-line
  const nav = React.useMemo<Nav>(() => ({
    path: state[0],
    params: state[1],
    push: (p, q = {}) => {
      if (mode === "history") window.history.pushState(null, "", href(p, q));
      setState([p, q]);
      window.scrollTo(0, 0);
    },
    replace: (p, q = {}) => {
      if (mode === "history") window.history.replaceState(null, "", href(p, q));
      setState([p, q]);
    },
  }), [state, mode]);
  return <NavContext.Provider value={nav}>{children}</NavContext.Provider>;
}
