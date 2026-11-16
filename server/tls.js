// Local HTTPS for phones, so Pilotage is a "secure context" (service worker, Install app) on the LAN/VPN listener.
//
// data/tls/ (0700, never served):
//   ca.key   (0600)  the Pilotage CA key. EC P-256.
//   ca.crt           the Pilotage CA: 10 years, X.509 nameConstraints (critical) that only permit private/VPN IP
//                    ranges and local names. Even if ca.key leaked, it couldn't sign a certificate for a public website
//                    that a phone would accept. This certificate (public) is what /pilotage-ca.crt serves.
//   leaf.key (0600)  the server key.
//   leaf.crt         the server certificate (397 days) for the PC's current LAN/VPN addresses. Re-issued when an address
//                    isn't covered any more, when it's within 30 days of expiry, or when the CA changed.
// Rotate: stop Pilotage, delete data/tls, start it, re-install the new certificate on the phones (docs/PHONE.md).
//
// Node can read certificates (crypto.X509Certificate) and make keys, but it can't sign certificates; the `openssl` CLI
// does that. Nothing here logs key material or openssl output that could contain it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA } from './config.js';
import { run, log } from './util.js';

export const TLS_DIR = path.join(DATA, 'tls');
const FILES = {
  caKey: path.join(TLS_DIR, 'ca.key'),
  caCrt: path.join(TLS_DIR, 'ca.crt'),
  leafKey: path.join(TLS_DIR, 'leaf.key'),
  leafCrt: path.join(TLS_DIR, 'leaf.crt'),
};
const OPENSSL = process.env.PILOTAGE_OPENSSL || 'openssl';
const DAY = 86400e3;
export const CA_DAYS = 3650;
export const LEAF_DAYS = 397; // Apple and Chrome cap server certificates at 398 days
export const RENEW_DAYS = 30;
const BACKDATE = DAY; // notBefore = yesterday: a phone whose clock is a bit behind still accepts a fresh certificate

/** What the CA may ever sign. IPv4 [base, prefix bits]. */
export const PERMITTED_IPS = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10], // NetBird / Tailscale (CGNAT range)
  ['127.0.0.0', 8],
];
/** DNS constraints in RFC 5280 form: "local" permits local and *.local. */
export const PERMITTED_DNS = ['localhost', 'local', 'lan', 'home.arpa']; // no ts.net / netbird.cloud: public suffixes (e.g. Tailscale Funnel) must stay out of reach

function ipToInt(ip) {
  const p = String(ip).split('.');
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.reduce((n, x) => n * 256 + Number(x), 0);
}
const maskOf = (bits) => (bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0);
const intToIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

export function ipPermitted(ip) {
  const a = ipToInt(ip);
  if (a === null) return false;
  return PERMITTED_IPS.some(([base, bits]) => ((a & maskOf(bits)) >>> 0) === ipToInt(base));
}
export function dnsPermitted(name) {
  const n = String(name || '').toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(n)) return false;
  return PERMITTED_DNS.some((d) => n === d || n.endsWith(`.${d}`));
}

/** `<hostname>.local`, when the PC's name is a valid DNS label. */
function localName() {
  const h = os.hostname().toLowerCase().split('.')[0];
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(h) ? `${h}.local` : null;
}
const cnSafe = (s) => String(s).replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 60);

// ---------------------------------------------------------------- state
const state = {
  ca: null, // { cert: X509Certificate, pem, key: KeyObject }
  leaf: null, // { cert: X509Certificate, pem, keyPem }
  error: null,
  checkedAt: 0,
  handshakeFailures: 0,
  lastHandshakeFailure: null, // { at, code }
};

function ensureDir() {
  fs.mkdirSync(TLS_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(TLS_DIR, 0o700);
}

function writeFileAtomic(file, data, mode) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, { mode });
  fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, file);
}

function newKeyPem() {
  return crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey;
}

/** UTCTime as `openssl ca -startdate` wants it (YYMMDDHHMMSSZ; fine until 2049). */
function utcTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function opensslConfig(work, ext) {
  return [
    '[ ca ]',
    'default_ca = pl',
    '[ pl ]',
    `database = ${work}/index.txt`,
    `serial = ${work}/serial`,
    `new_certs_dir = ${work}`,
    'default_md = sha256',
    'policy = pol',
    'unique_subject = no',
    'email_in_dn = no',
    'copy_extensions = none',
    '[ pol ]',
    'commonName = supplied',
    'organizationName = optional',
    '[ req ]',
    'distinguished_name = req_dn',
    '[ req_dn ]',
    ...ext,
    '',
  ].join('\n');
}

const CA_EXT = [
  '[ ext ]',
  'basicConstraints = critical, CA:TRUE, pathlen:0',
  'keyUsage = critical, keyCertSign, cRLSign',
  'extendedKeyUsage = serverAuth',
  'subjectKeyIdentifier = hash',
  'nameConstraints = critical, @nc',
  '[ nc ]',
  ...PERMITTED_IPS.map(([base, bits], i) => `permitted;IP.${i + 1} = ${base}/${intToIp(maskOf(bits))}`),
  ...PERMITTED_DNS.map((d, i) => `permitted;DNS.${i + 1} = ${d}`),
];

function leafExt(dns, ips) {
  return [
    '[ ext ]',
    'basicConstraints = critical, CA:FALSE',
    'keyUsage = critical, digitalSignature',
    'extendedKeyUsage = serverAuth',
    'subjectKeyIdentifier = hash',
    'authorityKeyIdentifier = keyid',
    'subjectAltName = @san',
    '[ san ]',
    ...dns.map((d, i) => `DNS.${i + 1} = ${d}`),
    ...ips.map((ip, i) => `IP.${i + 1} = ${ip}`),
  ];
}

/**
 * `openssl req` + `openssl ca` in a private scratch folder inside data/tls; returns the certificate PEM.
 * signer: null = self-signed (the CA itself), else { crtFile, keyFile }.
 */
async function sign({ keyPem, subject, ext, days, signer }) {
  ensureDir();
  const work = fs.mkdtempSync(path.join(TLS_DIR, '.work-'));
  try {
    fs.chmodSync(work, 0o700);
    const cnf = path.join(work, 'openssl.cnf');
    fs.writeFileSync(cnf, opensslConfig(work, ext), { mode: 0o600 });
    fs.writeFileSync(path.join(work, 'index.txt'), '');
    fs.writeFileSync(path.join(work, 'serial'), '01\n');
    const keyFile = path.join(work, 'subject.key');
    fs.writeFileSync(keyFile, keyPem, { mode: 0o600 });
    const csr = path.join(work, 'req.csr');
    const out = path.join(work, 'out.crt');
    const env = { PATH: process.env.PATH || '/usr/bin:/bin', OPENSSL_CONF: cnf };
    const r1 = await run(OPENSSL, ['req', '-new', '-config', cnf, '-key', keyFile, '-subj', subject, '-out', csr], { env, timeout: 20000 });
    if (r1.code !== 0) throw new Error(r1.code === -1 && /ENOENT/.test(r1.stderr) ? 'ENOENT openssl' : `openssl req failed (${r1.code})`);
    const now = Date.now();
    const args = ['ca', '-batch', '-config', cnf, '-extensions', 'ext', '-notext', '-rand_serial', '-in', csr, '-out', out];
    args.push('-startdate', utcTime(now - BACKDATE), '-enddate', utcTime(now - BACKDATE + days * DAY));
    if (signer) args.push('-cert', signer.crtFile, '-keyfile', signer.keyFile);
    else args.push('-selfsign', '-keyfile', keyFile);
    const r2 = await run(OPENSSL, args, { env, timeout: 20000 });
    if (r2.code !== 0 || !fs.existsSync(out)) {
      const why = r2.stderr.split('\n').find((l) => /violation|unable|invalid|error:/i.test(l)) || '';
      throw new Error(`openssl ca failed (${r2.code}) ${why.replace(/^[0-9A-F]+:error:[0-9A-F]+:/, '').slice(0, 160)}`.trim());
    }
    const pem = fs.readFileSync(out, 'utf8');
    return pem.slice(pem.indexOf('-----BEGIN CERTIFICATE-----'));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- CA
function loadCA() {
  try {
    const pem = fs.readFileSync(FILES.caCrt, 'utf8');
    const key = crypto.createPrivateKey(fs.readFileSync(FILES.caKey, 'utf8'));
    const cert = new crypto.X509Certificate(pem);
    if (!cert.ca || !cert.checkPrivateKey(key)) return null;
    return { cert, pem, key };
  } catch {
    return null;
  }
}

async function ensureCA() {
  if (state.ca) return state.ca;
  ensureDir();
  let ca = loadCA();
  if (!ca) {
    const existed = fs.existsSync(FILES.caCrt) || fs.existsSync(FILES.caKey);
    const keyPem = newKeyPem();
    const day = new Date().toISOString().slice(0, 10);
    const pem = await sign({ keyPem, subject: `/O=Pilotage/CN=${cnSafe(`Pilotage local CA (${os.hostname()}) ${day}`)}`, ext: CA_EXT, days: CA_DAYS, signer: null });
    writeFileAtomic(FILES.caKey, keyPem, 0o600);
    writeFileAtomic(FILES.caCrt, pem, 0o644);
    for (const f of [FILES.leafCrt, FILES.leafKey]) fs.rmSync(f, { force: true });
    ca = loadCA();
    if (!ca) throw new Error('the new CA could not be read back');
    log.info(`tls: ${existed ? 'replaced an unreadable' : 'created the'} Pilotage CA, SHA-256 ${ca.cert.fingerprint256}${existed ? ' (phones must install the new certificate)' : ''}`);
  }
  state.ca = ca;
  return ca;
}

// ---------------------------------------------------------------- leaf
/** "DNS:a, IP Address:1.2.3.4" → Set of "dns:a" / "ip:1.2.3.4". */
function sanSet(cert) {
  const out = new Set();
  for (const part of String(cert.subjectAltName || '').split(/,\s*/)) {
    const m = /^(DNS|IP Address):(.+)$/.exec(part.trim());
    if (m) out.add(`${m[1] === 'DNS' ? 'dns' : 'ip'}:${m[2].toLowerCase()}`);
  }
  return out;
}

function loadLeaf(ca) {
  try {
    const pem = fs.readFileSync(FILES.leafCrt, 'utf8');
    const keyPem = fs.readFileSync(FILES.leafKey, 'utf8');
    const cert = new crypto.X509Certificate(pem);
    if (!cert.checkPrivateKey(crypto.createPrivateKey(keyPem))) return null;
    if (!cert.checkIssued(ca.cert) || !cert.verify(ca.cert.publicKey)) return null;
    return { cert, pem, keyPem };
  } catch {
    return null;
  }
}

/** The names a server certificate must cover for these addresses (only what the CA may sign). */
export function wantedNames(ips = []) {
  const dns = [...new Set(['localhost', localName()].filter((d) => d && dnsPermitted(d)))];
  const ipList = [...new Set(['127.0.0.1', ...ips.map(String)])].filter(ipPermitted);
  return { dns, ips: ipList };
}

/**
 * Issues a server certificate signed by the Pilotage CA with exactly these names. No filtering on purpose: the tests
 * use it to prove the CA's own constraints reject public names. Returns { pem, keyPem }.
 */
export async function issueLeaf({ dns = [], ips = [], days = LEAF_DAYS } = {}) {
  await ensureCA();
  if (!dns.length && !ips.length) throw new Error('a certificate needs at least one name');
  const keyPem = newKeyPem();
  const pem = await sign({ keyPem, subject: '/O=Pilotage/CN=Pilotage', ext: leafExt(dns, ips), days, signer: { crtFile: FILES.caCrt, keyFile: FILES.caKey } });
  return { pem, keyPem };
}

async function ensureLeaf(ips) {
  const ca = await ensureCA();
  const want = wantedNames(ips);
  const need = [...want.dns.map((d) => `dns:${d}`), ...want.ips.map((i) => `ip:${i}`)];
  const cur = state.leaf || loadLeaf(ca);
  if (cur) {
    const have = sanSet(cur.cert);
    const fresh = new Date(cur.cert.validTo).getTime() - Date.now() > RENEW_DAYS * DAY;
    if (fresh && need.every((n) => have.has(n))) {
      const changed = state.leaf !== cur;
      state.leaf = cur;
      return { changed };
    }
  }
  const { pem, keyPem } = await issueLeaf(want);
  writeFileAtomic(FILES.leafKey, keyPem, 0o600);
  writeFileAtomic(FILES.leafCrt, pem, 0o644);
  state.leaf = { cert: new crypto.X509Certificate(pem), pem, keyPem };
  log.info(`tls: server certificate issued for ${need.map((n) => n.replace(/^\w+:/, '')).join(', ')} (valid until ${state.leaf.cert.validTo})`);
  return { changed: true };
}

let chain = Promise.resolve();
/**
 * Makes sure the CA and a current server certificate exist for these addresses. Serialised; cheap when nothing
 * changed. Resolves { ok:true, changed, key, cert } (PEM, for https.Server#setSecureContext) or { ok:false, error }.
 */
export function ensureTls(ips = []) {
  const p = chain.then(async () => {
    try {
      const { changed } = await ensureLeaf(ips);
      state.error = null;
      state.checkedAt = Date.now();
      return { ok: true, changed, key: state.leaf.keyPem, cert: state.leaf.pem };
    } catch (e) {
      const raw = String(e?.message || e);
      const msg = /ENOENT/.test(raw) ? 'openssl is not installed (e.g. sudo apt install openssl), so HTTPS is off' : raw;
      if (state.error !== msg) log.warn('tls:', msg);
      state.error = msg;
      return { ok: false, error: msg };
    }
  });
  chain = p.catch(() => {});
  return p;
}

/** The CA certificate in DER (what Android/iOS install), or null before it exists. */
export function caCertDer() {
  return state.ca ? state.ca.cert.raw : null;
}

/** A phone refused the certificate (usually: it doesn't have the Pilotage CA yet). Shown in Settings to help debug. */
export function noteHandshakeFailure(err) {
  state.handshakeFailures++;
  state.lastHandshakeFailure = { at: Date.now(), code: String(err?.code || 'unknown').slice(0, 80) };
}

/** Public facts for the UI. Never includes keys. */
export function tlsStatus() {
  const ca = state.ca?.cert;
  const leaf = state.leaf?.cert;
  return {
    ready: !!(ca && leaf),
    error: state.error,
    fingerprint: ca ? ca.fingerprint256 : null,
    caName: ca ? /CN=([^\n]+)/.exec(ca.subject)?.[1] || null : null,
    caValidTo: ca ? new Date(ca.validTo).getTime() : null,
    leafValidTo: leaf ? new Date(leaf.validTo).getTime() : null,
    leafNames: leaf ? [...sanSet(leaf)].map((n) => n.replace(/^\w+:/, '')) : [],
    checkedAt: state.checkedAt,
    handshakeFailures: state.handshakeFailures,
    lastHandshakeFailure: state.lastHandshakeFailure,
  };
}
