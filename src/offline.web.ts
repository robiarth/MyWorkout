export function registerOffline() {
  if (!__DEV__ && "serviceWorker" in navigator)
    void navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => console.warn("Cache hors ligne indisponible", error));
}
