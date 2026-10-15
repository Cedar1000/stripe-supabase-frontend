import { emptyDateDraft, type DateDraft } from './dates';
import type { Gender } from './types';

export type AncestorDraft = {
  name: string;
  gender: Gender;
  birth: DateDraft;
  deceased: boolean;
  death: DateDraft;
  bio: string;
};

export type ChildDraft = {
  key: string;
  name: string;
  gender: Gender;
  birth: DateDraft;
  deceased: boolean;
};

/** Everything the setup wizard collects before anything is saved. */
export type SetupDraft = {
  familyName: string;
  /** null when the organiser chose to add people later. */
  ancestor: AncestorDraft | null;
  children: ChildDraft[];
};

export const newChild = (): ChildDraft => ({
  key: crypto.randomUUID(),
  name: '',
  gender: 'male',
  birth: emptyDateDraft,
  deceased: false,
});

export const emptyDraft = (): SetupDraft => ({
  familyName: '',
  ancestor: { name: '', gender: 'male', birth: emptyDateDraft, deceased: true, death: emptyDateDraft, bio: '' },
  children: [newChild(), newChild()],
});

// ---- Draft kept across the email-confirmation round trip --------------------------------

const PENDING_KEY = 'family-tree:pending-setup';

export function savePendingSetup(draft: SetupDraft) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable; the organiser will re-enter details after confirming.
  }
}

export function loadPendingSetup(): SetupDraft | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as SetupDraft) : null;
  } catch {
    return null;
  }
}

export function clearPendingSetup() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clear.
  }
}

// ---- Which family to open ----------------------------------------------------------------

const lastFamilyKey = (userId: string) => `family-tree:last-family:${userId}`;

export function readLastFamily(userId: string) {
  try {
    return localStorage.getItem(lastFamilyKey(userId));
  } catch {
    return null;
  }
}

export function writeLastFamily(userId: string, familyId: string) {
  try {
    localStorage.setItem(lastFamilyKey(userId), familyId);
  } catch {
    // Storage unavailable; the first family will be opened next time.
  }
}

// ---- URL flags ---------------------------------------------------------------------------

export function hasUrlFlag(name: string) {
  return new URLSearchParams(window.location.search).has(name);
}

export function removeUrlFlag(name: string) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState(null, '', url);
}
