import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { sendMessage } from '../lib/api';
import { conversationOf, GENERAL } from '../lib/chat';
import type { ChatMessage, Profile } from '../lib/types';
import { Icon } from './ui';

export function ChatPanel({
  me,
  familyId,
  messages,
  profiles,
  unread,
  onSeen,
  onSent,
  onClose,
}: {
  me: string;
  familyId: string;
  messages: ChatMessage[];
  profiles: Profile[];
  unread: Map<string, number>;
  onSeen: (conversation: string) => void;
  onSent: (message: ChatMessage) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'general' | 'private'>('general');
  const [peer, setPeer] = useState<string | null>(null);
  const conversation = tab === 'general' ? GENERAL : peer;
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? 'Someone';

  const thread = useMemo(
    () => (conversation ? messages.filter((m) => conversationOf(m, me) === conversation) : []),
    [messages, conversation, me],
  );

  useEffect(() => {
    if (conversation) onSeen(conversation);
  }, [conversation, thread.length, onSeen]);

  const privateUnread = [...unread.entries()].reduce((n, [k, v]) => (k === GENERAL ? n : n + v), 0);

  return (
    <aside className="chat-panel" aria-label="Chat">
      <header className="chat-header">
        {tab === 'private' && peer ? (
          <button type="button" className="icon-button" onClick={() => setPeer(null)} aria-label="Back to conversations">
            <Icon name="back" />
          </button>
        ) : null}
        <h2>{tab === 'private' && peer ? nameOf(peer) : 'Family chat'}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close chat">
          <Icon name="close" />
        </button>
      </header>

      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'general'} onClick={() => setTab('general')}>
          General {unread.get(GENERAL) ? <span className="badge">{unread.get(GENERAL)}</span> : null}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'private'} onClick={() => setTab('private')}>
          Private {privateUnread ? <span className="badge">{privateUnread}</span> : null}
        </button>
      </div>

      {tab === 'private' && !peer ? (
        <PeopleList me={me} messages={messages} profiles={profiles} unread={unread} onPick={setPeer} />
      ) : (
        conversation && (
          <Thread
            me={me}
            familyId={familyId}
            thread={thread}
            nameOf={nameOf}
            recipient={conversation === GENERAL ? null : conversation}
            showNames={conversation === GENERAL}
            onSent={onSent}
          />
        )
      )}
    </aside>
  );
}

function PeopleList({ me, messages, profiles, unread, onPick }: {
  me: string; messages: ChatMessage[]; profiles: Profile[]; unread: Map<string, number>; onPick: (id: string) => void;
}) {
  const last = new Map<string, ChatMessage>();
  for (const m of messages) {
    const c = conversationOf(m, me);
    if (c !== GENERAL) last.set(c, m);
  }
  const others = profiles
    .filter((p) => p.id !== me)
    .sort((a, b) => (last.get(b.id)?.created_at ?? '').localeCompare(last.get(a.id)?.created_at ?? '') || a.display_name.localeCompare(b.display_name));

  if (others.length === 0) return <p className="muted chat-empty">No other family members have signed up yet.</p>;
  return (
    <ul className="chat-people">
      {others.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => onPick(p.id)}>
            <span className="chat-avatar" aria-hidden="true">{p.display_name.slice(0, 1).toUpperCase()}</span>
            <span className="chat-people-text">
              <strong>{p.display_name}</strong>
              <small>{last.get(p.id)?.body ?? p.email}</small>
            </span>
            {unread.get(p.id) ? <span className="badge">{unread.get(p.id)}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Thread({ me, familyId, thread, nameOf, recipient, showNames, onSent }: {
  me: string; familyId: string; thread: ChatMessage[]; nameOf: (id: string) => string; recipient: string | null; showNames: boolean;
  onSent: (message: ChatMessage) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [thread.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setError('');
    try {
      onSent(await sendMessage(familyId, body, recipient));
    } catch (err) {
      setDraft(body);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <div className="chat-thread">
        {thread.length === 0 && <p className="muted chat-empty">No messages yet — say hello!</p>}
        {thread.map((m) => (
          <div key={m.id} className={`bubble ${m.sender_id === me ? 'mine' : ''}`}>
            {showNames && m.sender_id !== me && <span className="bubble-name">{nameOf(m.sender_id)}</span>}
            <p>{m.body}</p>
            <time dateTime={m.created_at}>
              {new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
            </time>
          </div>
        ))}
        <div ref={end} />
      </div>
      {error && <p className="form-error">{error}</p>}
      <form className="chat-compose" onSubmit={submit}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" maxLength={4000} aria-label="Message" />
        <button type="submit" className="icon-button icon-button-primary" aria-label="Send" disabled={!draft.trim()}>
          <Icon name="send" />
        </button>
      </form>
    </>
  );
}
