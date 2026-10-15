import { useEffect, type ReactNode } from 'react';
import type { Person } from '../lib/types';

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function Avatar({ person, size = 64 }: { person: Pick<Person, 'name' | 'photo_url' | 'gender' | 'is_deceased'>; size?: number }) {
  const className = `avatar avatar-${person.gender} ${person.is_deceased ? 'avatar-deceased' : ''}`;
  return person.photo_url ? (
    <img className={className} src={person.photo_url} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className={className} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {initials(person.name)}
    </span>
  );
}

export function StatusBadge({ deceased }: { deceased: boolean }) {
  return deceased ? (
    <span className="status status-deceased" title="Deceased">
      <span aria-hidden="true">†</span> Deceased
    </span>
  ) : (
    <span className="status status-living" title="Living">
      <span className="status-dot" aria-hidden="true" /> Living
    </span>
  );
}

const paths: Record<string, string> = {
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  chat: 'M4 5h16v11H8l-4 4z',
  cake: 'M4 21h16M5 21v-7h14v7M8 14v-3M12 14v-3M16 14v-3M8 7.5a1 1 0 0 0 0-2.5M12 7.5a1 1 0 0 0 0-2.5M16 7.5a1 1 0 0 0 0-2.5',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  target: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  send: 'M4 12l16-8-6 16-2-7z',
  tree: 'M12 3v18M12 8H6v4M12 8h6v4M6 12v3M18 12v3',
  chevron: 'M6 9l6 6 6-6',
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
