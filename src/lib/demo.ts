import { toStored, type PartialDate } from './dates';
import { fullName } from './tree';
import type { AdminGrant, AuthSession, ChatMessage, Family, Gender, Person, Profile, PublicTree } from './types';

/**
 * While true the app skips login and runs on a sample database kept in this browser
 * (open /?reset-demo to start over). Set to false to use Clerk sign-in and Supabase.
 */
export const AUTH_DISABLED = false;

export const DEMO_USER_ID = 'demo-user';

export const demoSession: AuthSession = { user: { id: DEMO_USER_ID, email: 'you@example.com' } };

/** Invite code for the seeded family the demo user hasn't joined yet. */
export const DEMO_JOIN_CODE = 'MENSAH24';

/** The seeded Okafor family's public link: /?tree=okafor-demo */
export const DEMO_PUBLIC_SLUG = 'okafor-demo';

export const demoId = () => `demo-${crypto.randomUUID()}`;

const now = () => new Date().toISOString();
const today = new Date();

/** A full date `daysFromNow` days away in a past year, so birthday alerts have something to show. */
function birthdayIn(daysFromNow: number, year: number): PartialDate {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysFromNow);
  return { year, month: d.getMonth() + 1, day: d.getDate() };
}

let seq = 1;
function person(
  familyId: string,
  parent: Person | null,
  name: string,
  gender: Gender,
  born: PartialDate | null,
  opts: { died?: PartialDate | 'unknown'; bio?: string; photo?: string } = {},
): Person {
  const b = born && toStored(born);
  const d = opts.died && opts.died !== 'unknown' ? toStored(opts.died) : null;
  // "Grace Okafor-Bello" -> first "Grace", last "Okafor-Bello".
  const [first, ...rest] = name.split(' ');
  return {
    id: `demo-person-${seq++}`,
    family_id: familyId,
    parent_id: parent?.id ?? null,
    first_name: first,
    last_name: rest.join(' '),
    gender,
    photo_url: opts.photo ?? null,
    birth_date: b?.date ?? null,
    birth_precision: b?.precision ?? null,
    is_deceased: Boolean(opts.died),
    death_date: d?.date ?? null,
    death_precision: d?.precision ?? null,
    bio: opts.bio ?? '',
    created_at: now(),
  };
}

const portrait = (gender: Gender, n: number) =>
  `https://randomuser.me/api/portraits/${gender === 'male' ? 'men' : 'women'}/${n}.jpg`;

const OKAFOR = 'demo-fam-okafor';
const MENSAH = 'demo-fam-mensah';

function seedOkafor(): Person[] {
  const f = OKAFOR;
  const emmanuel = person(f, null, 'Emmanuel Okafor', 'male', { year: 1921 }, {
    died: { year: 1989, month: 6 },
    bio: 'Farmer and village teacher. Planted the orange grove that still stands behind the family house.',
  });
  const grace = person(f, emmanuel, 'Grace Okafor-Bello', 'female', { year: 1946, month: 3, day: 4 }, {
    died: { year: 2015, month: 11, day: 20 },
    bio: 'Nurse for 35 years. Known for her pepper soup and her laugh.',
  });
  const samuel = person(f, emmanuel, 'Samuel Okafor', 'male', { year: 1950 }, {
    photo: portrait('male', 75),
    bio: 'Retired engineer. Keeper of the family records.',
  });
  const ruth = person(f, emmanuel, 'Ruth Okafor', 'female', { year: 1955, month: 8 }, { died: 'unknown' });

  const daniel = person(f, grace, 'Daniel Bello', 'male', birthdayIn(0, 1970), {
    photo: portrait('male', 32),
    bio: 'Architect in Lagos. Organises the family reunion every December.',
  });
  const esther = person(f, grace, 'Esther Bello', 'female', birthdayIn(3, 1973), { photo: portrait('female', 44) });
  const paul = person(f, grace, 'Paul Bello', 'male', { year: 1968, month: 1, day: 15 }, {
    died: { year: 2001 },
    bio: 'Musician. Played trumpet in the church band.',
  });

  const chidi = person(f, samuel, 'Chidi Okafor', 'male', birthdayIn(12, 1978), { photo: portrait('male', 52) });
  const ngozi = person(f, samuel, 'Ngozi Okafor', 'female', { year: 1981, month: today.getMonth() + 1 }, {
    photo: portrait('female', 65),
  });

  const ada = person(f, daniel, 'Ada Bello', 'female', { year: 1998, month: 5, day: 9 }, { photo: portrait('female', 21) });
  const tobi = person(f, daniel, 'Tobi Bello', 'male', { year: 2002, month: 11, day: 30 }, { photo: portrait('male', 11) });
  const kemi = person(f, esther, 'Kemi Adeyemi', 'female', birthdayIn(5, 2005), { photo: portrait('female', 33) });
  const obi = person(f, chidi, 'Obi Okafor', 'male', { year: 2010 });
  const zara = person(f, ada, 'Zara Bello', 'female', { year: 2023, month: 2, day: 14 });

  return [emmanuel, grace, samuel, ruth, daniel, esther, paul, chidi, ngozi, ada, tobi, kemi, obi, zara];
}

function seedMensah(): Person[] {
  const f = MENSAH;
  const kwame = person(f, null, 'Kwame Mensah', 'male', { year: 1938 }, {
    died: { year: 2004, month: 2 },
    bio: 'Cocoa farmer from Kumasi.',
  });
  const kofi = person(f, kwame, 'Kofi Mensah', 'male', { year: 1965, month: 7, day: 2 }, { photo: portrait('male', 61) });
  const abena = person(f, kwame, 'Abena Mensah', 'female', { year: 1969 }, { photo: portrait('female', 57) });
  const yaw = person(f, kofi, 'Yaw Mensah', 'male', { year: 1994, month: 3, day: 21 }, { photo: portrait('male', 22) });
  const efua = person(f, abena, 'Efua Owusu', 'female', { year: 1999, month: 9 }, { photo: portrait('female', 12) });
  return [kwame, kofi, abena, yaw, efua];
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function seed() {
  const people = [...seedOkafor(), ...seedMensah()];
  const graceId = people.find((p) => p.first_name === 'Grace' && p.last_name === 'Okafor-Bello')!.id;
  const grant = (family_id: string, user_id: string, scope_person_id: string | null): AdminGrant => ({
    id: demoId(), family_id, user_id, scope_person_id, granted_by: user_id, created_at: now(),
  });
  const member = (family_id: string, user_id: string, daysAgo: number) => ({
    family_id, user_id, joined_at: minutesAgo(daysAgo * 1440),
  });
  const msg = (family_id: string, sender_id: string, recipient_id: string | null, body: string, ago: number): ChatMessage => ({
    id: demoId(), family_id, sender_id, recipient_id, body, created_at: minutesAgo(ago),
  });

  return {
    families: [
      { id: OKAFOR, name: 'The Okafor Family', created_at: minutesAgo(90 * 1440), is_public: true, public_slug: DEMO_PUBLIC_SLUG, public_hide_living: true },
      { id: MENSAH, name: 'The Mensah Family', created_at: minutesAgo(30 * 1440) },
    ] as Family[],
    invites: { [OKAFOR]: 'OKAFOR77', [MENSAH]: DEMO_JOIN_CODE } as Record<string, string>,
    profiles: [
      { id: DEMO_USER_ID, email: 'you@example.com', display_name: 'You (demo)' },
      { id: 'demo-p-daniel', email: 'daniel@example.com', display_name: 'Daniel Bello' },
      { id: 'demo-p-esther', email: 'esther@example.com', display_name: 'Esther Bello' },
      { id: 'demo-p-chidi', email: 'chidi@example.com', display_name: 'Chidi Okafor' },
      { id: 'demo-p-kofi', email: 'kofi@example.com', display_name: 'Kofi Mensah' },
    ] as Profile[],
    members: [
      member(OKAFOR, DEMO_USER_ID, 90),
      member(OKAFOR, 'demo-p-daniel', 60),
      member(OKAFOR, 'demo-p-esther', 45),
      member(OKAFOR, 'demo-p-chidi', 10),
      member(MENSAH, 'demo-p-kofi', 30),
    ],
    people,
    admins: [
      grant(OKAFOR, DEMO_USER_ID, null),
      grant(OKAFOR, 'demo-p-daniel', graceId),
      grant(MENSAH, 'demo-p-kofi', null),
    ],
    messages: [
      msg(OKAFOR, 'demo-p-esther', null, 'Happy birthday Daniel! 🎉', 180),
      msg(OKAFOR, 'demo-p-chidi', null, 'Are we still doing the reunion in December?', 95),
      msg(OKAFOR, 'demo-p-daniel', null, 'Yes — same place as last year. I’ll share details soon.', 60),
      msg(OKAFOR, 'demo-p-daniel', DEMO_USER_ID, 'Could you add Zara’s photo when you get a chance?', 20),
      msg(MENSAH, 'demo-p-kofi', null, 'Welcome to the Mensah family tree, everyone!', 2000),
    ],
  };
}

type DemoDb = ReturnType<typeof seed>;

const STORE_KEY = 'family-tree:demo-db:v2';

/** Saved demo data from this browser, unless ?reset-demo is in the URL. */
function loadSaved(): DemoDb | null {
  try {
    if (new URLSearchParams(window.location.search).has('reset-demo')) {
      localStorage.removeItem(STORE_KEY);
      return null;
    }
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as DemoDb) : null;
  } catch {
    return null;
  }
}

/** The whole demo "database"; api.ts reads and writes it when AUTH_DISABLED is on. */
export const demoDb: DemoDb = loadSaved() ?? seed();

/** Saves demo changes in this browser so they survive reloads and new tabs. */
export function persistDemo() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(demoDb));
  } catch {
    // Storage full or unavailable (e.g. large photos, private mode); changes last until reload.
  }
}

export function demoPublicSlug(familyName: string) {
  const base = familyName.toLowerCase().replace(/^\s*the\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${base || 'family'}-${demoInviteCode().toLowerCase()}`;
}

/** Mirrors get_public_tree() in schema.sql, including hiding living relatives' details. */
export function demoPublicTree(slug: string): PublicTree | null {
  const family = demoDb.families.find((f) => f.is_public && f.public_slug === slug);
  if (!family) return null;
  const hide = family.public_hide_living ?? true;
  const people = demoDb.people.filter((p) => p.family_id === family.id);
  const rank = new Map<string, number>();
  const byParent = new Map<string | null, Person[]>();
  for (const p of people) byParent.set(p.parent_id, [...(byParent.get(p.parent_id) ?? []), p]);
  for (const siblings of byParent.values()) {
    siblings
      .sort((a, b) => (a.birth_date ?? '9999').localeCompare(b.birth_date ?? '9999') || fullName(a).localeCompare(fullName(b)))
      .forEach((p, i) => rank.set(p.id, i + 1));
  }
  return {
    family: { id: family.id, name: family.name, hide_living: hide },
    people: people.map((p) =>
      hide && !p.is_deceased
        ? {
            ...p, photo_url: null, bio: '', birth_date: null, birth_precision: null,
            death_date: null, death_precision: null, redacted: true, sibling_rank: rank.get(p.id),
          }
        : { ...p, sibling_rank: rank.get(p.id) },
    ),
  };
}

export function demoInviteCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
