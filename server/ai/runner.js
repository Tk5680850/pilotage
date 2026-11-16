// Headless `claude -p` calls with structured output. No tools, no MCP, no user hooks,
// no session persistence: a pure text-in / JSON-out call on the user's subscription.
import { CLAUDE_BIN, paths } from '../config.js';
import { runWithInput, clip, log } from '../util.js';

const BASE_ARGS = [
  '-p',
  '--output-format', 'json',
  '--no-session-persistence',
  '--tools', '',
  '--strict-mcp-config',
  '--setting-sources', 'project',
  '--disable-slash-commands',
];

/**
 * configDir (optional): run the child with CLAUDE_CONFIG_DIR=<dir>, i.e. as the Claude account/config
 * stored there instead of ~/.claude. Usually called through ai/providers.js → callAI().
 */
export async function callClaude({ instruction, input, schema, model = 'haiku', effort = 'low', timeout = 240000, configDir = '' }) {
  const args = [...BASE_ARGS, '--model', model, '--effort', effort];
  if (schema) args.push('--json-schema', JSON.stringify(schema));
  args.push('--', instruction);
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('PILOTAGE_')) delete env[k];
  if (configDir) env.CLAUDE_CONFIG_DIR = configDir;
  const t0 = Date.now();
  const r = await runWithInput(CLAUDE_BIN, args, input, { cwd: paths.aiSandbox, env, timeout });
  const ms = Date.now() - t0;
  let j = null;
  try {
    j = JSON.parse(r.stdout);
  } catch {
    // output-format json prints one object; tolerate leading noise
    const i = r.stdout.indexOf('{"');
    if (i >= 0) {
      try {
        j = JSON.parse(r.stdout.slice(i));
      } catch {}
    }
  }
  if (!j) {
    // A timeout note sits at the end of stderr, after whatever the CLI printed: put it first so it survives the clip.
    const err = clip(r.timedOut ? `Timed out after ${Math.round(timeout / 1000)} s` : r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`, 400);
    log.warn('claude -p failed', err);
    return { ok: false, error: err, ms, ...(r.timedOut ? { timedOut: true } : {}) };
  }
  if (j.is_error || j.subtype !== 'success') {
    return { ok: false, error: clip(j.result || j.subtype || 'error', 400), ms, cost: j.total_cost_usd || 0, apiStatus: j.api_error_status };
  }
  let out = j.structured_output;
  if (!out && schema && typeof j.result === 'string') {
    try {
      out = JSON.parse(j.result.replace(/^```(json)?\s*|\s*```$/g, ''));
    } catch {}
  }
  if (schema && !out) return { ok: false, error: 'no structured output', ms, cost: j.total_cost_usd || 0 };
  return { ok: true, data: out ?? j.result, cost: j.total_cost_usd || 0, ms, model: Object.keys(j.modelUsage || {})[0] || model };
}
