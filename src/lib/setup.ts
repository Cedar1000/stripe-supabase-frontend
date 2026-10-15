import { emptyDateDraft, type DateDraft } from './dates';
import type { Gender } from './types';

export type AncestorDraft = {
  first_name: string;
  last_name: string;
  gender: Gender;
  birth: DateDraft;
  deceased: boolean;
  death: DateDraft;
  bio: string;
};

export type ChildDraft = {
  key: string;
  first_name: string;
  last_name: string;
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
  first_name: '',
  last_name: '',
  gender: 'male',
  birth: emptyDateDraft,
  deceased: false,
});

export const emptyDraft = (): SetupDraft => ({
  familyName: '',
  ancestor: { first_name: '', last_name: '', gender: 'male', birth: emptyDateDraft, deceased: true, death: emptyDateDraft, bio: '' },
  children: [newChild(), newChild()],
});

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
