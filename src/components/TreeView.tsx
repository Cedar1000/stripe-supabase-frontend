import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { formatDate } from '../lib/dates';
import type { TreeIndex } from '../lib/tree';
import { fullName } from '../lib/tree';
import type { Person } from '../lib/types';
import { Avatar, Icon } from './ui';

const DOUBLE_TAP_MS = 280;

type Props = {
  index: TreeIndex;
  expanded: Set<string>;
  selectedId: string | null;
  highlightId: string | null;
  freshIds: Set<string>;
  /** Changes whenever a card should be scrolled to the middle of the screen. */
  focus: { id: string; n: number } | null;
  onTap: (id: string) => void;
  onDoubleTap: (id: string) => void;
};

export function TreeView({ index, expanded, selectedId, highlightId, freshIds, focus, onTap, onDoubleTap }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const roots = index.childrenOf.get(null) ?? [];
  const firstFocus = useRef(true);

  useEffect(() => {
    if (!focus || !viewport.current) return;
    const vp = viewport.current;
    const card = vp.querySelector<HTMLElement>(`[data-person-id="${focus.id}"]`);
    if (!card) return;
    const v = vp.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    // On phones the details sheet covers the bottom of the tree; centre in what is still visible.
    let bottom = v.bottom;
    const sheet = document.querySelector<HTMLElement>('.person-panel');
    if (sheet && getComputedStyle(sheet).position === 'fixed') {
      // offsetTop ignores the sheet's slide-in transform, so this is where it will settle.
      bottom = Math.min(bottom, sheet.offsetTop);
    }
    vp.scrollBy({
      left: c.left + c.width / 2 - (v.left + v.width / 2),
      top: c.top + c.height / 2 - (v.top + bottom) / 2,
      behavior: firstFocus.current ? 'instant' : 'smooth',
    });
    firstFocus.current = false;
  }, [focus]);

  /** Zooms while keeping the point under `anchor` (default: the middle of the screen) still. */
  const setZoom = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const vp = viewport.current;
    const prev = zoomRef.current;
    const z = Math.min(1.6, Math.max(0.4, +next.toFixed(3)));
    if (!vp || z === prev) return;
    const r = vp.getBoundingClientRect();
    const ax = anchor ? anchor.x - r.left : r.width / 2;
    const ay = anchor ? anchor.y - r.top : r.height / 2;
    const left = ((vp.scrollLeft + ax) * z) / prev - ax;
    const top = ((vp.scrollTop + ay) * z) / prev - ay;
    zoomRef.current = z;
    flushSync(() => setZoomState(z));
    vp.scrollLeft = left;
    vp.scrollTop = top;
  }, []);

  // Two-finger pinch to zoom on touch screens.
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    let pinch: { dist: number; zoom: number } | null = null;
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { dist: distance(e.touches), zoom: zoomRef.current };
    };
    const onMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      setZoom((pinch.zoom * distance(e.touches)) / pinch.dist, { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    vp.addEventListener('touchstart', onStart, { passive: true });
    vp.addEventListener('touchmove', onMove, { passive: false });
    vp.addEventListener('touchend', onEnd);
    vp.addEventListener('touchcancel', onEnd);
    return () => {
      vp.removeEventListener('touchstart', onStart);
      vp.removeEventListener('touchmove', onMove);
      vp.removeEventListener('touchend', onEnd);
      vp.removeEventListener('touchcancel', onEnd);
    };
  }, [setZoom]);

  // Drag the background with a mouse to pan (touch screens scroll natively).
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse' || (e.target as HTMLElement).closest('.person-card')) return;
    const vp = viewport.current!;
    drag.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop };
    vp.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const vp = viewport.current!;
    vp.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
    vp.scrollTop = drag.current.top - (e.clientY - drag.current.y);
  };
  const endDrag = () => (drag.current = null);

  return (
    <div className="tree-wrap">
      <div
        ref={viewport}
        className="tree-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="tree-canvas" style={{ zoom }}>
          <ul className="tree">
            {roots.map((p) => (
              <TreeNode
                key={p.id}
                person={p}
                index={index}
                expanded={expanded}
                selectedId={selectedId}
                highlightId={highlightId}
                freshIds={freshIds}
                onTap={onTap}
                onDoubleTap={onDoubleTap}
              />
            ))}
          </ul>
        </div>
      </div>
      <div className="zoom-controls">
        <button type="button" className="icon-button" onClick={() => setZoom(zoom + 0.15)} aria-label="Zoom in">
          <Icon name="plus" />
        </button>
        <button type="button" className="icon-button" onClick={() => setZoom(1)} aria-label="Reset zoom" title="Reset zoom">
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        </button>
        <button type="button" className="icon-button" onClick={() => setZoom(zoom - 0.15)} aria-label="Zoom out">
          <Icon name="minus" />
        </button>
      </div>
    </div>
  );
}

type NodeProps = Omit<Props, 'focus'> & { person: Person };

function TreeNode({ person, index, expanded, ...rest }: NodeProps) {
  const children = index.childrenOf.get(person.id) ?? [];
  const isOpen = expanded.has(person.id) && children.length > 0;
  return (
    <li>
      <PersonCard
        person={person}
        childCount={children.length}
        isOpen={isOpen}
        selected={rest.selectedId === person.id}
        highlighted={rest.highlightId === person.id}
        fresh={rest.freshIds.has(person.id)}
        onTap={rest.onTap}
        onDoubleTap={rest.onDoubleTap}
      />
      {isOpen && (
        <ul className="tree-children">
          {children.map((c) => (
            <TreeNode key={c.id} person={c} index={index} expanded={expanded} {...rest} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PersonCard({
  person,
  childCount,
  isOpen,
  selected,
  highlighted,
  fresh,
  onTap,
  onDoubleTap,
}: {
  person: Person;
  childCount: number;
  isOpen: boolean;
  selected: boolean;
  highlighted: boolean;
  fresh: boolean;
  onTap: (id: string) => void;
  onDoubleTap: (id: string) => void;
}) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A single click waits briefly so a second click can turn it into a double tap.
  const handleClick = () => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      onDoubleTap(person.id);
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      onTap(person.id);
    }, DOUBLE_TAP_MS);
  };

  const born = formatDate(person.birth_date, person.birth_precision);
  const birthYear = person.birth_date ? person.birth_date.slice(0, 4) : '';
  const deathYear = person.death_date ? person.death_date.slice(0, 4) : '';

  return (
    <button
      type="button"
      data-person-id={person.id}
      className={[
        'person-card',
        `person-${person.gender}`,
        person.is_deceased ? 'is-deceased' : 'is-living',
        selected && 'is-selected',
        highlighted && 'is-highlighted',
        fresh && 'is-fresh',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleClick}
      onKeyDown={(e) => {
        // Keyboard: Enter = details, Space = show/hide children.
        if (e.key === ' ') {
          e.preventDefault();
          onDoubleTap(person.id);
        }
      }}
      aria-label={`${fullName(person)}, ${person.is_deceased ? 'deceased' : 'living'}${born ? `, born ${born}` : ''}${childCount ? `, ${childCount} children` : ''}`}
      aria-expanded={childCount ? isOpen : undefined}
    >
      <span className="card-photo">
        <Avatar person={person} size={72} />
        <span className={`card-status ${person.is_deceased ? 'deceased' : 'living'}`} title={person.is_deceased ? 'Deceased' : 'Living'}>
          {person.is_deceased ? '†' : ''}
        </span>
      </span>
      <span className="card-name">{fullName(person)}</span>
      <span className="card-years">
        {person.is_deceased ? `${birthYear || '?'} – ${deathYear || '?'}` : birthYear ? `b. ${birthYear}` : ' '}
      </span>
      {childCount > 0 && (
        <span className={`card-children ${isOpen ? 'open' : ''}`}>
          {childCount} {childCount === 1 ? 'child' : 'children'} <span aria-hidden="true">▾</span>
        </span>
      )}
    </button>
  );
}
