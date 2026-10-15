import { ageOn, formatDate } from '../lib/dates';
import type { Permissions, TreeIndex } from '../lib/tree';
import type { AdminGrant, Person, Profile } from '../lib/types';
import { Avatar, Icon, StatusBadge } from './ui';

export function PersonPanel({
  person,
  index,
  permissions,
  admins,
  profiles,
  isOpen,
  onClose,
  onAdd,
  onEdit,
  onDelete,
  onManageAdmins,
  onToggleChildren,
  onSelect,
}: {
  person: Person;
  index: TreeIndex;
  /** Omitted on the public page: the panel is then read-only. */
  permissions?: Permissions;
  admins?: AdminGrant[];
  profiles?: Profile[];
  isOpen: boolean;
  onClose: () => void;
  onAdd?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onManageAdmins?: () => void;
  onToggleChildren: () => void;
  onSelect: (id: string) => void;
}) {
  const readOnly = !permissions;
  const canEdit = permissions?.canEdit(person.id) ?? false;
  const children = index.childrenOf.get(person.id) ?? [];
  const parent = person.parent_id ? index.byId.get(person.parent_id) : undefined;
  const born = formatDate(person.birth_date, person.birth_precision);
  const died = formatDate(person.death_date, person.death_precision);
  const age =
    person.birth_precision === 'day' && person.birth_date && !person.is_deceased ? ageOn(person.birth_date) : null;
  const branchAdmins = (admins ?? [])
    .filter((a) => a.scope_person_id === person.id)
    .map((a) => profiles?.find((p) => p.id === a.user_id)?.display_name)
    .filter(Boolean);

  return (
    <aside className="person-panel" aria-label={`Details for ${person.name}`}>
      <header className="panel-header">
        <span className="sheet-grabber" aria-hidden="true" />
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">
          <Icon name="close" />
        </button>
      </header>

      <div className="panel-hero">
        <Avatar person={person} size={132} />
        <h2>{person.name}</h2>
        <StatusBadge deceased={person.is_deceased} />
      </div>

      <dl className="facts">
        <div>
          <dt>Date of birth</dt>
          <dd>{person.redacted ? 'Private' : born || 'Unknown'}{age !== null && <span className="muted"> · age {age}</span>}</dd>
        </div>
        {person.is_deceased && (
          <div>
            <dt>Date of death</dt>
            <dd>{died || 'Unknown'}</dd>
          </div>
        )}
        <div>
          <dt>Sex</dt>
          <dd>{person.gender === 'male' ? 'Male' : 'Female'}</dd>
        </div>
        {parent && (
          <div>
            <dt>{person.gender === 'male' ? 'Son of' : 'Daughter of'}</dt>
            <dd><button type="button" className="link" onClick={() => onSelect(parent.id)}>{parent.name}</button></dd>
          </div>
        )}
        {branchAdmins.length > 0 && (
          <div>
            <dt>Branch admins</dt>
            <dd>{branchAdmins.join(', ')}</dd>
          </div>
        )}
      </dl>

      {person.bio && <p className="bio">{person.bio}</p>}
      {person.redacted && (
        <p className="privacy-note">This family shows living relatives by name only. Photos, dates and stories are visible to family members.</p>
      )}

      {!readOnly && (
      <div className="panel-actions">
        <button
          type="button"
          className="button button-primary"
          onClick={onAdd}
          disabled={!canEdit}
          title={canEdit ? 'Add a child' : 'Only administrators of this branch can add'}
        >
          <Icon name="plus" size={18} /> ADD
        </button>
        {canEdit && (
          <button type="button" className="button button-secondary" onClick={onEdit}>
            <Icon name="edit" size={18} /> Edit
          </button>
        )}
        {canEdit && (
          <button type="button" className="button button-secondary" onClick={onManageAdmins}>
            <Icon name="shield" size={18} /> Make admin
          </button>
        )}
        {canEdit && children.length === 0 && (
          <button type="button" className="button button-danger" onClick={onDelete}>
            <Icon name="trash" size={18} /> Delete
          </button>
        )}
      </div>
      )}
      {!readOnly && !canEdit && <p className="hint">Only administrators of this branch can add or edit.</p>}

      {children.length > 0 && (
        <section className="panel-children">
          <div className="panel-children-head">
            <h3>Children ({children.length})</h3>
            <button type="button" className="link" onClick={onToggleChildren}>
              {isOpen ? 'Hide on tree' : 'Show on tree'}
            </button>
          </div>
          <ul>
            {children.map((c) => (
              <li key={c.id}>
                <button type="button" className="mini-person" onClick={() => onSelect(c.id)}>
                  <Avatar person={c} size={36} />
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.redacted ? 'Living' : formatDate(c.birth_date, c.birth_precision) || 'Birth date unknown'}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
