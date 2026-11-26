import { useEffect, useState } from 'react';
import type { ChatAdapter } from '../adapters/types';
import type { ProviderChoice } from '../domain/types';
import { routeTask, type RouteDecision } from '../router/providerRouter';
import { navigate } from '../router/useRoute';
import { useActiveProject, useApp, useAudit, useCollection, useSettings } from '../state/AppState';
import { Icon } from '../ui/Icon';
import { EmptyState, Notice, PageHeader, Panel, fmtTime } from '../ui/kit';

export function Home() {
  const { db, adapters } = useApp();
  const settings = useSettings();
  const project = useActiveProject();
  const audit = useAudit();
  const scope = settings.activeProjectId ?? null;
  const conversations = useCollection('conversations').filter((c) => c.projectId === scope);
  const allMessages = useCollection('messages');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<ProviderChoice>('auto');
  const [route, setRoute] = useState<RouteDecision | null>(null);
  const [busy, setBusy] = useState(false);

  const current = conversations.find((c) => c.id === currentId) ?? conversations[conversations.length - 1];
  const messages = current ? allMessages.filter((m) => m.conversationId === current.id) : [];
  const chatProviders = adapters.filter((a) => a.meta.plannedCapabilities.includes('chat'));

  useEffect(() => {
    let live = true;
    void routeTask(adapters, { kind: 'chat', preferred: choice }).then((d) => { if (live) setRoute(d); });
    return () => { live = false; };
  }, [adapters, choice]);

  async function newChat() {
    const c = await db.create('conversations', { projectId: scope, title: 'New conversation', providerChoice: choice });
    setCurrentId(c.id);
    await audit({ action: 'conversation.create', target: c.id });
  }

  async function send() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      let conv = current;
      if (!conv) {
        conv = await db.create('conversations', { projectId: scope, title: content.slice(0, 48), providerChoice: choice });
        setCurrentId(conv.id);
      } else if (conv.title === 'New conversation') {
        await db.update('conversations', conv.id, { title: content.slice(0, 48) });
      }
      setText('');
      await db.create('messages', { conversationId: conv.id, role: 'user', content, delivery: 'saved_locally' });
      const decision = await routeTask(adapters, { kind: 'chat', preferred: choice });
      if (!decision.ok) {
        await db.create('messages', { conversationId: conv.id, role: 'system', content: `Saved on this device only. Not sent to any provider. ${decision.reason}`, delivery: 'saved_locally' });
        await audit({ action: 'chat.not_sent', target: conv.id, detail: decision.reason, outcome: 'denied' });
        return;
      }
      const adapter = adapters.find((a) => a.meta.id === decision.providerId) as Partial<ChatAdapter> | undefined;
      const history = [...db.snapshot('messages').filter((m) => m.conversationId === conv!.id), ].map((m) => ({ role: m.role, content: m.content }));
      const res = adapter?.sendMessage ? await adapter.sendMessage({ messages: history, projectId: project?.id }) : null;
      if (res?.ok) {
        await db.create('messages', { conversationId: conv.id, role: 'assistant', content: res.value.content, delivery: 'delivered', providerId: decision.providerId });
        await audit({ action: 'chat.delivered', target: conv.id, detail: decision.providerId });
      } else {
        const why = res ? res.error.message : 'The selected provider has no chat support.';
        await db.create('messages', { conversationId: conv.id, role: 'system', content: `Provider call failed: ${why}`, delivery: 'failed', providerId: decision.providerId });
        await audit({ action: 'chat.failed', target: conv.id, detail: why, outcome: 'error' });
      }
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader
        title={project ? project.name : 'Home'}
        subtitle={project ? project.description || 'Conversations for this project are stored in this browser.' : 'Start a conversation, or create a project to keep work organised.'}
        actions={<button className="btn primary" onClick={newChat}><Icon name="plus" size={16} />New conversation</button>}
      />
      {route && !route.ok && (
        <Notice tone="warn">
          <b>No provider is connected, so nothing you write here will be answered.</b> Messages are saved on this device only.{' '}
          <a href="#/settings" onClick={() => navigate('/settings')}>See provider status</a>
        </Notice>
      )}
      <div className="split">
        <Panel title="Conversations">
          {conversations.length === 0 ? (
            <small>No conversations yet.</small>
          ) : (
            <div className="stack" style={{ gap: 4 }}>
              {[...conversations].reverse().map((c) => (
                <button key={c.id} className={`list-btn ${current?.id === c.id ? 'on' : ''}`} onClick={() => setCurrentId(c.id)}>
                  {c.title}<small>{fmtTime(c.updatedAt)}</small>
                </button>
              ))}
            </div>
          )}
        </Panel>
        <Panel
          title="Conversation"
          aside={
            <label className="row tight">
              <small>Provider</small>
              <select value={choice} onChange={(e) => setChoice(e.target.value as ProviderChoice)} aria-label="Provider for this conversation">
                <option value="auto">Automatic</option>
                {chatProviders.map((a) => <option key={a.meta.id} value={a.meta.id}>{a.meta.name}</option>)}
              </select>
            </label>
          }
        >
          <div className="thread" aria-live="polite">
            {messages.length === 0 ? (
              <EmptyState icon="send" title="Write your first message">
                Messages and their delivery status are saved locally. A message only shows as delivered after a connected provider answers.
              </EmptyState>
            ) : messages.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.content}
                <small>{fmtTime(m.createdAt)}{m.role === 'user' ? ` · ${m.delivery === 'saved_locally' ? 'saved locally, not sent' : m.delivery}` : ''}</small>
              </div>
            ))}
          </div>
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
            <textarea
              aria-label="Message"
              value={text}
              placeholder="Describe what you want to build, research or create"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(); }}
            />
            <button className="btn primary" onClick={send} disabled={!text.trim() || busy}><Icon name="send" size={16} />Send</button>
          </div>
          <small>Ctrl or Cmd + Enter to send. {route?.ok ? `Routing to ${route.providerId}.` : 'Routing: no provider available.'}</small>
        </Panel>
      </div>
    </>
  );
}
