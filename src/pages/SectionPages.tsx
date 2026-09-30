import { useApp } from '../hooks/AppContext';
import { Banner } from '../components/ui';
import { QcDetail, UploadDetail, VisualDetail } from '../components/sections/PerformanceSections';
import { dashboardConfig } from '../config/dashboard.config';

/** Reminds the viewer which date column the global date filter uses on section pages. */
function DateBasisHint({ preferred }: { preferred: string }) {
  const { filters, setFilters, dataset } = useApp();
  if (filters.datePreset === 'all' || filters.dateBasis === preferred || !dataset.has(preferred)) return null;
  return (
    <Banner tone="warn">
      The date filter is applied to <b>{filters.dateBasis}</b>.{' '}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters((f) => ({ ...f, dateBasis: preferred }))}>
        Use {preferred} instead
      </button>
    </Banner>
  );
}

const col = (name: string) => dashboardConfig.dateBasisColumns.find((c) => c === name) ?? name;

export function UploadPage() {
  return (
    <>
      <DateBasisHint preferred={col('Upload date')} />
      <UploadDetail />
    </>
  );
}

export function QcPage() {
  return (
    <>
      <DateBasisHint preferred={col('QC approved date')} />
      <QcDetail />
    </>
  );
}

export function VisualPage() {
  return (
    <>
      <DateBasisHint preferred={col('Image Delivered Date')} />
      <VisualDetail />
    </>
  );
}
