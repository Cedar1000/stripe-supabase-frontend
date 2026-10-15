import { UserButton } from '@clerk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../lib/api';
import { upcomingBirthdays } from '../lib/birthdays';
import { conversationOf, loadSeen, saveSeen } from '../lib/chat';
import { AUTH_DISABLED } from '../lib/demo';
import { ancestorsOf, buildIndex, fullName, Permissions } from '../lib/tree';
import type { AdminGrant, AuthSession, ChatMessage, Family, Member, Person, PersonInput } from '../lib/types';
import { supabase } from '../utils/supabase';
import { AdminDialog } from './AdminDialog';
import { BirthdayPanel } from './BirthdayPanel';
import { ChatPanel } from './ChatPanel';
import { FamilyDialog } from './FamilyDialog';
import { PersonForm } from './PersonForm';
import { PersonPanel } from './PersonPanel';
import { SearchDialog } from './SearchDialog';
import { TreeView } from './TreeView';
import { Icon } from './ui';

type Dialog =
  | { kind: 'add'; parentId: string | null }
  | { kind: 'edit'; person: Person }
  | { kind: 'search' }
  | { kind: 'birthdays' }
  | { kind: 'admins'; scope: string | null }
  | { kind: 'family' }
  | null;

function upsert<T extends { id: string }>(list: T[], item: T) {
  const i = list.findIndex((x) => x.id === item.id);
  return i === -1 ? [...list, item] : list.map((x) => (x.id === item.id ? item : x));
}

export function FamilyApp({
  session,
  family,
  families,
  onSwitchFamily,
  onAddFamily,
  onFamiliesChanged,
}: {
  session: AuthSession;
  family: Family;
  families: Family[];
  onSwitchFamily: (familyId: string) => void;
  onAddFamily: () => void;
  onFamiliesChanged: () => void;
}) {
  const me = session.user.id;
  const familyId = family.id;
  const [people, setPeople] = useState<Person[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [admins, setAdmins] = useState<AdminGrant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [seen, setSeen] = useState(() => loadSeen(me, familyId));
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const index = useMemo(() => buildIndex(people), [people]);
  const permissions = useMemo(() => new Permissions(me, admins, index), [me, admins, index]);

  const centerOn = useCallback((id: string) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 })), []);

  // ---- Data loading + live updates -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.fetchPeople(familyId), api.fetchMembers(familyId), api.fetchAdmins(familyId), api.fetchMessages(familyId)])
      .then(([pe, mb, ad, ms]) => {
        if (cancelled) return;
        setPeople(pe);
        setMembers(mb);
        setAdmins(ad);
        setMessages(ms);
        const firstRoot = buildIndex(pe).childrenOf.get(null)?.[0];
        if (firstRoot) setFocus({ id: firstRoot.id, n: 1 });
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));

    if (AUTH_DISABLED) {
      return () => {
        cancelled = true;
      };
    }

    const reloadPeople = () => api.fetchPeople(familyId).then(setPeople).catch(() => {});
    const reloadAdmins = () => api.fetchAdmins(familyId).then(setAdmins).catch(() => {});
    const reloadMembers = () => api.fetchMembers(familyId).then(setMembers).catch(() => {});
    // Only this family's rows; RLS also stops other tenants' rows reaching the client.
    const filter = `family_id=eq.${familyId}`;
    const channel = supabase
      .channel(`family-${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'people', filter }, reloadPeople)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tree_admins', filter }, reloadAdmins)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_members', filter }, () => {
        reloadMembers();
        onFamiliesChanged();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'families', filter: `id=eq.${familyId}` }, onFamiliesChanged)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter }, (payload) =>
        setMessages((list) => upsert(list, payload.new as ChatMessage)),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [familyId, onFamiliesChanged]);

  // ---- Chat unread counts -------------------------------------------------------------
  const unread = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of messages) {
      if (m.sender_id === me) continue;
      const c = conversationOf(m, me);
      if (!seen[c] || m.created_at > seen[c]) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return counts;
  }, [messages, seen, me]);
  const unreadTotal = [...unread.values()].reduce((a, b) => a + b, 0);

  const markSeen = useCallback(
    (conversation: string) =>
      setSeen((s) => {
        const next = { ...s, [conversation]: new Date().toISOString() };
        saveSeen(me, familyId, next);
        return next;
      }),
    [me, familyId],
  );

  // ---- Birthday alerts ----------------------------------------------------------------
  const soon = useMemo(() => upcomingBirthdays(people, 7), [people]);
  const today = soon.filter((b) => b.inDays === 0);

  useEffect(() => {
    if (today.length === 0 || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const key = `family-tree:birthday-notified:${new Date().toDateString()}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      return;
    }
    new Notification('🎂 Birthday today', {
      body: today.map((b) => `${fullName(b.person)} turns ${b.turning}`).join('\n'),
    });
  }, [today]);

  // ---- Tree interactions --------------------------------------------------------------
  const flashHighlight = useRef<number | undefined>(undefined);
  const reveal = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const a of ancestorsOf(index, id)) next.add(a.id);
        return next;
      });
      setSelectedId(id);
      setHighlightId(id);
      window.clearTimeout(flashHighlight.current);
      flashHighlight.current = window.setTimeout(() => setHighlightId(null), 4000);
      setDialog(null);
      centerOn(id);
    },
    [index, centerOn],
  );

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

  const expandAll = () => setExpanded(new Set(people.map((p) => p.id)));
  const collapseAll = () => {
    setExpanded(new Set());
    const root = index.childrenOf.get(null)?.[0];
    if (root) centerOn(root.id);
  };

  // ---- Mutations ----------------------------------------------------------------------
  const addPerson = async (input: PersonInput) => {
    const created = await api.createPerson(familyId, input);
    setPeople((list) => upsert(list, created));
    if (input.parent_id) setExpanded((prev) => new Set(prev).add(input.parent_id!));
    setFreshIds((prev) => new Set(prev).add(created.id));
    window.setTimeout(() => setFreshIds((prev) => {
      const next = new Set(prev);
      next.delete(created.id);
      return next;
    }), 1200);
    setDialog(null);
    centerOn(created.id);
  };

  const editPerson = async (person: Person, input: PersonInput) => {
    const updated = await api.updatePerson(person.id, { ...input, parent_id: person.parent_id });
    setPeople((list) => upsert(list, updated));
    setDialog(null);
  };

  const removePerson = async (person: Person) => {
    if (!confirm(`Delete ${fullName(person)} from the tree? This cannot be undone.`)) return;
    try {
      await api.deletePerson(person.id);
      setPeople((list) => list.filter((p) => p.id !== person.id));
      setSelectedId(person.parent_id);
      if (person.parent_id) centerOn(person.parent_id);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const refreshMembership = () => {
    api.fetchMembers(familyId).then(setMembers).catch(() => {});
    api.fetchAdmins(familyId).then(setAdmins).catch(() => {});
    onFamiliesChanged();
  };

  const selected = selectedId ? index.byId.get(selectedId) : undefined;
  const roots = index.childrenOf.get(null) ?? [];

  // The same actions render in the header (wide screens) and the bottom tab bar (phones).
  const navItems = [
    { key: 'find', icon: 'search', label: 'Find', active: dialog?.kind === 'search', onClick: () => setDialog({ kind: 'search' }) },
    {
      key: 'birthdays', icon: 'cake', label: 'Birthdays', badge: soon.length, active: dialog?.kind === 'birthdays',
      onClick: () => setDialog({ kind: 'birthdays' }),
    },
    { key: 'chat', icon: 'chat', label: 'Chat', badge: unreadTotal, active: chatOpen, onClick: () => setChatOpen((o) => !o) },
    ...(permissions.isAnyAdmin
      ? [{ key: 'admins', icon: 'shield', label: 'Admins', active: dialog?.kind === 'admins', onClick: () => setDialog({ kind: 'admins', scope: null }) }]
      : []),
  ];

  return (
    <div className={`app ${selected ? 'has-details' : ''} ${chatOpen ? 'has-chat' : ''}`}>
      <header className="app-header">
        <button type="button" className="brand family-switch" onClick={() => setDialog({ kind: 'family' })} title="Switch family, invite relatives">
          <span className="brand-mark"><Icon name="tree" size={22} /></span>
          <span className="brand-name">{family.name}</span>
          <Icon name="chevron" size={16} />
        </button>
        <nav className="header-actions">
          {navItems.map((item) => (
            <button key={item.key} type="button" className="header-button" onClick={item.onClick} aria-pressed={item.active}>
              <Icon name={item.icon} /> <span>{item.label}</span>
              {item.badge ? <span className="badge">{item.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="header-account">
          {AUTH_DISABLED ? (
            <span className="demo-pill" title="Login is turned off and changes are not saved. See src/lib/demo.ts.">Demo</span>
          ) : (
            <UserButton />
          )}
        </div>
      </header>

      {today.length > 0 && !bannerDismissed && (
        <div className="birthday-banner" role="status">
          <span>
            🎂 Today is {today.map((b, i) => (
              <span key={b.person.id}>
                {i > 0 && (i === today.length - 1 ? ' and ' : ', ')}
                <button type="button" className="link" onClick={() => reveal(b.person.id)}>{fullName(b.person)}</button>’s
              </span>
            ))} birthday!
          </span>
          <button type="button" className="icon-button" onClick={() => setBannerDismissed(true)} aria-label="Dismiss">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <main className="app-main">
        <section className="tree-area">
          {loading ? (
            <div className="center-state">Loading the family…</div>
          ) : error ? (
            <div className="center-state">
              <p className="form-error">Could not load the tree: {error}</p>
              <p className="muted">If this is a new project, run <code>supabase/schema.sql</code> in the Supabase SQL editor.</p>
            </div>
          ) : roots.length === 0 ? (
            <div className="center-state empty-tree">
              <span className="brand-mark big"><Icon name="tree" size={34} /></span>
              <h2>Welcome to {family.name}</h2>
              {permissions.isSuperAdmin ? (
                <>
                  <p className="muted">Start with the oldest ancestor you know. You can add their children, and theirs, from there.</p>
                  <button type="button" className="button button-primary" onClick={() => setDialog({ kind: 'add', parentId: null })}>
                    <Icon name="plus" size={18} /> Add the first ancestor
                  </button>
                  <button type="button" className="button button-ghost" onClick={() => setDialog({ kind: 'family' })}>
                    Invite relatives to help
                  </button>
                </>
              ) : (
                <p className="muted">The tree is empty for now. A family administrator needs to add the first ancestor.</p>
              )}
            </div>
          ) : (
            <>
              <div className="tree-toolbar">
                <span className="hint">Tap a card for details · double-tap to show children</span>
                <button type="button" className="button button-ghost" onClick={expandAll} title="Expand all">
                  <Icon name="expand" size={16} /> <span className="toolbar-label">Expand all</span>
                </button>
                <button type="button" className="button button-ghost" onClick={collapseAll} title="Collapse">
                  <Icon name="collapse" size={16} /> <span className="toolbar-label">Collapse</span>
                </button>
                {permissions.isSuperAdmin && (
                  <button type="button" className="button button-ghost" onClick={() => setDialog({ kind: 'add', parentId: null })} title="New root">
                    <Icon name="plus" size={16} /> <span className="toolbar-label">New root</span>
                  </button>
                )}
              </div>
              <TreeView
                index={index}
                expanded={expanded}
                selectedId={selectedId}
                highlightId={highlightId}
                freshIds={freshIds}
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
            permissions={permissions}
            admins={admins}
            profiles={members}
            isOpen={expanded.has(selected.id)}
            onClose={() => setSelectedId(null)}
            onAdd={() => setDialog({ kind: 'add', parentId: selected.id })}
            onEdit={() => setDialog({ kind: 'edit', person: selected })}
            onDelete={() => removePerson(selected)}
            onManageAdmins={() => setDialog({ kind: 'admins', scope: selected.id })}
            onToggleChildren={() => toggleChildren(selected.id)}
            onSelect={reveal}
          />
        )}

        {chatOpen && (
          <ChatPanel
            me={me}
            familyId={familyId}
            messages={messages}
            profiles={members}
            unread={unread}
            onSeen={markSeen}
            onSent={(m) => setMessages((list) => upsert(list, m))}
            onClose={() => setChatOpen(false)}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Main">
        <button
          type="button"
          aria-pressed={!chatOpen && !dialog}
          onClick={() => {
            setChatOpen(false);
            setDialog(null);
          }}
        >
          <Icon name="tree" /> <span>Tree</span>
        </button>
        {navItems.map((item) => (
          <button key={item.key} type="button" onClick={item.onClick} aria-pressed={item.active}>
            <Icon name={item.icon} /> <span>{item.label}</span>
            {item.badge ? <span className="badge">{item.badge}</span> : null}
          </button>
        ))}
      </nav>

      {dialog?.kind === 'add' && (
        <PersonForm
          title={dialog.parentId ? `Add a child of ${fullName(index.byId.get(dialog.parentId))}` : 'Add a root ancestor'}
          familyId={familyId}
          parentId={dialog.parentId}
          onCancel={() => setDialog(null)}
          onSubmit={addPerson}
        />
      )}
      {dialog?.kind === 'edit' && (
        <PersonForm
          title={`Edit ${fullName(dialog.person)}`}
          initial={dialog.person}
          familyId={familyId}
          parentId={dialog.person.parent_id}
          onCancel={() => setDialog(null)}
          onSubmit={(input) => editPerson(dialog.person, input)}
        />
      )}
      {dialog?.kind === 'search' && <SearchDialog index={index} onClose={() => setDialog(null)} onShow={reveal} />}
      {dialog?.kind === 'birthdays' && <BirthdayPanel people={people} onClose={() => setDialog(null)} onShow={reveal} />}
      {dialog?.kind === 'admins' && (
        <AdminDialog
          familyId={familyId}
          index={index}
          admins={admins}
          profiles={members}
          permissions={permissions}
          initialScope={dialog.scope}
          onChanged={() => api.fetchAdmins(familyId).then(setAdmins)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'family' && (
        <FamilyDialog
          me={me}
          family={family}
          families={families}
          members={members}
          admins={admins}
          permissions={permissions}
          onSwitch={onSwitchFamily}
          onAddFamily={onAddFamily}
          onChanged={refreshMembership}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
