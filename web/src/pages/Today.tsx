// Home (route `/`): what to act on now, in one calm column. Order and rules: docs/SIMPLIFY.md §4.
// Needs you → Today (your picks + Claude's proposals) → Working → Pick up → a footer of things to review elsewhere.
// Stats, feeds and history live on History / Portfolio, not here.
import { useOverview } from '../api';
import { liveState } from '../components/cards';
import { Button, Card, EmptyState, LoadingCard, PageHeader, Skeleton } from '../components/ui';
import { CatchingUp, HomeUndoToast, sortLive } from '../components/today/TodayBits';
import { HomeFooter, HomeHeader, NeedsYou, PhoneSetup, PickUp, TodayPlan, Working, homeTitle, useUserName } from '../components/today/HomeSections';
import { TaskUndoToast } from '../components/tasks/TaskBits';
import { friendly, useMedia, useTick } from '../components/tasks/model';
import './Today.css';

export default function Today() {
  useTick();
  const { data: o, error, isLoading, refetch } = useOverview();
  const phone = useMedia();
  const name = useUserName();

  if (isLoading)
    return (
      <div className="home" aria-busy="true">
        <PageHeader className="home-head" title={homeTitle(name)} subtitle={<Skeleton h={14} w="70%" />} />
        <LoadingCard lines={2} />
        <LoadingCard lines={3} />
        <LoadingCard lines={2} />
      </div>
    );
  if (error || !o)
    return (
      <div className="home">
        <PageHeader className="home-head" title={homeTitle(name)} />
        <Card>
          <EmptyState
            title="Home didn’t load"
            body={friendly(error)}
            action={
              <Button size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      </div>
    );

  const live = sortLive(o.live.filter((s) => s.live));
  const needs = live.filter((s) => liveState(s) === 'needs-you');
  const working = live.filter((s) => liveState(s) === 'working');
  const idle = live.filter((s) => liveState(s) === 'idle_live');

  return (
    <div className="home">
      <HomeHeader o={o} />
      <CatchingUp o={o} />
      {!phone && <PhoneSetup />}
      <NeedsYou list={needs} />
      <TodayPlan o={o} phone={phone} />
      <Working working={working} idle={idle} />
      <PickUp items={o.pickup || []} phone={phone} />
      <HomeFooter o={o} />
      <TaskUndoToast />
      <HomeUndoToast />
    </div>
  );
}
