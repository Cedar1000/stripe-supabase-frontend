import { supabase } from '../utils/supabase';
import { AUTH_DISABLED as DEMO, DEMO_USER_ID, demoDb as db, demoId, demoInviteCode, demoPublicSlug, demoPublicTree, persistDemo } from './demo';
import type { AdminGrant, ChatMessage, Family, Member, Person, PersonInput, Profile, PublicTree } from './types';

/** Demo writes are saved so they survive reloads and show up on public links opened in new tabs. */
function saved<T>(value: T): T {
  persistDemo();
  return value;
}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

// ---- Families (tenants) ---------------------------------------------------------------

export async function fetchMyFamilies() {
  if (DEMO) {
    const mine = new Set(db.members.filter((m) => m.user_id === DEMO_USER_ID).map((m) => m.family_id));
    return db.families.filter((f) => mine.has(f.id));
  }
  // RLS only returns families the user is a member of.
  return check<Family[]>(
    await supabase.from('families').select('id, name, created_at, is_public, public_slug, public_hide_living').order('name'),
  );
}

/** Creates a family; the caller becomes its member and 1st-level admin. Returns its id. */
export async function createFamily(name: string) {
  if (DEMO) {
    const id = demoId();
    db.families.push({ id, name: name.trim(), created_at: new Date().toISOString() });
    db.members.push({ family_id: id, user_id: DEMO_USER_ID, joined_at: new Date().toISOString() });
    db.admins.push({ id: demoId(), family_id: id, user_id: DEMO_USER_ID, scope_person_id: null, granted_by: DEMO_USER_ID, created_at: new Date().toISOString() });
    db.invites[id] = demoInviteCode();
    return saved(id);
  }
  return check<string>(await supabase.rpc('create_family', { family_name: name.trim() }));
}

/** Joins a family by invite code. Returns its id. */
export async function joinFamily(code: string) {
  const clean = code.trim().toUpperCase();
  if (DEMO) {
    const id = Object.keys(db.invites).find((fid) => db.invites[fid] === clean);
    if (!id) throw new Error('That invite code is not valid');
    if (!db.members.some((m) => m.family_id === id && m.user_id === DEMO_USER_ID)) {
      db.members.push({ family_id: id, user_id: DEMO_USER_ID, joined_at: new Date().toISOString() });
    }
    return saved(id);
  }
  return check<string>(await supabase.rpc('join_family', { invite_code: clean }));
}

export async function renameFamily(familyId: string, name: string) {
  if (DEMO) {
    db.families.find((f) => f.id === familyId)!.name = name.trim();
    return saved(undefined);
  }
  check(await supabase.from('families').update({ name: name.trim() }).eq('id', familyId));
}

/** The family's invite code, or null when the user isn't an admin there. */
export async function fetchInviteCode(familyId: string) {
  if (DEMO) {
    const isAdmin = db.admins.some((a) => a.family_id === familyId && a.user_id === DEMO_USER_ID);
    return isAdmin ? db.invites[familyId] ?? null : null;
  }
  const row = check<{ code: string } | null>(
    await supabase.from('family_invites').select('code').eq('family_id', familyId).maybeSingle(),
  );
  return row?.code ?? null;
}

export async function regenerateInvite(familyId: string) {
  if (DEMO) return saved((db.invites[familyId] = demoInviteCode()));
  return check<string>(await supabase.rpc('regenerate_invite', { fid: familyId }));
}

export async function fetchMembers(familyId: string): Promise<Member[]> {
  if (DEMO) {
    return db.members
      .filter((m) => m.family_id === familyId)
      .map((m) => ({ ...db.profiles.find((p) => p.id === m.user_id)!, joined_at: m.joined_at }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }
  const rows = check<{ joined_at: string; user_profiles: Profile | Profile[] }[]>(
    await supabase.from('family_members').select('joined_at, user_profiles(id, email, display_name)').eq('family_id', familyId),
  );
  return rows
    // Many-to-one embeds arrive as an object; untyped clients describe them as arrays.
    .map((r) => ({ ...(Array.isArray(r.user_profiles) ? r.user_profiles[0] : r.user_profiles), joined_at: r.joined_at }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

/** Removes someone from a family (or leaves it, when userId is yourself). */
export async function removeMember(familyId: string, userId: string) {
  if (DEMO) {
    db.members = db.members.filter((m) => !(m.family_id === familyId && m.user_id === userId));
    db.admins = db.admins.filter((a) => !(a.family_id === familyId && a.user_id === userId));
    return saved(undefined);
  }
  check(await supabase.from('family_members').delete().eq('family_id', familyId).eq('user_id', userId));
}

// ---- Public share link ------------------------------------------------------------------

/** Turns the public link on or off (1st-level admins only). Returns the link's slug. */
export async function setPublicSharing(familyId: string, enabled: boolean, hideLiving: boolean) {
  if (DEMO) {
    const f = db.families.find((x) => x.id === familyId)!;
    f.is_public = enabled;
    f.public_hide_living = hideLiving;
    f.public_slug ??= demoPublicSlug(f.name);
    return saved(f.public_slug);
  }
  return check<string>(await supabase.rpc('set_public_sharing', { fid: familyId, enabled, hide_living: hideLiving }));
}

/** Issues a new public link; the old one stops working. */
export async function regeneratePublicLink(familyId: string) {
  if (DEMO) {
    const f = db.families.find((x) => x.id === familyId)!;
    return saved((f.public_slug = demoPublicSlug(f.name)));
  }
  return check<string>(await supabase.rpc('regenerate_public_link', { fid: familyId }));
}

/** Read-only tree for anyone with the link; null if the link is wrong or sharing is off. Works signed out. */
export async function fetchPublicTree(slug: string) {
  if (DEMO) return demoPublicTree(slug);
  return check<PublicTree | null>(await supabase.rpc('get_public_tree', { slug }));
}

export function publicTreeUrl(slug: string) {
  return `${window.location.origin}${window.location.pathname}?tree=${slug}`;
}

// ---- Tree -------------------------------------------------------------------------------

export async function fetchPeople(familyId: string) {
  if (DEMO) return db.people.filter((p) => p.family_id === familyId);
  return check<Person[]>(await supabase.from('people').select('*').eq('family_id', familyId));
}

export async function createPerson(familyId: string, input: PersonInput) {
  if (DEMO) {
    const created: Person = { ...input, family_id: familyId, id: demoId(), created_at: new Date().toISOString() };
    db.people.push(created);
    return saved(created);
  }
  return check<Person>(await supabase.from('people').insert({ ...input, family_id: familyId }).select().single());
}

export async function updatePerson(id: string, input: Partial<PersonInput>) {
  if (DEMO) {
    const i = db.people.findIndex((p) => p.id === id);
    db.people[i] = { ...db.people[i], ...input };
    return saved(db.people[i]);
  }
  return check<Person>(await supabase.from('people').update(input).eq('id', id).select().single());
}

export async function deletePerson(id: string) {
  if (DEMO) {
    db.people = db.people.filter((p) => p.id !== id);
    return saved(undefined);
  }
  check(await supabase.from('people').delete().eq('id', id));
}

// ---- Admins -----------------------------------------------------------------------------

export async function fetchAdmins(familyId: string) {
  if (DEMO) return db.admins.filter((a) => a.family_id === familyId);
  return check<AdminGrant[]>(await supabase.from('tree_admins').select('*').eq('family_id', familyId));
}

export async function grantAdmin(familyId: string, userId: string, scopePersonId: string | null) {
  if (DEMO) {
    if (db.admins.some((a) => a.family_id === familyId && a.user_id === userId && a.scope_person_id === scopePersonId)) {
      throw new Error('duplicate key');
    }
    const grant: AdminGrant = {
      id: demoId(), family_id: familyId, user_id: userId, scope_person_id: scopePersonId,
      granted_by: DEMO_USER_ID, created_at: new Date().toISOString(),
    };
    db.admins.push(grant);
    return saved(grant);
  }
  return check<AdminGrant>(
    await supabase
      .from('tree_admins')
      .insert({ family_id: familyId, user_id: userId, scope_person_id: scopePersonId })
      .select()
      .single(),
  );
}

export async function revokeAdmin(grantId: string) {
  if (DEMO) {
    db.admins = db.admins.filter((a) => a.id !== grantId);
    return saved(undefined);
  }
  check(await supabase.from('tree_admins').delete().eq('id', grantId));
}

// ---- Chat -------------------------------------------------------------------------------

export async function fetchMessages(familyId: string) {
  if (DEMO) {
    return db.messages
      .filter((m) => m.family_id === familyId && (m.recipient_id === null || m.sender_id === DEMO_USER_ID || m.recipient_id === DEMO_USER_ID))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return check<ChatMessage[]>(
    await supabase
      .from('chat_messages')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true })
      .limit(1000),
  );
}

export async function sendMessage(familyId: string, body: string, recipientId: string | null) {
  if (DEMO) {
    const message: ChatMessage = {
      id: demoId(), family_id: familyId, sender_id: DEMO_USER_ID, recipient_id: recipientId,
      body, created_at: new Date().toISOString(),
    };
    db.messages.push(message);
    return saved(message);
  }
  return check<ChatMessage>(
    await supabase
      .from('chat_messages')
      .insert({ family_id: familyId, body, recipient_id: recipientId })
      .select()
      .single(),
  );
}

// ---- Photos -----------------------------------------------------------------------------

/** Shrinks the image to at most 512px on its longest side and uploads it as JPEG. */
export async function uploadPhoto(familyId: string, file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  // Demo mode keeps the picture in memory instead of uploading it.
  if (DEMO) return canvas.toDataURL('image/jpeg', 0.85);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read image'))), 'image/jpeg', 0.85),
  );
  // Stored under the family's folder; storage policy only lets that family's admins upload there.
  const path = `${familyId}/${crypto.randomUUID()}.jpg`;
  check(await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' }));
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
}
