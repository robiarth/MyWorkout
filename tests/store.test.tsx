import React from "react";
import { Text } from "react-native";
import { beforeEach, test, expect, jest } from "@jest/globals";
import { act, render, waitFor } from "@testing-library/react-native";
import { StoreProvider, useStore } from "../src/store";
import { emptyState } from "../src/domain";

jest.mock("../src/storage", () => {
  const values = new Map<string, string>();
  return {
    values,
    read: jest.fn(async (key: string) => values.get(key) ?? null),
    write: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    remove: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
});
jest.mock("../src/backend", () => ({
  localDemo: false,
  rpc: jest.fn(async () => ({ revision: 0, data: null })),
  backend: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { user: { id: "member" } } },
      })),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
    from: (table: string) =>
      table === "members"
        ? {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            abortSignal() {
              return this;
            },
            maybeSingle: async () => ({
              data: { role: "member", suspended: false },
              error: null,
            }),
          }
        : {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            abortSignal: async () => ({ data: [], error: null }),
          },
  },
}));
const storage = jest.requireMock("../src/storage") as {
  values: Map<string, string>;
  write: ReturnType<
    typeof jest.fn<(key: string, value: string) => Promise<void>>
  >;
};
const service = jest.requireMock("../src/backend") as {
  rpc: ReturnType<typeof jest.fn<() => Promise<unknown>>>;
  backend: {
    auth: { getSession: ReturnType<typeof jest.fn<() => Promise<unknown>>> };
  };
};
let current: ReturnType<typeof useStore>;
function Probe() {
  current = useStore();
  return <Text>{current.cloudStatus}</Text>;
}
async function boot() {
  await render(
    <StoreProvider>
      <Probe />
    </StoreProvider>,
  );
  await waitFor(() => expect(current.cloudStatus).toBe("Synchronisé"));
}
beforeEach(() => {
  storage.values.clear();
  storage.write.mockClear();
  service.rpc.mockReset();
  service.rpc.mockResolvedValue({ revision: 0, data: null });
  service.backend.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: "member" } } },
  });
});

test("un compte déjà connecté garde le carnet modifiable hors ligne même après expiration du jeton", async () => {
  storage.values.set(
    "last-account",
    JSON.stringify({ user: { id: "member" } }),
  );
  storage.values.set(
    "member:member",
    JSON.stringify({ role: "member", suspended: false }),
  );
  storage.values.set(
    "state:member",
    JSON.stringify({
      data: emptyState(),
      revision: 2,
      dirty: false,
      mutation: "old",
    }),
  );
  service.backend.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: { message: "réseau indisponible" },
  });
  await render(
    <StoreProvider>
      <Probe />
    </StoreProvider>,
  );
  await waitFor(() => expect(current.cloudStatus).toContain("Session expirée"));
  await act(() => current.change((s) => ({ ...s, favorites: ["offline"] })));
  expect(current.state.favorites).toEqual(["offline"]);
  expect(service.rpc).not.toHaveBeenCalled();
});
test("une écriture locale refusée ne confirme ni ne modifie le carnet", async () => {
  await boot();
  const before = current.state;
  storage.write.mockRejectedValueOnce(new Error("disque plein"));
  await act(async () => {
    await expect(
      current.change((s) => ({ ...s, favorites: ["x"] })),
    ).rejects.toThrow("disque plein");
  });
  expect(current.state).toBe(before);
  expect(current.message).toContain("Non enregistré");
});
test("une synchronisation lente ne bloque pas la sauvegarde et ne remplace pas une saisie plus récente", async () => {
  await boot();
  await act(() => current.change((s) => ({ ...s, favorites: ["first"] })));
  let reply!: (v: unknown) => void;
  service.rpc.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        reply = resolve;
      }),
  );
  let syncing!: Promise<void>;
  await act(async () => {
    syncing = current.sync();
  });
  await waitFor(() => expect(reply).toBeDefined());
  await act(() => current.change((s) => ({ ...s, favorites: ["latest"] })));
  expect(
    JSON.parse(storage.values.get("state:member")!).data.favorites,
  ).toEqual(["latest"]);
  await act(async () => {
    reply({ revision: 1, data: { ...emptyState(), favorites: ["first"] } });
    await syncing;
  });
  expect(current.state.favorites).toEqual(["latest"]);
  expect(JSON.parse(storage.values.get("state:member")!).revision).toBe(1);
  expect(JSON.parse(storage.values.get("state:member")!).dirty).toBe(true);
});
test("un conflit conserve les deux versions sur disque et attend un choix", async () => {
  await boot();
  await act(() => current.change((s) => ({ ...s, favorites: ["local"] })));
  service.rpc.mockResolvedValueOnce({
    conflict: true,
    revision: 3,
    data: { ...emptyState(), favorites: ["remote"] },
  });
  await act(() => current.sync());
  expect(current.state.favorites).toEqual(["local"]);
  expect(current.conflict?.data.favorites).toEqual(["remote"]);
  expect(
    JSON.parse(storage.values.get("state:member")!).conflict.revision,
  ).toBe(3);
});
