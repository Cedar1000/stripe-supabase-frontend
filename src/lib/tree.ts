import type { AdminGrant, Person } from './types';

export type TreeIndex = {
  byId: Map<string, Person>;
  childrenOf: Map<string | null, Person[]>;
};

/** "First Last", or just the first name when the last name is unknown ('' for a missing person). */
export function fullName(p: { first_name: string; last_name: string } | undefined) {
  if (!p) return '';
  return [p.first_name.trim(), p.last_name.trim()].filter(Boolean).join(' ');
}

/** Siblings are ordered by date of birth; unknown birth dates go last. */
export function compareByBirth(a: Person, b: Person) {
  // Public views may withhold dates; the server supplies the order instead.
  if (a.sibling_rank !== undefined && b.sibling_rank !== undefined) return a.sibling_rank - b.sibling_rank;
  if (a.birth_date && b.birth_date && a.birth_date !== b.birth_date) {
    return a.birth_date < b.birth_date ? -1 : 1;
  }
  if (!a.birth_date !== !b.birth_date) return a.birth_date ? -1 : 1;
  return fullName(a).localeCompare(fullName(b));
}

export function buildIndex(people: Person[]): TreeIndex {
  const byId = new Map(people.map((p) => [p.id, p]));
  const childrenOf = new Map<string | null, Person[]>();
  for (const p of people) {
    // Orphans (parent missing) are shown as roots so nothing disappears.
    const key = p.parent_id && byId.has(p.parent_id) ? p.parent_id : null;
    const list = childrenOf.get(key) ?? [];
    list.push(p);
    childrenOf.set(key, list);
  }
  for (const list of childrenOf.values()) list.sort(compareByBirth);
  return { byId, childrenOf };
}

/** The chain of ancestors from the root down to (but excluding) `id`. */
export function ancestorsOf(index: TreeIndex, id: string): Person[] {
  const chain: Person[] = [];
  const seen = new Set<string>();
  let current = index.byId.get(id);
  while (current?.parent_id && !seen.has(current.parent_id)) {
    seen.add(current.parent_id);
    const parent = index.byId.get(current.parent_id);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

export function isInBranch(index: TreeIndex, branchRoot: string, target: string) {
  return target === branchRoot || ancestorsOf(index, target).some((p) => p.id === branchRoot);
}

export function countDescendants(index: TreeIndex, id: string): number {
  return (index.childrenOf.get(id) ?? []).reduce((n, c) => n + 1 + countDescendants(index, c.id), 0);
}

/** Mirrors the database rules so the UI only offers what will succeed. */
export class Permissions {
  private readonly grants: AdminGrant[];
  private readonly index: TreeIndex;

  constructor(userId: string | undefined, grants: AdminGrant[], index: TreeIndex) {
    this.grants = grants.filter((g) => g.user_id === userId);
    this.index = index;
  }

  get isSuperAdmin() {
    return this.grants.some((g) => g.scope_person_id === null);
  }

  get isAnyAdmin() {
    return this.grants.length > 0;
  }

  /** Branch roots this user administers (empty for 1st-level admins). */
  get branchRoots() {
    return this.grants.flatMap((g) => (g.scope_person_id ? [g.scope_person_id] : []));
  }

  canEdit(personId: string) {
    return this.grants.some(
      (g) => g.scope_person_id === null || isInBranch(this.index, g.scope_person_id, personId),
    );
  }

  canManageGrant(grant: AdminGrant) {
    if (this.isSuperAdmin) return true;
    return grant.scope_person_id !== null && this.canEdit(grant.scope_person_id);
  }
}
