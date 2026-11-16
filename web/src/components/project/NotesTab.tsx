// Notes & links: a private scratchpad for the project plus related links.
import React, { useEffect, useState } from 'react';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { usePatchProject } from '../../api';
import { ExternalA } from '../cards';
import type { ProjectDetail } from '../../types';
import { Button, Card, EmptyState, Field, IconButton, Kbd, useToast } from '../ui';
import { errMsg } from './lib';

export function NotesTab({ p }: { p: ProjectDetail }) {
  const patch = usePatchProject(p.id);
  const toast = useToast();
  const [notes, setNotes] = useState(p.notes);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  useEffect(() => setNotes(p.notes), [p.notes]);
  const save = (body: Record<string, unknown>, done = 'Saved') => patch.mutate(body, { onSuccess: () => toast(done), onError: (e) => toast(errMsg(e), true) });
  const dirty = notes !== p.notes;
  const validUrl = /^https?:\/\/\S+$/.test(url.trim());
  const addLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validUrl) return;
    save({ links: [...p.links, { title: title.trim(), url: url.trim() }] }, 'Link added');
    setTitle('');
    setUrl('');
  };
  return (
    <div className="grid-2 pj-notes">
      <Card
        title="Notes"
        actions={dirty ? <span className="tiny faint">Unsaved</span> : undefined}
        footer={
          <>
            <span className="tiny faint grow hide-mobile">
              <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd> to save · stored only on your PC
            </span>
            <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} loading={patch.isPending} onClick={() => save({ notes })}>
              Save notes
            </Button>
          </>
        }
      >
        <textarea
          className="textarea pj-notes-text"
          rows={12}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && dirty) save({ notes });
          }}
          placeholder="Decisions, client contacts, where the credentials live, what to try next…"
          aria-label="Project notes"
        />
      </Card>
      <Card title="Links" count={p.links.length || undefined} flush={p.links.length > 0} footer={
        <form className="pj-linkform" onSubmit={addLink}>
          <Field label="Add a link" htmlFor="ln-url">
            <input id="ln-url" className="input" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <div className="pj-linkform-row">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" aria-label="Link title" maxLength={80} />
            <Button type="submit" icon={<Plus />} disabled={!validUrl}>
              Add
            </Button>
          </div>
        </form>
      }>
        {p.links.length ? (
          p.links.map((l, i) => (
            <div key={`${l.url}${i}`} className="lrow">
              <div className="lrow-lead">
                <Link2 size={15} className="faint" aria-hidden="true" />
              </div>
              <div className="lrow-body">
                <ExternalA href={l.url}>
                  <span className="truncate pj-link-title">{l.title || l.url.replace(/^https?:\/\//, '')}</span>
                </ExternalA>
                {l.title && <div className="tiny faint truncate">{l.url}</div>}
              </div>
              <div className="lrow-trail">
                <IconButton icon={<Trash2 />} label={`Remove ${l.title || 'link'}`} onClick={() => save({ links: p.links.filter((_, j) => j !== i) }, 'Link removed')} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState compact title="No links yet" body="Claude.ai chats, deployments, ClickUp, docs: anything related." />
        )}
      </Card>
    </div>
  );
}
