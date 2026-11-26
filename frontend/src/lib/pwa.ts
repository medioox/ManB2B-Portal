import { api } from "./api";

/** Register the service worker (installable PWA + push notifications). */
export async function registerPWA() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    /* non-fatal */
  }
}

/** Ask permission and store the push subscription on the server. */
export async function enablePush(vapidPublicKey: string) {
  const reg = await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  const key = Uint8Array.from(atob(vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON() as any;
  await api.post("/notifications/subscribe/", { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
  return true;
}
