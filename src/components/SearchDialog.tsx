import { useMemo, useState } from 'react';
import { formatDate, matchesPartial, parseSearchDate } from '../lib/dates';
import { compareByBirth, fullName, type TreeIndex } from '../lib/tree';
import type { Person } from '../lib/types';
import { Avatar, Modal, StatusBadge } from './ui';

export function SearchDialog({ index, onClose, onShow }: { index: TreeIndex; onClose: () => void; onShow: (id: string) => void }) {
  const [name, setName] = useState('');
  const [born, setBorn] = useState('');
  const [died, setDied] = useState('');

  const bornQuery = parseSearchDate(born);
  const diedQuery = parseSearchDate(died);
  const badBorn = born.trim() !== '' && !bornQuery;
  const badDied = died.trim() !== '' && !diedQuery;
  const hasQuery = name.trim() !== '' || bornQuery || diedQuery;

  const results = useMemo(() => {
    if (!hasQuery || badBorn || badDied) return [];
    const words = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return [...index.byId.values()]
      .filter((p) => words.every((w) => fullName(p).toLowerCase().includes(w)))
      .filter((p) => !bornQuery || matchesPartial(p.birth_date, p.birth_precision, bornQuery))
      .filter((p) => !diedQuery || matchesPartial(p.death_date, p.death_precision, diedQuery))
      .sort(compareByBirth)
      .slice(0, 50);
  }, [index, name, bornQuery, diedQuery, hasQuery, badBorn, badDied]);

  return (
    <Modal title="Find someone" onClose={onClose} wide>
      <div className="search-fields">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grace" autoFocus />
        </label>
        <label>
          Date of birth
          <input value={born} onChange={(e) => setBorn(e.target.value)} placeholder="e.g. 03/1950" aria-invalid={badBorn} />
        </label>
        <label>
          Date of death
          <input value={died} onChange={(e) => setDied(e.target.value)} placeholder="e.g. 07/2010" aria-invalid={badDied} />
        </label>
      </div>
      {(badBorn || badDied) && <p className="form-error">Dates can be a year (1950), month/year (03/1950) or day/month/year (04/03/1950).</p>}

      {hasQuery && !badBorn && !badDied && (
        <p className="muted">{results.length === 0 ? 'Nobody matches.' : `${results.length} match${results.length === 1 ? '' : 'es'}`}</p>
      )}

      <ul className="search-results">
        {results.map((p) => (
          <li key={p.id}>
            <SearchResult person={p} parent={p.parent_id ? index.byId.get(p.parent_id) : undefined} onShow={onShow} />
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function SearchResult({ person, parent, onShow }: { person: Person; parent?: Person; onShow: (id: string) => void }) {
  return (
    <div className="result">
      <div className="result-chain">
        {parent ? (
          <button type="button" className="result-card result-parent" onClick={() => onShow(parent.id)}>
            <Avatar person={parent} size={36} />
            <span>
              <small>Up link</small>
              <strong>{fullName(parent)}</strong>
            </span>
          </button>
        ) : (
          <span className="result-card result-parent result-root">Top of the tree</span>
        )}
        <span className="result-link" aria-hidden="true" />
        <button type="button" className="result-card result-person" onClick={() => onShow(person.id)}>
          <Avatar person={person} size={52} />
          <span>
            <strong>{fullName(person)}</strong>
            <small>
              {formatDate(person.birth_date, person.birth_precision) || 'Birth unknown'}
              {person.is_deceased && ` – ${formatDate(person.death_date, person.death_precision) || '?'}`}
            </small>
            <StatusBadge deceased={person.is_deceased} />
          </span>
        </button>
      </div>
      <button type="button" className="button button-secondary" onClick={() => onShow(person.id)}>Show on tree</button>
    </div>
  );
}
