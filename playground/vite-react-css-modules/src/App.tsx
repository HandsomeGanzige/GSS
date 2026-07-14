import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Shell, type RouteLink } from './components/Shell';
import styles from './App.module.css';

type RouteId = 'overview' | 'modules' | 'diagnostics' | 'build' | 'settings';

const OverviewRoute = lazy(() => import('./routes/OverviewRoute').then((module) => ({ default: module.OverviewRoute })));
const ModulesRoute = lazy(() => import('./routes/ModulesRoute').then((module) => ({ default: module.ModulesRoute })));
const DiagnosticsRoute = lazy(() =>
  import('./routes/DiagnosticsRoute').then((module) => ({ default: module.DiagnosticsRoute }))
);
const BuildRoute = lazy(() => import('./routes/BuildRoute').then((module) => ({ default: module.BuildRoute })));
const SettingsRoute = lazy(() => import('./routes/SettingsRoute').then((module) => ({ default: module.SettingsRoute })));

const routes: RouteLink<RouteId>[] = [
  { id: 'overview', label: 'Overview', description: '跨模块概览' },
  { id: 'modules', label: 'Modules', description: '文件与组件矩阵' },
  { id: 'diagnostics', label: 'Diagnostics', description: '选择器安全性' },
  { id: 'build', label: 'Build', description: '产物与 tokens' },
  { id: 'settings', label: 'Settings', description: '运行门禁设置' }
];

/** 渲染多路由 playground，使用 hash route 避免引入额外依赖。 */
export function App() {
  const [activeRoute, setActiveRoute] = useState<RouteId>(() => readHashRoute());
  const activeMeta = useMemo(() => routes.find((route) => route.id === activeRoute) ?? routes[0], [activeRoute]);

  useEffect(() => {
    const handleHashChange = () => setActiveRoute(readHashRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <Shell routes={routes} activeRoute={activeRoute} activeDescription={activeMeta.description}>
      <Suspense
        fallback={
          <div className={styles.routePending} data-pilot-case="route-pending" role="status">
            正在加载运行视图…
          </div>
        }
      >
        {renderRoute(activeRoute)}
      </Suspense>
    </Shell>
  );
}

/** 根据当前路由渲染对应业务视图。 */
function renderRoute(route: RouteId) {
  switch (route) {
    case 'modules':
      return <ModulesRoute />;
    case 'diagnostics':
      return <DiagnosticsRoute />;
    case 'build':
      return <BuildRoute />;
    case 'settings':
      return <SettingsRoute />;
    case 'overview':
    default:
      return <OverviewRoute />;
  }
}

/** 从 location.hash 中读取当前 route，并对未知 route 回退到 overview。 */
function readHashRoute(): RouteId {
  if (typeof window === 'undefined') {
    return 'overview';
  }

  const route = window.location.hash.replace(/^#\/?/, '');
  return isRouteId(route) ? route : 'overview';
}

/** 判断字符串是否是 playground 支持的 route id。 */
function isRouteId(value: string): value is RouteId {
  return routes.some((route) => route.id === value);
}
