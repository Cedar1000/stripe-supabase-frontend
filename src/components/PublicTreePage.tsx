import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPublicTree } from '../lib/api';
import { ancestorsOf, buildIndex } from '../lib/tree';
import type { PublicTree } from '../lib/types';
import { PersonPanel } from './PersonPanel';
import { SearchDialog } from './SearchDialog';
import { TreeView } from './TreeView';
import { Icon } from './ui';

/** Read-only view of a family tree for anyone with its public link; no login needed. */
export function PublicTreePage({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const [tree, setTree] = useState<PublicTree | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetchPublicTree(slug)
      .then((t) => {
        setTree(t);
        if (!t) return;
        // Visitors may not know the double-tap gesture, so open the first generation for them.
        const roots = buildIndex(t.people).childrenOf.get(null) ?? [];
        setExpanded(new Set(roots.map((r) => r.id)));
        if (roots[0]) setFocus({ id: roots[0].id, n: 1 });
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [slug]);

  useEffect(() => {
    if (tree) document.title = `${tree.family.name} · Family Tree`;
  }, [tree]);

  const index = useMemo(() => buildIndex(tree?.people ?? []), [tree]);
  const centerOn = useCallback((id: string) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 })), []);

  const onTap = useCallback(
    (id: string) => {
      setSelectedId(id);
      centerOn(id);
    },
    [centerOn],
  );

  const toggleChildren = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      centerOn(id);
    },
    [centerOn],
  );

  const flash = useRef<number | undefined>(undefined);
  const reveal = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const a of ancestorsOf(index, id)) next.add(a.id);
        return next;
      });
      setSelectedId(id);
      setHighlightId(id);
      window.clearTimeout(flash.current);
      flash.current = window.setTimeout(() => setHighlightId(null), 4000);
      setSearching(false);
      centerOn(id);
    },
    [index, centerOn],
  );

  const home = window.location.pathname;

  if (error || tree === null) {
    return (
      <div className="auth-page">
        <div className="auth-card public-missing">
          <span className="brand-mark"><Icon name="tree" size={26} /></span>
          <h1>This family tree isn’t available</h1>
          <p className="muted">
            {error ? `Something went wrong: ${error}` : 'The link may have changed, or the family has stopped sharing their tree publicly.'}
          </p>
          <a className="button button-primary" href={`${home}?setup`}>Start your own family tree</a>
          <a className="button button-ghost" href={home}>{signedIn ? 'Go to my family tree' : 'Sign in'}</a>
        </div>
      </div>
    );
  }
  if (tree === undefined) return <div className="center-state full">Loading family tree…</div>;

  const selected = selectedId ? index.byId.get(selectedId) : undefined;
  const people = tree.people.length;

  return (
    <div className={`app public-app ${selected ? 'has-details' : ''}`}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><Icon name="tree" size={22} /></span>
          <span className="brand-name">{tree.family.name}</span>
          <span className="pill public-pill">Public</span>
        </div>
        <nav className="header-actions">
          <button type="button" className="header-button" onClick={() => setSearching(true)}>
            <Icon name="search" /> <span>Find</span>
          </button>
        </nav>
        <div className="header-account">
          <a className="button button-secondary public-cta" href={signedIn ? home : `${home}?setup`}>
            {signedIn ? 'My trees' : 'Start your own tree'}
          </a>
        </div>
      </header>

      <div className="public-banner" role="note">
        You’re viewing {tree.family.name}’s public tree ({people} {people === 1 ? 'person' : 'people'}).
        {tree.family.hide_living && ' Living relatives are shown by name only.'}
        {!signedIn && (
          <>
            {' '}Family member? <a className="link" href={home}>Sign in</a> for photos, chat and more.
          </>
        )}
      </div>

      <main className="app-main">
        <section className="tree-area">
          {people === 0 ? (
            <div className="center-state">
              <h2>No one has been added yet</h2>
              <p className="muted">Check back soon.</p>
            </div>
          ) : (
            <>
              <div className="tree-toolbar">
                <span className="hint">Tap a card for details · double-tap to show children</span>
                <button type="button" className="button button-ghost" onClick={() => setExpanded(new Set(tree.people.map((p) => p.id)))} title="Expand all">
                  <Icon name="expand" size={16} /> <span className="toolbar-label">Expand all</span>
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => {
                    setExpanded(new Set());
                    const root = index.childrenOf.get(null)?.[0];
                    if (root) centerOn(root.id);
                  }}
                  title="Collapse"
                >
                  <Icon name="collapse" size={16} /> <span className="toolbar-label">Collapse</span>
                </button>
              </div>
              <TreeView
                index={index}
                expanded={expanded}
                selectedId={selectedId}
                highlightId={highlightId}
                freshIds={new Set()}
                focus={focus}
                onTap={onTap}
                onDoubleTap={toggleChildren}
              />
            </>
          )}
        </section>

        {selected && (
          <PersonPanel
            person={selected}
            index={index}
            isOpen={expanded.has(selected.id)}
            onClose={() => setSelectedId(null)}
            onToggleChildren={() => toggleChildren(selected.id)}
            onSelect={reveal}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main">
        <button type="button" aria-pressed={!searching} onClick={() => setSearching(false)}>
          <Icon name="tree" /> <span>Tree</span>
        </button>
        <button type="button" aria-pressed={searching} onClick={() => setSearching(true)}>
          <Icon name="search" /> <span>Find</span>
        </button>
        <a href={signedIn ? home : `${home}?setup`} className="bottom-nav-link">
          <Icon name="plus" /> <span>{signedIn ? 'My trees' : 'Your tree'}</span>
        </a>
      </nav>

      {searching && <SearchDialog index={index} onClose={() => setSearching(false)} onShow={reveal} />}
    </div>
  );
}
