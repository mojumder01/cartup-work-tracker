import { useApp } from '../hooks/AppContext';
import { KpiCards } from '../components/sections/KpiCards';
import { TargetVsAchievementCard } from '../components/sections/KpiSections';
import { MonthlyTrendCard, TaskTypeCard, WorkStatusCard } from '../components/sections/WorkSections';
import { AiManualCard, QcSummaryCard, UploadSummaryCard, VisualSummaryCard } from '../components/sections/PerformanceSections';
import { TeamLeaderboard } from '../components/sections/TeamLeaderboard';
import { WorkTable } from '../components/WorkTable';
import { Card, SectionTitle } from '../components/ui';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function DashboardPage() {
  const { dataset, searched, navigate } = useApp();
  return (
    <>
      <ErrorBoundary title="KPI cards could not be displayed">
        <KpiCards />
      </ErrorBoundary>

      <div className="grid grid-2">
        <ErrorBoundary>
          <TargetVsAchievementCard />
        </ErrorBoundary>
        <ErrorBoundary>
          <WorkStatusCard />
        </ErrorBoundary>
        <ErrorBoundary>
          <TaskTypeCard />
        </ErrorBoundary>
        <ErrorBoundary>
          <MonthlyTrendCard />
        </ErrorBoundary>
      </div>

      <SectionTitle title="Performance" subtitle="Upload, QC and visual work in the current filters" />
      <div className="grid grid-2">
        <ErrorBoundary>
          <UploadSummaryCard compact />
        </ErrorBoundary>
        <ErrorBoundary>
          <QcSummaryCard compact />
        </ErrorBoundary>
        <ErrorBoundary>
          <VisualSummaryCard compact />
        </ErrorBoundary>
        <ErrorBoundary>
          <AiManualCard />
        </ErrorBoundary>
      </div>

      <ErrorBoundary>
        <TeamLeaderboard limit={8} />
      </ErrorBoundary>

      <SectionTitle title="Work records" subtitle="Filtered Work Sheet rows, newest first" action={{ label: 'Open Work Sheet', onClick: () => navigate('work') }} />
      <Card bodyClassName="">
        <ErrorBoundary>
          <WorkTable dataset={dataset} records={searched} />
        </ErrorBoundary>
      </Card>
    </>
  );
}
