import * as SecureStore from "expo-secure-store";
import * as StoreReview from "expo-store-review";

/**
 * Native App Store / Play Store rating request after a clearly positive
 * moment (a saved document, a chat answer with sources).
 *
 * The OS owns the dialog and its own rate limit; Ordilo only decides when
 * asking makes sense. There is deliberately no custom "Rate us" pre-prompt
 * (App Store Review Guideline 1.1.7 / 5.6.1): the system sheet is the
 * only thing the family ever sees.
 *
 * The decision is a pure function of persisted counters so it can be unit
 * tested without native modules. Nothing about the document or the chat
 * content is stored — only timestamps and a count.
 */

// Expo SecureStore accepts only letters, digits, `.`, `-` and `_` in keys.
const REVIEW_STATE_KEY = "ordilo.app-review";

const DAY_MS = 24 * 60 * 60 * 1000;

export const REVIEW_PROMPT_RULES = {
  /** Never ask during the first days after the first launch. */
  minDaysSinceFirstSeen: 2,
  /** Positive moments needed before the first (and every later) request. */
  minPositiveMoments: 3,
  /** Minimum gap between two requests. */
  minDaysBetweenRequests: 120,
} as const;

export type PositiveMoment = "document_confirmed" | "chat_answer_with_sources";

export interface ReviewPromptState {
  /** Epoch ms of the first app launch Ordilo noticed. */
  firstSeenAt: number;
  /** Positive moments since install (cumulative). */
  positiveMoments: number;
  /** Epoch ms of the last native review request, if any. */
  lastRequestedAt: number | null;
}

export function createReviewPromptState(now: number): ReviewPromptState {
  return { firstSeenAt: now, positiveMoments: 0, lastRequestedAt: null };
}

/** Read stored state; anything unreadable starts a fresh clock at `now`. */
export function parseReviewPromptState(
  raw: string | null,
  now: number,
): ReviewPromptState {
  if (!raw) return createReviewPromptState(now);
  try {
    const parsed = JSON.parse(raw) as Partial<ReviewPromptState>;
    const finite = (value: unknown): value is number =>
      typeof value === "number" && Number.isFinite(value);
    return {
      firstSeenAt: finite(parsed.firstSeenAt) ? parsed.firstSeenAt : now,
      positiveMoments:
        finite(parsed.positiveMoments) && parsed.positiveMoments > 0
          ? Math.floor(parsed.positiveMoments)
          : 0,
      lastRequestedAt: finite(parsed.lastRequestedAt)
        ? parsed.lastRequestedAt
        : null,
    };
  } catch {
    return createReviewPromptState(now);
  }
}

export function addPositiveMoment(state: ReviewPromptState): ReviewPromptState {
  return { ...state, positiveMoments: state.positiveMoments + 1 };
}

/**
 * Pure rule: ask only after enough good moments, not in the first days,
 * and at most once per 120 days. A clock that runs backwards (device time
 * changed) never counts as "long enough ago".
 */
export function shouldRequestReview(
  state: ReviewPromptState,
  now: number,
  rules: typeof REVIEW_PROMPT_RULES = REVIEW_PROMPT_RULES,
): boolean {
  if (state.positiveMoments < rules.minPositiveMoments) return false;
  if (now - state.firstSeenAt < rules.minDaysSinceFirstSeen * DAY_MS) {
    return false;
  }
  if (state.lastRequestedAt !== null) {
    if (now - state.lastRequestedAt < rules.minDaysBetweenRequests * DAY_MS) {
      return false;
    }
  }
  return true;
}

async function loadState(now: number): Promise<ReviewPromptState> {
  return parseReviewPromptState(
    await SecureStore.getItemAsync(REVIEW_STATE_KEY),
    now,
  );
}

async function saveState(state: ReviewPromptState): Promise<void> {
  await SecureStore.setItemAsync(REVIEW_STATE_KEY, JSON.stringify(state));
}

// Serialise read-modify-write cycles so two quick moments never lose a count.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T | undefined> {
  const run = queue.then(task, task).catch(() => undefined);
  queue = run;
  return run;
}

/**
 * Start the "first days" clock on the first launch. Safe to call on every
 * start; it only writes when nothing is stored yet.
 */
export function noteAppLaunched(now: number = Date.now()): Promise<void> {
  return enqueue(async () => {
    if ((await SecureStore.getItemAsync(REVIEW_STATE_KEY)) !== null) return;
    await saveState(createReviewPromptState(now));
  }).then(() => undefined);
}

/**
 * Count a positive moment and, when the rule allows it, ask the OS for
 * the native rating sheet. Fire-and-forget: never throws, never blocks.
 * Resolves `true` when a request was handed to the OS.
 */
export function notePositiveMoment(
  _moment: PositiveMoment,
  { now = Date.now() }: { now?: number } = {},
): Promise<boolean> {
  return enqueue(async () => {
    const state = addPositiveMoment(await loadState(now));
    await saveState(state);
    if (!shouldRequestReview(state, now)) return false;
    if (!(await StoreReview.isAvailableAsync())) return false;
    if (!(await StoreReview.hasAction())) return false;
    // Persist before asking, so a failing native call never turns into a
    // request on every following moment.
    await saveState({ ...state, lastRequestedAt: now });
    await StoreReview.requestReview();
    return true;
  }).then((requested) => requested === true);
}
