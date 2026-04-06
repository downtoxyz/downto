import type { InterestCheck } from "@/lib/ui-types";

// ─── State ──────────────────────────────────────────────────────────────────

export interface ChecksState {
  checks: InterestCheck[];
  myCheckResponses: Record<string, "down" | "waitlist">;
  hiddenCheckIds: Set<string>;
  pendingDownCheckIds: Set<string>;
  newlyAddedCheckId: string | null;
  leftChecks: InterestCheck[];
}

export const initialChecksState: ChecksState = {
  checks: [],
  myCheckResponses: {},
  hiddenCheckIds: new Set(),
  pendingDownCheckIds: new Set(),
  newlyAddedCheckId: null,
  leftChecks: [],
};

// ─── Action types ─────────────────────────────────────────────────────────────

export const CheckActionType = {
  SYNC_CHECKS:        "SYNC_CHECKS",
  UPSERT_CHECK:       "UPSERT_CHECK",
  PATCH_CHECKS:       "PATCH_CHECKS",
  SET_RESPONSE:       "SET_RESPONSE",
  CLEAR_RESPONSE:     "CLEAR_RESPONSE",
  MERGE_RESPONSES:    "MERGE_RESPONSES",
  SET_PENDING:        "SET_PENDING",
  SET_HIDDEN:         "SET_HIDDEN",
  SET_CO_AUTHOR:      "SET_CO_AUTHOR",
  HYDRATE_LEFT_CHECKS:"HYDRATE_LEFT_CHECKS",
  REMOVE_FROM_LEFT:   "REMOVE_FROM_LEFT",
  SET_NEWLY_ADDED:    "SET_NEWLY_ADDED",
  TICK_EXPIRY:        "TICK_EXPIRY",
} as const;

export type ChecksAction =
  // Serves both loadChecks (checks-only) and hydrateChecks (checks + hiddenIds + responses)
  | { type: typeof CheckActionType.SYNC_CHECKS; checks: InterestCheck[]; hiddenIds?: string[]; responses?: Record<string, "down" | "waitlist">; avatarLetter?: string }
  // Prepends if new id, shallow-merges if existing
  | { type: typeof CheckActionType.UPSERT_CHECK; check: InterestCheck }
  // Bulk patch — for syncing squad membership across multiple checks at once
  | { type: typeof CheckActionType.PATCH_CHECKS; patches: Array<{ id: string; patch: Partial<InterestCheck> }> }
  // Optimistic response — patches "You" into check.responses + myCheckResponses
  | { type: typeof CheckActionType.SET_RESPONSE; checkId: string; status: "down" | "waitlist"; avatarLetter?: string }
  // Optimistic un-down — removes "You" from check.responses + myCheckResponses
  | { type: typeof CheckActionType.CLEAR_RESPONSE; checkId: string }
  // Bulk response merge — for shared check injection
  | { type: typeof CheckActionType.MERGE_RESPONSES; responses: Record<string, "down" | "waitlist"> }
  // Pending spinner (pending: true = add, false = remove)
  | { type: typeof CheckActionType.SET_PENDING; checkId: string; pending: boolean }
  // Visibility (hidden: true = hide, false = unhide)
  | { type: typeof CheckActionType.SET_HIDDEN; checkId: string; hidden: boolean }
  // Co-author accept/decline
  | { type: typeof CheckActionType.SET_CO_AUTHOR; checkId: string; userId: string; accepted: boolean; avatarLetter?: string }
  | { type: typeof CheckActionType.HYDRATE_LEFT_CHECKS; leftChecks: InterestCheck[] }
  | { type: typeof CheckActionType.REMOVE_FROM_LEFT; checkId: string }
  | { type: typeof CheckActionType.SET_NEWLY_ADDED; checkId: string | null }
  // Recalculates expiresIn/expiryPercent for all checks — dispatched by the 30s timer
  | { type: typeof CheckActionType.TICK_EXPIRY; now: Date };

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Preserve client-only fields when the server syncs over existing checks
const CLIENT_FIELDS = ["squadId", "viaFriendName"] as const;

function mergeChecks(prev: InterestCheck[], next: InterestCheck[]): InterestCheck[] {
  const prevMap = new Map(prev.map((c) => [c.id, c]));
  return next.map((c) => {
    const existing = prevMap.get(c.id);
    if (!existing) return c;
    const preserved = Object.fromEntries(
      CLIENT_FIELDS
        .filter((f) => existing[f] !== undefined && c[f] === undefined)
        .map((f) => [f, existing[f]])
    );
    return Object.keys(preserved).length ? { ...c, ...preserved } : c;
  });
}

// Re-apply "You" response if a realtime sync fires before the DB confirms your response
function patchYouResponses(
  checks: InterestCheck[],
  myCheckResponses: Record<string, "down" | "waitlist">,
  avatarLetter?: string
): InterestCheck[] {
  return checks.map((c) => {
    const myStatus = myCheckResponses[c.id];
    if (!myStatus || c.responses.some((r) => r.name === "You")) return c;
    return { ...c, responses: [{ name: "You", avatar: avatarLetter ?? "?", status: myStatus }, ...c.responses] };
  });
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function checksReducer(state: ChecksState, action: ChecksAction): ChecksState {
  switch (action.type) {
    case CheckActionType.SYNC_CHECKS: {
      // When responses are provided (hydrate path), replace rather than merge
      // so removed responses don't persist as stale entries
      const responses = action.responses
        ? action.responses
        : state.myCheckResponses;
      const checks = patchYouResponses(mergeChecks(state.checks, action.checks), responses, action.avatarLetter);
      return {
        ...state,
        checks,
        myCheckResponses: responses,
        ...(action.hiddenIds && { hiddenCheckIds: new Set(action.hiddenIds) }),
      };
    }
    case CheckActionType.UPSERT_CHECK: {
      const exists = state.checks.some((c) => c.id === action.check.id);
      const checks = exists
        ? state.checks.map((c) => c.id === action.check.id ? { ...c, ...action.check } : c)
        : [action.check, ...state.checks];
      return { ...state, checks };
    }
    case CheckActionType.PATCH_CHECKS: {
      const patchMap = new Map(action.patches.map((p) => [p.id, p.patch]));
      const checks = state.checks.map((c) => {
        const patch = patchMap.get(c.id);
        return patch ? { ...c, ...patch } : c;
      });
      return { ...state, checks };
    }
    case CheckActionType.SET_RESPONSE: {
      const { checkId, status, avatarLetter } = action;
      const checks = state.checks.map((c) => {
        if (c.id !== checkId) return c;
        const responses = [
          { name: "You", avatar: avatarLetter ?? "?", status },
          ...c.responses.filter((r) => r.name !== "You"),
        ];
        return { ...c, responses };
      });
      return { ...state, checks, myCheckResponses: { ...state.myCheckResponses, [checkId]: status } };
    }
    case CheckActionType.CLEAR_RESPONSE: {
      const { checkId } = action;
      const checks = state.checks.map((c) => {
        if (c.id !== checkId) return c;
        return { ...c, responses: c.responses.filter((r) => r.name !== "You") };
      });
      const { [checkId]: _, ...rest } = state.myCheckResponses;
      return { ...state, checks, myCheckResponses: rest };
    }
    case CheckActionType.MERGE_RESPONSES:
      return { ...state, myCheckResponses: { ...state.myCheckResponses, ...action.responses } };
    case CheckActionType.SET_PENDING: {
      const next = new Set(state.pendingDownCheckIds);
      action.pending ? next.add(action.checkId) : next.delete(action.checkId);
      return { ...state, pendingDownCheckIds: next };
    }
    case CheckActionType.SET_HIDDEN: {
      const next = new Set(state.hiddenCheckIds);
      action.hidden ? next.add(action.checkId) : next.delete(action.checkId);
      return { ...state, hiddenCheckIds: next };
    }
    case CheckActionType.SET_CO_AUTHOR: {
      const { checkId, userId, accepted, avatarLetter } = action;
      const checks = state.checks.map((c) => {
        if (c.id !== checkId) return c;
        const coAuthors = (c.coAuthors ?? []).map((ca) =>
          ca.userId === userId ? { ...ca, status: accepted ? "accepted" as const : "declined" as const } : ca
        );
        if (!accepted) return { ...c, pendingTagForYou: false, coAuthors };
        const responses = [
          { name: "You", avatar: avatarLetter ?? "?", status: "down" as const },
          ...c.responses.filter((r) => r.name !== "You"),
        ];
        return { ...c, isCoAuthor: true, pendingTagForYou: false, coAuthors, responses };
      });
      const myCheckResponses = accepted
        ? { ...state.myCheckResponses, [checkId]: "down" as const }
        : state.myCheckResponses;
      return { ...state, checks, myCheckResponses };
    }
    case CheckActionType.HYDRATE_LEFT_CHECKS:
      return { ...state, leftChecks: action.leftChecks };
    case CheckActionType.REMOVE_FROM_LEFT:
      return { ...state, leftChecks: state.leftChecks.filter((c) => c.id !== action.checkId) };
    case CheckActionType.SET_NEWLY_ADDED:
      return { ...state, newlyAddedCheckId: action.checkId };
    case CheckActionType.TICK_EXPIRY: {
      const now = action.now;
      let changed = false;
      const checks = state.checks.map((c) => {
        if (!c.expiresAt || !c.createdAt || c.expiresIn === "open") return c;
        const expires = new Date(c.expiresAt);
        const created = new Date(c.createdAt);
        const totalDuration = expires.getTime() - created.getTime();
        const msElapsed = now.getTime() - created.getTime();
        const expiryPercent = Math.min(100, (msElapsed / totalDuration) * 100);
        const msRemaining = expires.getTime() - now.getTime();
        const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
        const minsRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
        const expiresIn = hoursRemaining > 0 ? `${hoursRemaining}h` : minsRemaining > 0 ? `${minsRemaining}m` : "expired";
        if (c.expiresIn !== expiresIn || Math.abs(c.expiryPercent - expiryPercent) > 1) {
          changed = true;
          return { ...c, expiresIn, expiryPercent };
        }
        return c;
      });
      return changed ? { ...state, checks } : state;
    }
    default:
      return state;
  }
}
