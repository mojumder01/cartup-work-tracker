import { useState } from 'react';
import type { Route } from '../types';
import { Icon, type IconName } from './Icon';
import { buildLabel, builtAtLabel } from '../utils/buildInfo';

export const NAV: { id: Route; label: string; icon: IconName; group: 'Overview' | 'Performance' | 'Data' }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'Overview' },
  { id: 'work', label: 'Work Sheet', icon: 'table', group: 'Overview' },
  { id: 'kpi', label: 'KPI & Target', icon: 'target', group: 'Overview' },
  { id: 'team', label: 'Team Performance', icon: 'users', group: 'Performance' },
  { id: 'upload', label: 'Upload', icon: 'upload', group: 'Performance' },
  { id: 'qc', label: 'QC', icon: 'qc', group: 'Performance' },
  { id: 'visual', label: 'Visual / Image', icon: 'image', group: 'Performance' },
  { id: 'reports', label: 'Reports', icon: 'report', group: 'Data' },
  { id: 'people', label: 'Team Members', icon: 'userCheck', group: 'Data' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'Data' },
];

function NavItems({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  let group = '';
  return (
    <>
      {NAV.map((n) => {
        const heading = n.group !== group ? ((group = n.group), <div className="nav-section">{n.group}</div>) : null;
        return (
          <div key={n.id}>
            {heading}
            <button
              type="button"
              className="nav-item"
              aria-current={route === n.id ? 'page' : undefined}
              onClick={() => onNavigate(n.id)}
              title={n.label}
            >
              <Icon name={n.icon} />
              <span className="label">{n.label}</span>
            </button>
          </div>
        );
      })}
    </>
  );
}

export function Sidebar({ route, onNavigate, sheetTitle }: { route: Route; onNavigate: (r: Route) => void; sheetTitle?: string }) {
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          C
        </div>
        <div className="brand-text">
          <strong>CARTUP</strong>
          <span>Content Department</span>
        </div>
      </div>
      <nav className="nav">
        <NavItems route={route} onNavigate={onNavigate} />
      </nav>
      <div className="sidebar-foot">
        <div>Source: Google Sheets</div>
        {sheetTitle && <div title={sheetTitle} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sheetTitle}</div>}
        <div className="build-tag" title={`Deployed ${builtAtLabel()}`}>
          {buildLabel()}
        </div>
      </div>
    </aside>
  );
}

const MOBILE_PRIMARY: Route[] = ['dashboard', 'work', 'kpi', 'team'];

export function MobileNav({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  const [open, setOpen] = useState(false);
  const go = (r: Route) => {
    setOpen(false);
    onNavigate(r);
  };
  const inMore = !MOBILE_PRIMARY.includes(route);
  return (
    <>
      <nav className="bottom-nav" aria-label="Main navigation">
        {MOBILE_PRIMARY.map((id) => {
          const n = NAV.find((x) => x.id === id)!;
          return (
            <button key={id} type="button" aria-current={route === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon name={n.icon} size={20} />
              {n.label.split(' ')[0]}
            </button>
          );
        })}
        <button type="button" aria-current={inMore ? 'page' : undefined} onClick={() => setOpen(true)} aria-expanded={open}>
          <Icon name="more" size={20} />
          More
        </button>
      </nav>
      {open && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpen(false)} />
          <div className="sheet" role="dialog" aria-label="More pages">
            <NavItems route={route} onNavigate={go} />
          </div>
        </>
      )}
    </>
  );
}
