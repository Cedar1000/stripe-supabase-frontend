import { monthOnlyThisMonth, upcomingBirthdays } from '../lib/birthdays';
import { MONTHS } from '../lib/dates';
import type { Person } from '../lib/types';
import { Avatar, Modal } from './ui';

function when(days: number) {
  if (days === 0) return 'Today 🎉';
  if (days === 1) return 'Tomorrow';
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · in ${days} days`;
}

export function BirthdayPanel({ people, onClose, onShow }: { people: Person[]; onClose: () => void; onShow: (id: string) => void }) {
  const upcoming = upcomingBirthdays(people, 60);
  const monthOnly = monthOnlyThisMonth(people);
  const canNotify = typeof Notification !== 'undefined' && Notification.permission === 'default';

  return (
    <Modal title="Birthdays" onClose={onClose}>
      {upcoming.length === 0 && <p className="muted">No birthdays in the next 60 days.</p>}
      <ul className="birthday-list">
        {upcoming.map(({ person, inDays, turning }) => (
          <li key={person.id} className={inDays === 0 ? 'is-today' : ''}>
            <button type="button" className="mini-person" onClick={() => onShow(person.id)}>
              <Avatar person={person} size={44} />
              <span>
                <strong>{person.name}</strong>
                <small>{when(inDays)} · turning {turning}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {monthOnly.length > 0 && (
        <>
          <h3 className="subhead">Sometime this month</h3>
          <ul className="birthday-list">
            {monthOnly.map((p) => (
              <li key={p.id}>
                <button type="button" className="mini-person" onClick={() => onShow(p.id)}>
                  <Avatar person={p} size={44} />
                  <span><strong>{p.name}</strong><small>Exact day not recorded</small></span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {canNotify && (
        <button type="button" className="button button-secondary" onClick={() => Notification.requestPermission()}>
          Turn on device birthday alerts
        </button>
      )}
    </Modal>
  );
}
