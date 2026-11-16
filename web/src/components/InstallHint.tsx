// A slim, dismissible hint for phones on plain http: Pilotage can be installed as an app once it's opened over https.
// Hidden on the PC, on https, in the installed app, on Settings (the steps are there) and once dismissed.
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppWindow, X } from 'lucide-react';
import { api, useBootstrap } from '../api';
import { isStandalone } from '../pwa';
import './install-hint.css';

const KEY = 'pilotage.installHint.dismissed';

export function InstallHint() {
  const { data: boot } = useBootstrap();
  const loc = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const eligible = !!boot?.device.viaLan && boot.device.isPhone && !window.isSecureContext && !isStandalone() && !dismissed;
  // Only worth showing when the server has a certificate to install.
  const tls = useQuery({ queryKey: ['net', 'tls', false], queryFn: () => api<{ ready: boolean }>('/api/net/tls'), enabled: eligible, staleTime: 5 * 60_000 });
  if (!eligible || !tls.data?.ready || loc.pathname.startsWith('/settings')) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* private mode: it just comes back next time */
    }
  };
  return (
    <div className="install-hint" role="note">
      <AppWindow size={16} aria-hidden="true" />
      <span className="grow">Install Pilotage as an app</span>
      <Link className="btn sm" to="/settings#phone">
        Set up
      </Link>
      <button type="button" className="btn sm ghost icon" aria-label="Hide this hint" onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  );
}
