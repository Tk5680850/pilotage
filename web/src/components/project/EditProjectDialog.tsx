// Edit name, one-liner, workspace and visibility of a project.
import React, { useMemo, useState } from 'react';
import { api, usePatchProject } from '../../api';
import type { ProjectDetail } from '../../types';
import { Button, Field, Modal, Switch, useToast } from '../ui';
import { errMsg, useIsPhone, useWorkspaceOptions } from './lib';

const NEW_WS = '__new__';
/** Workspace keys are short lowercase slugs ("side-projects"); the name you type becomes its display name. */
const wsKey = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export function EditProjectDialog({ p, onClose }: { p: ProjectDetail; onClose: () => void }) {
  const patch = usePatchProject(p.id);
  const toast = useToast();
  const phone = useIsPhone();
  const known = useWorkspaceOptions();
  // the project's own workspace is always a choice, even before the list has loaded
  const workspaces = useMemo(() => (known.some((w) => w.key === p.workspace) ? known : [{ key: p.workspace, name: p.workspaceName, count: 1 }, ...known]), [known, p.workspace, p.workspaceName]);
  const [name, setName] = useState(p.name);
  const [oneLiner, setOneLiner] = useState(p.oneLiner && p.oneLiner !== p.brief?.oneLiner ? p.oneLiner : '');
  const [workspace, setWorkspace] = useState(p.workspace);
  const [newWs, setNewWs] = useState('');
  const [hidden, setHidden] = useState(p.hidden);
  const [naming, setNaming] = useState(false);
  const creating = workspace === NEW_WS;
  const newKey = wsKey(newWs) || newWs.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40); // non-Latin names keep their letters
  // typing the name of a workspace that already exists just picks it
  const existing = creating ? workspaces.find((w) => w.key === newKey || w.name.toLowerCase() === newWs.trim().toLowerCase()) : undefined;
  const canSave = !creating || !!newKey;

  const save = async () => {
    if (!canSave) return;
    let ws = workspace;
    if (creating) {
      ws = existing?.key || newKey;
      if (!existing) {
        // name the new workspace first, so the project lands under the name that was typed
        setNaming(true);
        try {
          await api('/api/settings', { method: 'PATCH', body: { workspaces: { [ws]: { name: newWs.trim() } } } });
        } catch (e) {
          toast(errMsg(e), true);
          return;
        } finally {
          setNaming(false);
        }
      }
    }
    patch.mutate(
      { name: name.trim() || p.folderName, oneLiner: oneLiner.trim(), workspace: ws, hidden },
      {
        onSuccess: () => {
          toast(hidden && !p.hidden ? 'Hidden. Find it under Projects → Hidden.' : 'Saved');
          onClose();
        },
        onError: (e) => toast(errMsg(e), true),
      },
    );
  };
  return (
    <Modal
      title="Edit project"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={patch.isPending || naming} disabled={!canSave}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Display name" htmlFor="ep-name" hint={<>Folder: <span className="mono">{p.displayPath}</span></>}>
          <input id="ep-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus={!phone} />
        </Field>
        <Field label="One-liner" htmlFor="ep-one" hint="Leave empty to use the AI summary.">
          <input id="ep-one" className="input" value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} placeholder={p.brief?.oneLiner || 'What is this project?'} maxLength={200} />
        </Field>
        <Field label="Workspace" htmlFor="ep-ws">
          <select id="ep-ws" className="select" value={workspace} onChange={(e) => setWorkspace(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.key} value={w.key}>
                {w.name}
              </option>
            ))}
            <option value={NEW_WS}>New workspace…</option>
          </select>
        </Field>
        {creating && (
          <Field label="New workspace name" htmlFor="ep-ws-new" hint={existing ? `“${existing.name}” already exists, so the project moves there.` : 'Shown in the sidebar and on the Projects page. You can rename it later in Settings.'}>
            <input id="ep-ws-new" className="input" value={newWs} onChange={(e) => setNewWs(e.target.value)} placeholder="e.g. Client work" maxLength={60} autoFocus={!phone} />
          </Field>
        )}
        <div className="pj-setting">
          <div className="grow">
            <div className="pj-setting-label">Hide this project</div>
            <div className="hint">Hidden projects stay out of your lists. Find them again under Projects → Hidden.</div>
          </div>
          <Switch on={hidden} onChange={setHidden} label="Hide this project" />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
