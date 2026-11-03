import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
let db: Promise<SQLite.SQLiteDatabase> | undefined;
async function database() {
  if (!db)
    db = (async () => {
      const d = await SQLite.openDatabaseAsync("myworkout.db");
      await d.execAsync(
        "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS documents (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      );
      return d;
    })();
  return db;
}
export async function read(key: string) {
  return (
    (
      await (
        await database()
      ).getFirstAsync<{ value: string }>(
        "SELECT value FROM documents WHERE key = ?",
        key,
      )
    )?.value ?? null
  );
}
export async function write(key: string, value: string) {
  await (
    await database()
  ).runAsync(
    "INSERT INTO documents(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}
export async function remove(key: string) {
  await (await database()).runAsync("DELETE FROM documents WHERE key = ?", key);
}
export const authStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};
