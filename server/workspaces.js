// Workspace = the top-level folder a project lives in (~/acme/api → "acme"). Display names and merges are user
// settings in data/state.json `workspaces`: key -> {name?, mergeInto?}. `name` is set in Settings → Projects;
// `mergeInto` folds one top folder into another workspace (e.g. {"acme-old": {"mergeInto": "acme"}}).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';
import { readJSONSync, log } from './util.js';

/** Built-in display names (generic only; everything personal lives in state.json). */
const NAMES = {
  home: 'Home',
};

export function WORKSPACE_DISPLAY(key) {
  if (!key) return 'Other';
  if (NAMES[key]) return NAMES[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** The workspace a top folder belongs to after the user's merges (follows at most a few hops, no loops). */
export function mergedWorkspaceKey(key, workspaces = {}) {
  let k = key;
  for (let i = 0; i < 5; i++) {
    const to = workspaces[k]?.mergeInto;
    if (typeof to !== 'string' || !to || to === k) break;
    k = to;
  }
  return k;
}

/**
 * One-time import of display names / merges that older versions kept in code. Reads an optional, never-published
 * file (server/local-workspaces.json: {names: {key: name}, merges: {key: target}}) and fills only what state.json
 * doesn't set yet; a flag in state.json makes it run once. No file (every fresh install) = nothing to do.
 */
export function importLocalWorkspaces(store, file = path.join(ROOT, 'server', 'local-workspaces.json')) {
  const done = (store.data.migrations ||= {});
  if (done.localWorkspaces) return 0;
  const src = fs.existsSync(file) ? readJSONSync(file, null) : null;
  let n = 0;
  if (src && typeof src === 'object') {
    const ws = store.data.workspaces;
    for (const [k, name] of Object.entries(src.names || {})) {
      if (typeof name !== 'string' || !name || ws[k]?.name) continue;
      ws[k] = { ...(ws[k] || {}), name };
      n++;
    }
    for (const [k, to] of Object.entries(src.merges || {})) {
      if (typeof to !== 'string' || !to || ws[k]?.mergeInto) continue;
      ws[k] = { ...(ws[k] || {}), mergeInto: to };
      n++;
    }
    log.info(`workspaces: imported ${n} names/merges from ${path.basename(file)}`);
  }
  done.localWorkspaces = Date.now();
  store.save();
  return n;
}
