import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Condition, NetworkNode, Role } from "@majimap/shared-types";
import { CONDITION_LABEL } from "./theme";
import {
    mockInspections,
    mockNodes,
    mockOrg,
    mockPipes,
    mockQueue,
    mockStructures,
    mockUser,
    mockValveLogs,
    type InspectionEntry,
    type SyncItem,
    type ValveEntry,
} from "./mock-data";
import { mockJunctionSpecs, type AppNode } from "./asset-rules";
import { mockWorkOrders, type WorkOrder } from "./work-orders";
import type { Attachment } from "./attachments";
import { mockBranches, simulatePost, type PostResult, type Resolutions, type ReviewBranch } from "./review";
import type { Outcome } from "./work-orders";

/**
 * MOCK STATE. One provider stands in for what will become the tRPC client +
 * an offline store. Screens only talk to `useApp()`, so swapping the mock for
 * real queries touches this file, not the screens.
 *
 * Ids: the server requires 8–64 chars of [A-Za-z0-9_-] and lets the client
 * mint them (offline creates, safe retries). `uid()` mimics that.
 */
const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Demo only: the username decides the role. Real roles come from gisUserRoles. */
const roleFor = (username: string): Role =>
    username.includes("admin") ? "admin" : username.includes("eng") ? "gis_engineer" : username.includes("view") ? "viewer" : "field_technician";

type SignInResult = { ok: true } | { ok: false; error: string };

type NewNodeInput = Omit<AppNode, "id">;

type AppValue = {
    signedIn: boolean;
    user: typeof mockUser & { username: string };
    org: typeof mockOrg;
    role: Role;
    setRole: (r: Role) => void;
    savedOrgCode: string;
    hasSignedInBefore: boolean;
    signIn: (a: { orgCode: string; username: string; password: string }) => Promise<SignInResult>;
    signOut: () => void;

    nodes: AppNode[];
    workOrders: WorkOrder[];
    holdWorkOrder: (id: string, h: { reason: string; note: string; attachments: Attachment[] }) => void;
    completeWorkOrder: (id: string, c: { outcome: Outcome; note: string; attachments: Attachment[] }) => void;

    branches: ReviewBranch[];
    postBranch: (branch: string, resolutions: Resolutions) => Promise<PostResult>;
    discardBranch: (branch: string) => Promise<void>;

    recordCondition: (assetId: string, condition: Condition, note: string, workOrderId?: string) => void;
    operateValve: (valveId: string, isOpen: boolean, note: string, workOrderId?: string) => void;
    pipes: typeof mockPipes;
    structures: typeof mockStructures;
    inspections: InspectionEntry[];
    valveLogs: ValveEntry[];

    queue: SyncItem[];
    pending: number;
    awaitingReview: number;
    online: boolean;
    setOnline: (v: boolean) => void;
    syncing: boolean;
    lastSyncedAt: string;
    syncNow: () => Promise<void>;

    addNode: (input: NewNodeInput) => void;
    queueCreate: (title: string, assetName: string, detail: string) => void;

    showToast: (message: string) => void;
};

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
    return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
    const insets = useSafeAreaInsets();

    const [signedIn, setSignedIn] = useState(false);
    const [username, setUsername] = useState(mockUser.username);
    const [role, setRole] = useState<Role>("field_technician");
    const [savedOrgCode, setSavedOrgCode] = useState("");
    const [hasSignedInBefore, setHasSignedInBefore] = useState(false);

    const [nodes, setNodes] = useState<AppNode[]>(() =>
        mockNodes.map((n) => ({ ...n, junction: mockJunctionSpecs[n.id] ?? null, attachments: [] })),
    );
    const [inspections, setInspections] = useState(mockInspections);
    const [valveLogs, setValveLogs] = useState(mockValveLogs);
    const [queue, setQueue] = useState(mockQueue);

    const [online, setOnline] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState(() => new Date(Date.now() - 12 * 60000).toISOString());

    const [toast, setToast] = useState<string | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [workOrders, setWorkOrders] = useState<WorkOrder[]>(mockWorkOrders);
    const [branches, setBranches] = useState<ReviewBranch[]>(mockBranches);

    const showToast = useCallback((message: string) => {
        setToast(message);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2600);
    }, []);

    const user = useMemo(() => ({ ...mockUser, username }), [username]);

    const signIn: AppValue["signIn"] = async ({ orgCode, username: u, password }) => {
        await wait(700);
        // Demo rule so the error state can be previewed: the password "wrong" fails.
        if (password === "wrong") return { ok: false, error: "That username or password isn't right. Check them and try again." };
        // Real call: authClient.signIn.username({ username: `${u}.${orgCode}`, password })
        const name = u.trim().toLowerCase();
        setUsername(name);
        setRole(roleFor(name));
        setSavedOrgCode(orgCode.trim().toLowerCase());
        setHasSignedInBefore(true);
        setSignedIn(true);
        return { ok: true };
    };

    const signOut = () => setSignedIn(false);

    const enqueue = (item: Omit<SyncItem, "id" | "at" | "status">) => {
        setQueue((q) => [{ ...item, id: uid(), at: new Date().toISOString(), status: "queued" }, ...q]);
        showToast("Saved to your changes");
    };

    const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? "Asset";

    const patchOrder = (id: string, fn: (o: WorkOrder) => WorkOrder) => setWorkOrders((os) => os.map((o) => (o.id === id ? fn(o) : o)));
    /** Doing the work from the job's screen marks it in progress. */
    const touchOrder = (workOrderId?: string) => {
        if (!workOrderId) return;
        patchOrder(workOrderId, (o) => (o.status === "pending" || o.status === "blocked" ? { ...o, status: "in_progress", hold: undefined } : o));
    };

    const recordCondition: AppValue["recordCondition"] = (assetId, condition, note, workOrderId) => {
        const now = new Date().toISOString();
        setNodes((ns) => ns.map((n) => (n.id === assetId ? { ...n, condition, lastInspectedAt: now } : n)));
        setInspections((l) => [{ id: uid(), assetId, condition, note: note.trim() || null, recordedAt: now, recordedByName: mockUser.name }, ...l]);
        enqueue({ kind: "condition", assetId, title: "Inspection", assetName: nameOf(assetId), detail: CONDITION_LABEL[condition] });
        touchOrder(workOrderId);
    };

    const operateValve: AppValue["operateValve"] = (valveId, isOpen, note, workOrderId) => {
        const now = new Date().toISOString();
        setNodes((ns) => ns.map((n) => (n.id === valveId ? { ...n, isOpen } : n)));
        setValveLogs((l) => [{ id: uid(), valveId, isOpen, changedAt: now, changedByName: mockUser.name, note: note.trim() || null }, ...l]);
        enqueue({ kind: "valve", assetId: valveId, title: "Valve operated", assetName: nameOf(valveId), detail: isOpen ? "Open" : "Closed" });
        touchOrder(workOrderId);
    };

    const orderInfo = (id: string) => workOrders.find((o) => o.id === id);

    const holdWorkOrder: AppValue["holdWorkOrder"] = (id, h) => {
        patchOrder(id, (o) => ({
            ...o,
            status: "blocked",
            hold: { reason: h.reason, note: h.note, at: new Date().toISOString(), photoCount: h.attachments.filter((a) => a.kind === "photo").length },
        }));
        enqueue({ kind: "workorder", assetId: null, title: "Couldn't finish", assetName: orderInfo(id)?.title ?? "", detail: h.reason });
    };

    const completeWorkOrder: AppValue["completeWorkOrder"] = (id, c) => {
        patchOrder(id, (o) => ({ ...o, status: "completed", hold: undefined, completion: { at: new Date().toISOString(), outcome: c.outcome, note: c.note, photoCount: c.attachments.filter((a) => a.kind === "photo").length } }));
        enqueue({ kind: "workorder", assetId: null, title: "Job completed", assetName: orderInfo(id)?.title ?? "", detail: orderInfo(id)?.code ?? "" });
    };

    const postBranch: AppValue["postBranch"] = async (name, resolutions) => {
        await wait(900);
        const b = branches.find((x) => x.branch === name);
        if (!b) return { status: "invalid", violations: [{ code: "gone", entityId: "", relatedId: "", message: "This set of changes is no longer available." }] };
        const res = simulatePost(b, resolutions);
        if (res.status === "posted") setBranches((bs) => bs.filter((x) => x.branch !== name));
        return res;
    };
    const discardBranch: AppValue["discardBranch"] = async (name) => {
        await wait(400);
        setBranches((bs) => bs.filter((x) => x.branch !== name));
        showToast("Changes discarded");
    };

    const addNode: AppValue["addNode"] = (input) => {
        const id = uid();
        setNodes((ns) => [...ns, { ...input, id }]);
        enqueue({ kind: "create", assetId: id, title: "New asset", assetName: input.name, detail: "Added to your changes" });
    };

    const queueCreate: AppValue["queueCreate"] = (title, assetName, detail) =>
        enqueue({ kind: "create", assetId: null, title, assetName, detail });

    const syncNow = async () => {
        if (!online || syncing) return;
        if (!queue.some((i) => i.status === "queued" || i.status === "failed")) {
            showToast("Already up to date");
            return;
        }
        setSyncing(true);
        await wait(1000);
        setQueue((q) => q.map((i) => (i.status === "queued" || i.status === "failed" ? { ...i, status: "applied", error: undefined } : i)));
        setLastSyncedAt(new Date().toISOString());
        setSyncing(false);
        showToast("Changes uploaded");
    };

    const pending = queue.filter((i) => i.status === "queued" || i.status === "failed").length;
    const awaitingReview = queue.filter((i) => i.status === "applied" && !i.reviewed).length;

    const value: AppValue = {
        signedIn, user, org: mockOrg, role, setRole, savedOrgCode, hasSignedInBefore, signIn, signOut,
        nodes, pipes: mockPipes, workOrders, holdWorkOrder, completeWorkOrder,
        branches, postBranch, discardBranch, structures: mockStructures, inspections, valveLogs,
        queue, pending, awaitingReview, online, setOnline, syncing, lastSyncedAt, syncNow,
        recordCondition, operateValve, addNode, queueCreate, showToast,
    };

    return (
        <AppContext.Provider value={value}>
            {children}
            {toast && (
                <View pointerEvents="none" style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, zIndex: 100 }}>
                    <View className="self-center rounded-full bg-zinc-900 dark:bg-zinc-100 px-4 py-3">
                        <Text className="text-sm font-medium text-white dark:text-zinc-900">{toast}</Text>
                    </View>
                </View>
            )}
        </AppContext.Provider>
    );
}
