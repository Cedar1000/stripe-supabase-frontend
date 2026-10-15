export type Precision = 'year' | 'month' | 'day';
export type Gender = 'male' | 'female';

export type Family = {
  id: string;
  name: string;
  created_at: string;
  /** Public read-only link (?tree=slug), managed by 1st-level admins. */
  is_public?: boolean;
  public_slug?: string | null;
  /** When true, visitors see living relatives by name only. */
  public_hide_living?: boolean;
};

export type Person = {
  id: string;
  family_id: string;
  parent_id: string | null;
  name: string;
  gender: Gender;
  photo_url: string | null;
  birth_date: string | null;
  birth_precision: Precision | null;
  is_deceased: boolean;
  death_date: string | null;
  death_precision: Precision | null;
  bio: string;
  created_at: string;
  /** Public view only: details of this living person were withheld. */
  redacted?: boolean;
  /** Public view only: position among siblings, since dates may be withheld. */
  sibling_rank?: number;
};

export type PersonInput = Omit<Person, 'id' | 'created_at' | 'family_id' | 'redacted' | 'sibling_rank'>;

/** What anyone with a family's public link can see. */
export type PublicTree = {
  family: { id: string; name: string; hide_living: boolean };
  people: Person[];
};

export type Profile = {
  id: string;
  email: string;
  display_name: string;
};

/** A user who belongs to the current family. */
export type Member = Profile & { joined_at: string };

export type AdminGrant = {
  id: string;
  family_id: string;
  user_id: string;
  scope_person_id: string | null;
  granted_by: string | null;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  family_id: string;
  sender_id: string;
  recipient_id: string | null;
  body: string;
  created_at: string;
};
