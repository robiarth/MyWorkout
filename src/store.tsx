import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { Session as AuthSession } from "@supabase/supabase-js";
import { backend, localDemo, rpc } from "./backend";
import { read, write, remove } from "./storage";
import {
  State,
  clone,
  emptyState,
  mergeStates,
  newId,
  stateSchema,
} from "./domain";
import { catalog } from "./catalog";

type Envelope = {
  data: State;
  revision: number;
  dirty: boolean;
  mutation: string;
  conflict?: { data: State; revision: number };
};
type Member = { role: "member" | "admin"; suspended: boolean };
type Account = { user: { id: string; email?: string } };
type Store = {
  state: State;
  ready: boolean;
  auth: Account | null;
  member: Member | null;
  demo: boolean;
  message: string;
  setMessage: (s: string) => void;
  cloudStatus: string;
  conflict?: Envelope["conflict"];
  change: (fn: (s: State) => State) => Promise<void>;
  sync: () => Promise<void>;
  resolve: (which: "local" | "remote") => Promise<void>;
  reloadMember: () => Promise<void>;
};
const Context = createContext<Store | null>(null);
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error("Store absent");
  return store;
}
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<Account | null>(null),
    [member, setMember] = useState<Member | null>(null);
  const [onlineSession, setOnlineSession] = useState(false);
  const remoteSession = useRef<AuthSession | null>(null);
  const [state, setState] = useState<State>(emptyState),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [cloudStatus, setCloudStatus] = useState("Chargement…");
  const [conflict, setConflict] = useState<Envelope["conflict"]>();
  const envelope = useRef<Envelope>({
    data: emptyState(),
    revision: 0,
    dirty: false,
    mutation: newId(),
  });
  const key = useRef(""),
    queue = useRef(Promise.resolve()),
    identity = useRef(0),
    membershipReady = useRef(false),
    syncRunning = useRef(false);
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = queue.current.then(fn);
    queue.current = p.then(
      () => {},
      () => {},
    );
    return p;
  }
  async function persist(next: Envelope, generation: number) {
    if (generation !== identity.current) throw new Error("Le compte a changé.");
    await write(key.current, JSON.stringify(next));
    if (generation !== identity.current) return;
    envelope.current = next;
    setState(next.data);
    setConflict(next.conflict);
  }
  async function reloadMember() {
    if (!backend || !auth || !remoteSession.current) return;
    const generation = identity.current;
    const { data, error } = await backend
      .from("members")
      .select("role,suspended")
      .eq("id", auth.user.id)
      .abortSignal(AbortSignal.timeout(8000))
      .maybeSingle();
    if (generation !== identity.current) return;
    if (error) throw new Error(error.message);
    const previouslyMember = membershipReady.current;
    setMember(data);
    membershipReady.current = !!data && !data.suspended;
    await write(`member:${auth.user.id}`, JSON.stringify(data));
    if (previouslyMember && !data) {
      await remove(`state:${auth.user.id}`);
      envelope.current = {
        data: emptyState(),
        revision: 0,
        dirty: false,
        mutation: newId(),
      };
      setState(emptyState());
      setConflict(undefined);
      throw new Error("Ce compte ne dispose plus de données dans la bêta.");
    }
  }
  useEffect(() => {
    if (!backend) {
      if (localDemo) setAuth(null);
      return;
    }
    let alive = true,
      sequence = 0;
    async function updateAuth(session: AuthSession | null) {
      const ticket = ++sequence;
      remoteSession.current = session;
      setOnlineSession(!!session);
      if (session) {
        const account = {
          user: { id: session.user.id, email: session.user.email },
        };
        await write("last-account", JSON.stringify(account));
        if (alive && ticket === sequence) setAuth(account);
      } else {
        const cached = await read("last-account");
        if (alive && ticket === sequence)
          setAuth(cached ? JSON.parse(cached) : null);
      }
    }
    void read("last-account")
      .then((cached) => {
        if (alive && !remoteSession.current && cached)
          setAuth(JSON.parse(cached));
      })
      .catch((e) => setMessage(String(e)));
    backend.auth.getSession().then(({ data, error }) => {
      if (error)
        setCloudStatus("Connexion indisponible — carnet local conservé");
      void updateAuth(data.session).catch((e) => setMessage(String(e)));
    });
    const { data } = backend.auth.onAuthStateChange((_event, session) => {
      void updateAuth(session).catch((e) => setMessage(String(e)));
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let alive = true;
    const generation = ++identity.current;
    setReady(false);
    setMember(null);
    setConflict(undefined);
    membershipReady.current = localDemo;
    key.current = localDemo
      ? "state:development"
      : auth
        ? `state:${auth.user.id}`
        : "";
    if (!key.current) {
      setState(emptyState());
      return;
    }
    (async () => {
      try {
        const raw = await read(key.current);
        if (!alive) return;
        const next: Envelope = raw
          ? JSON.parse(raw)
          : {
              data: { ...emptyState(), exercises: catalog },
              revision: 0,
              dirty: false,
              mutation: newId(),
            };
        next.data = stateSchema.parse(next.data);
        envelope.current = next;
        setState(next.data);
        setConflict(next.conflict);
        if (auth && backend) {
          const cached = await read(`member:${auth.user.id}`);
          if (!alive) return;
          if (cached) {
            const m = JSON.parse(cached) as Member | null;
            setMember(m);
            membershipReady.current = !!m && !m.suspended;
          }
          try {
            await reloadMember();
          } catch {
            setCloudStatus("Hors ligne — données locales conservées");
          }
        }
        if (!alive || generation !== identity.current) return;
        setReady(true);
        if (localDemo) setCloudStatus("Développement local — sans compte");
      } catch (error) {
        setMessage(
          `Chargement impossible, données conservées : ${String(error)}`,
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [auth?.user.id]);
  async function change(fn: (s: State) => State) {
    const generation = identity.current;
    try {
      await serial(async () => {
        if (!ready || !membershipReady.current)
          throw new Error("Accès indisponible.");
        const data = stateSchema.parse(fn(clone(envelope.current.data)));
        await persist(
          { ...envelope.current, data, dirty: true, mutation: newId() },
          generation,
        );
        setCloudStatus(
          localDemo
            ? "Enregistré sur cet appareil"
            : "Enregistré localement — à synchroniser",
        );
      });
    } catch (error) {
      setMessage(`Non enregistré : ${String(error)}`);
      throw error;
    }
  }
  async function sync() {
    if (!backend || !ready || !membershipReady.current || syncRunning.current)
      return;
    const generation = identity.current;
    syncRunning.current = true;
    try {
      if (!remoteSession.current) {
        setCloudStatus(
          "Session expirée — reconnectez-vous pour synchroniser. Carnet local disponible.",
        );
        return;
      }
      if (envelope.current.conflict) return;
      setCloudStatus("Synchronisation…");
      await reloadMember();
      if (generation !== identity.current) return;
      if (!membershipReady.current)
        throw new Error("Accès au compte suspendu ou supprimé.");
      const current = envelope.current;
      const result = await rpc<{
        revision: number;
        data: unknown;
        conflict?: boolean;
      }>("sync_document", {
        expected_revision: current.revision,
        mutation_id: current.mutation,
        document: current.dirty ? current.data : null,
      });
      await serial(async () => {
        if (generation !== identity.current) return;
        const latest = envelope.current;
        const data = result.data ? stateSchema.parse(result.data) : latest.data;
        const editedDuringPull =
          !current.dirty &&
          latest.mutation !== current.mutation &&
          result.revision !== current.revision;
        if (result.conflict || editedDuringPull) {
          await persist(
            { ...latest, conflict: { data, revision: result.revision } },
            generation,
          );
          setCloudStatus("Conflit — choix requis, deux copies conservées");
          return;
        }
        await persist(
          {
            data,
            revision: result.revision,
            dirty: false,
            mutation: current.mutation,
            ...(latest.mutation !== current.mutation
              ? {
                  data: latest.data,
                  dirty: latest.dirty,
                  mutation: latest.mutation,
                }
              : {}),
          },
          generation,
        );
      });
      if (generation !== identity.current || envelope.current.conflict) return;
      const { data: shared, error } = await backend!
        .from("catalog")
        .select("id,body")
        .eq("hidden", false)
        .abortSignal(AbortSignal.timeout(8000));
      if (error) throw error;
      // Community records are cached locally, never overwrite personal snapshots in sessions.
      if (shared) {
        await serial(async () => {
          if (generation !== identity.current) return;
          const next = envelope.current;
          const ids = new Set(shared.map((x) => x.id));
          const updated = {
            ...next.data,
            exercises: [
              ...next.data.exercises.filter((e) => !e.shared && !ids.has(e.id)),
              ...shared.map((x) => ({
                ...x.body,
                id: x.id,
                shared: true,
                archived:
                  next.data.exercises.find((e) => e.id === x.id)?.archived ??
                  false,
              })),
            ],
          };
          await persist(
            { ...next, data: stateSchema.parse(updated) },
            generation,
          );
        });
      }
      if (generation === identity.current)
        setCloudStatus(
          envelope.current.dirty
            ? "Enregistré localement — à synchroniser"
            : "Synchronisé",
        );
    } catch (error) {
      setCloudStatus(
        `Non synchronisé — copie locale conservée : ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      syncRunning.current = false;
    }
  }
  async function resolve(which: "local" | "remote") {
    const generation = identity.current;
    await serial(async () => {
      const current = envelope.current,
        other = current.conflict;
      if (!other) return;
      const data =
        which === "local"
          ? mergeStates(current.data, other.data)
          : mergeStates(other.data, current.data);
      await persist(
        { data, revision: other.revision, dirty: true, mutation: newId() },
        generation,
      );
      setCloudStatus("Conflit résolu localement — à synchroniser");
    });
    await sync();
  }
  useEffect(() => {
    if (!ready) return;
    void sync();
    const timer = setInterval(() => void sync(), 30000);
    const listener = AppState.addEventListener("change", (s) => {
      if (backend) {
        if (s === "active") {
          backend.auth.startAutoRefresh();
          void sync();
        } else backend.auth.stopAutoRefresh();
      }
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [ready, onlineSession]);
  return (
    <Context.Provider
      value={{
        state,
        ready,
        auth,
        member,
        demo: localDemo,
        message,
        setMessage,
        cloudStatus,
        conflict,
        change,
        sync,
        resolve,
        reloadMember,
      }}
    >
      {children}
    </Context.Provider>
  );
}
