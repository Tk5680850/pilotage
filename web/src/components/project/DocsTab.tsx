// Docs tab: the project's Markdown files (root, docs/, Claude memory) with a reader. Phones: list → reader.
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText } from 'lucide-react';
import { api } from '../../api';
import type { Doc, ProjectDetail } from '../../types';
import { Button, Callout, Card, CopyButton, EmptyState, LoadingCard, Markdown, Meta, PathLabel } from '../ui';
import { ago, bytes, fmtDateTime, shortAgo } from '../../util';
import { errMsg, useIsPhone } from './lib';

/** Files inside the project read as "docs/sms.md"; anything else (Claude memory…) as a PathLabel. */
function DocLabel({ p, d }: { p: ProjectDetail; d: Doc }) {
  const root = p.path.replace(/\/+$/, '') + '/';
  if (!d.path.startsWith(root)) return <PathLabel path={d.path} />;
  const rel = d.path.slice(root.length);
  const i = rel.lastIndexOf('/');
  return (
    <span className="pj-doc-label" title={d.path}>
      <span className="pl-name">{i >= 0 ? rel.slice(i + 1) : rel}</span>
      {i >= 0 && <span className="pl-dir">{rel.slice(0, i)}/</span>}
    </span>
  );
}

function Reader({ p, doc, onBack }: { p: ProjectDetail; doc: Doc; onBack?: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['doc', p.id, doc.path],
    queryFn: () => api<{ content: string; name: string; mtime: number }>(`/api/projects/${p.id}/doc?path=${encodeURIComponent(doc.path)}`),
    staleTime: 30_000,
  });
  const md = /\.(md|markdown|mdx)$/i.test(doc.name);
  return (
    <Card className="pj-reader" pad={false}>
      <div className="pj-reader-head">
        {onBack && <Button size="sm" variant="ghost" icon={<ArrowLeft />} onClick={onBack} aria-label="Back to documents" className="pj-reader-back" />}
        <div className="grow">
          <DocLabel p={p} d={doc} />
          <Meta items={[doc.group, bytes(doc.size), <span title={fmtDateTime(doc.mtime)}>edited {ago(doc.mtime)}</span>]} />
        </div>
        <CopyButton text={doc.path} label="Copy path" />
      </div>
      <div className="pj-reader-body">
        {isLoading ? (
          <LoadingCard lines={6} />
        ) : error ? (
          <Callout tone="warn" title="Can’t open this file">
            {errMsg(error)}
          </Callout>
        ) : data?.content.trim() ? (
          md ? (
            <Markdown text={data.content} className="readable" />
          ) : (
            <pre className="pre-wrap small mono">{data.content}</pre>
          )
        ) : (
          <div className="small faint">This file is empty.</div>
        )}
      </div>
    </Card>
  );
}

export function DocsTab({ p }: { p: ProjectDetail }) {
  const phone = useIsPhone();
  const [params, setParams] = useSearchParams();
  const want = params.get('doc');
  const groups = useMemo(() => {
    const m = new Map<string, Doc[]>();
    for (const d of p.docs) m.set(d.group, [...(m.get(d.group) || []), d]);
    return [...m.entries()];
  }, [p.docs]);
  if (!p.docs.length)
    return (
      <Card>
        <EmptyState icon={<FileText />} title="No documents" body="No Markdown files at the root, in docs/, or in Claude’s memory for this project." />
      </Card>
    );
  const selected = p.docs.find((d) => d.path === want) || (phone ? null : p.docs[0]);
  const pick = (d: Doc) => {
    const n = new URLSearchParams(params);
    n.set('doc', d.path);
    // on phones the reader replaces the list, so Back should return to it
    setParams(n, { replace: !phone });
    if (phone) window.scrollTo({ top: 0 });
  };
  const back = () => {
    const n = new URLSearchParams(params);
    n.delete('doc');
    setParams(n, { replace: true });
  };
  const list = (
    <Card flush className="pj-doclist">
      {groups.map(([g, docs]) => (
        <div key={g} role="group" aria-label={g}>
          <div className="pj-doc-group">{g}</div>
          {docs.map((d) => (
            <button key={d.path} type="button" className={`pj-doc${selected?.path === d.path ? ' on' : ''}`} onClick={() => pick(d)} aria-current={selected?.path === d.path ? 'true' : undefined}>
              <FileText aria-hidden="true" />
              <span className="grow pj-doc-text">
                <DocLabel p={p} d={d} />
              </span>
              <span className="tiny faint num" title={`Edited ${fmtDateTime(d.mtime)}`}>
                {shortAgo(d.mtime)}
              </span>
            </button>
          ))}
        </div>
      ))}
    </Card>
  );
  if (phone) return selected ? <Reader p={p} doc={selected} onBack={back} /> : list;
  return (
    <div className="pj-docs">
      {list}
      {selected && <Reader key={selected.path} p={p} doc={selected} />}
    </div>
  );
}
