// Action menu: a small popover on desktop, a bottom sheet on phones (DESIGN §2.9: no hover-only actions).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { Modal } from '../ui';
import { useIsPhone } from './lib';

export type MenuEntry =
  | { kind?: 'item'; label: React.ReactNode; icon?: React.ReactNode; onSelect: () => void; checked?: boolean; danger?: boolean; disabled?: boolean; hint?: React.ReactNode }
  | { kind: 'section'; label: React.ReactNode }
  | { kind: 'sep' };

type TriggerProps = { onClick: (e: React.MouseEvent) => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean };

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function Menu({ items, label, sheetTitle, trigger }: { items: MenuEntry[]; label: string; sheetTitle?: React.ReactNode; trigger: (p: TriggerProps) => React.ReactNode }) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const select = (fn: () => void) => {
    setOpen(false);
    // let the menu unmount before the action opens a dialog / navigates
    setTimeout(fn, 0);
  };
  const props: TriggerProps = {
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen((o) => !o);
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
  };
  return (
    <span ref={anchor} className="pm-anchor" onClick={stop} onPointerDown={stop} onKeyDown={stop}>
      {trigger(props)}
      {open &&
        (phone ? (
          <span onClick={stop}>
            <Modal title={<span className="clamp-2">{sheetTitle ?? label}</span>} onClose={close} className="pm-sheet">
              <div className="pm-sheet-body" role="menu" aria-label={label}>
                <MenuItems items={items} onSelect={select} />
              </div>
            </Modal>
          </span>
        ) : (
          <Popover anchor={anchor} onClose={close} label={label}>
            <MenuItems items={items} onSelect={select} />
          </Popover>
        ))}
    </span>
  );
}

function MenuItems({ items, onSelect }: { items: MenuEntry[]; onSelect: (fn: () => void) => void }) {
  // When some items have icons, the others get a blank slot so every label starts on the same line.
  const anyIcon = items.some((it) => (it.kind === undefined || it.kind === 'item') && (it as { icon?: React.ReactNode }).icon);
  return (
    <>
      {items.map((it, i) => {
        if (it.kind === 'sep') return <div key={i} className="pm-sep" role="separator" />;
        if (it.kind === 'section')
          return (
            <div key={i} className="pm-section">
              {it.label}
            </div>
          );
        const radio = it.checked !== undefined;
        return (
          <button
            key={i}
            type="button"
            role={radio ? 'menuitemradio' : 'menuitem'}
            aria-checked={radio ? it.checked : undefined}
            className={`pm-item${it.danger ? ' danger' : ''}${it.checked ? ' on' : ''}`}
            disabled={it.disabled}
            onClick={() => onSelect(it.onSelect)}
          >
            {it.icon || (anyIcon && <span className="pm-ico-slot" aria-hidden="true" />)}
            <span className="pm-label">
              {it.label}
              {it.hint && <span className="pm-hint">{it.hint}</span>}
            </span>
            {it.checked && <Check className="pm-check" aria-hidden="true" />}
          </button>
        );
      })}
    </>
  );
}

function Popover({ anchor, onClose, label, children }: { anchor: React.RefObject<HTMLElement>; onClose: () => void; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const m = ref.current;
    if (!a || !m) return;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    let top = a.bottom + 6;
    if (top + h > window.innerHeight - 8 && a.top - 6 - h > 8) top = a.top - 6 - h;
    let left = a.right - w;
    if (left < 8) left = Math.min(a.left, window.innerWidth - w - 8);
    setPos({ top, left: Math.max(8, left) });
  }, [anchor]);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('.pm-item:not(:disabled)')?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        (anchor.current?.querySelector('button') as HTMLButtonElement | null)?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const all = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.pm-item:not(:disabled)') || [])];
        const i = all.indexOf(document.activeElement as HTMLButtonElement);
        const next = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
        next?.focus();
      } else if (e.key === 'Tab') onClose();
    };
    const onScroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className="pm-menu" role="menu" aria-label={label} style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }} onClick={stop} onPointerDown={stop}>
      {children}
    </div>,
    document.body,
  );
}
