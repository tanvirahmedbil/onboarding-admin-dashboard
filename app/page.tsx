"use client";

import { collection, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { firebaseConfigured, getDashboardFirestore } from "../lib/firebase";
import { calculateMetrics, deliveryState, isCompleted, isInMonth, isOverdue, mapProject, shortDate, toolLabel, type DashboardProject, type ToolType } from "../lib/reporting";

type Filter = "all" | ToolType;
type OverviewIconType = "active" | "overdue" | "completed" | "rate";

const currentMonth = new Date();
const lastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
const missingFirebaseMessage = "Firebase configuration is missing. Add the six NEXT_PUBLIC_FIREBASE_* variables in Netlify, then deploy again.";

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function WorkspaceIcon({ tool }: { tool: ToolType }) {
  if (tool === "dm") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13.5V10a2 2 0 0 1 2-2h2.1l7.4-3.2A1.5 1.5 0 0 1 17.6 6v9.5a1.5 1.5 0 0 1-2.1 1.4L8.1 13.7H6a2 2 0 0 1-2-2Z"/><path d="M8 13.7 9.3 19h2.8l-1.6-4.3"/><path d="M20 8.5v4"/></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/><path d="M8.2 10.7 10 12.5l3-3.3"/></svg>;
}

function OverviewIcon({ type }: { type: OverviewIconType }) {
  if (type === "active") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16v11H4z"/><path d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5"/><path d="M4 11h16"/><path d="M10 11v2h4v-2"/></svg>;
  if (type === "overdue") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/></svg>;
  if (type === "completed") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.2 2.3 4.8-5"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18.5V14"/><path d="M10 18.5V10"/><path d="M15 18.5V6"/><path d="M20 18.5V3.5"/></svg>;
}

function OverviewCard({ type, label, value, note, tone }: { type: OverviewIconType; label: string; value: string | number; note: string; tone: string }) {
  return <article className={`overview-card ${tone}`}>
    <div className="overview-card-top"><span className="overview-icon"><OverviewIcon type={type} /></span><span className="overview-label">{label}</span></div>
    <strong className="overview-value">{value}</strong>
    <p>{note}</p>
  </article>;
}

function ToolCard({ tool, projects }: { tool: ToolType; projects: DashboardProject[] }) {
  const metrics = calculateMetrics(projects);
  const url = tool === "dm" ? process.env.NEXT_PUBLIC_DM_TOOL_URL : process.env.NEXT_PUBLIC_SEO_TOOL_URL;
  const isDm = tool === "dm";

  return <article className={`tool-card tool-card-${tool}`}>
    <div className="tool-card-accent" />
    <div className="card-heading">
      <div className="tool-card-title-wrap">
        <div className={`tool-icon ${tool}`}><WorkspaceIcon tool={tool} /></div>
        <div>
          <p className="eyebrow">{isDm ? "DM WORKSPACE" : "SEO WORKSPACE"}</p>
          <h3 className="tool-title">{toolLabel[tool]}</h3>
          <p className="tool-card-subtitle">{isDm ? "Track onboarding progress, workload, and delivery pace." : "Monitor SEO onboarding status, handoffs, and completion health."}</p>
        </div>
      </div>
      <span className={`workspace-live ${tool}`}><i /> Live</span>
    </div>
    <div className="tool-stats enhanced">
      <div className="stat-box"><span>Active</span><strong>{metrics.active}</strong></div>
      <div className="stat-box"><span>Overdue</span><strong>{metrics.overdue}</strong></div>
      <div className="stat-box"><span>On time</span><strong>{metrics.onTimeRate === null ? "-" : `${metrics.onTimeRate}%`}</strong></div>
    </div>
    {url ? <a className="open-tool" href={url} target="_blank" rel="noreferrer"><span>Open {toolLabel[tool]} tracker</span><span className="open-tool-arrow">↗</span></a> : <p className="missing-link">Add {tool === "dm" ? "NEXT_PUBLIC_DM_TOOL_URL" : "NEXT_PUBLIC_SEO_TOOL_URL"} to enable direct access.</p>}
  </article>;
}

function EmptyAttention() {
  return <div className="empty-state attention-empty">
    <span className="empty-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.2 2.3 4.8-5"/></svg></span>
    <div><strong>Everything is on track</strong><p>No active projects are overdue across either workspace.</p></div>
  </div>;
}

function deliveryLabel(project: DashboardProject) {
  const state = deliveryState(project);
  if (state === "timely") return "Timely";
  if (state === "delayed") return "Delayed";
  if (!project.completedAt) return "Missing completion date";
  return "Unclassified";
}

export default function Dashboard() {
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState<string | null>(firebaseConfigured ? null : missingFirebaseMessage);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!firebaseConfigured) return;

    let dm: DashboardProject[] = [];
    let seo: DashboardProject[] = [];
    let dmReady = false;
    let seoReady = false;
    let cancelled = false;

    const publish = () => {
      if (cancelled || !dmReady || !seoReady) return;
      setProjects([...dm, ...seo]);
      setLoading(false);
    };

    let unsubs: Unsubscribe[] = [];
    try {
      const db = getDashboardFirestore();
      unsubs = [
        onSnapshot(collection(db, "dmProjects"), (snapshot) => {
          dm = snapshot.docs.map((entry) => mapProject(entry.id, "dm", entry.data()));
          dmReady = true;
          publish();
        }, (reason) => {
          if (!cancelled) {
            setError(`Digital Marketing data could not load: ${reason.message}`);
            setLoading(false);
          }
        }),
        onSnapshot(collection(db, "projects"), (snapshot) => {
          seo = snapshot.docs.map((entry) => mapProject(entry.id, "seo", entry.data()));
          seoReady = true;
          publish();
        }, (reason) => {
          if (!cancelled) {
            setError(`SEO data could not load: ${reason.message}`);
            setLoading(false);
          }
        }),
      ];
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to connect to Firestore.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [retryKey]);

  const retryConnection = () => {
    if (!firebaseConfigured) return;
    setLoading(true);
    setError(null);
    setRetryKey((value) => value + 1);
  };

  const dmProjects = useMemo(() => projects.filter((project) => project.tool === "dm"), [projects]);
  const seoProjects = useMemo(() => projects.filter((project) => project.tool === "seo"), [projects]);
  const overallMetrics = useMemo(() => calculateMetrics(projects), [projects]);
  const completedThisMonth = useMemo(() => projects.filter((project) => isCompleted(project) && isInMonth(project.completedAt, currentMonth)), [projects]);
  const completedLastMonth = useMemo(() => projects.filter((project) => isCompleted(project) && isInMonth(project.completedAt, lastMonth)), [projects]);
  const thisMetrics = useMemo(() => calculateMetrics(completedThisMonth), [completedThisMonth]);
  const lastMetrics = useMemo(() => calculateMetrics(completedLastMonth), [completedLastMonth]);
  const attention = useMemo(() => projects.filter((project) => isOverdue(project)).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")), [projects]);
  const deliveries = useMemo(() => projects.filter((project) => isCompleted(project)).filter((project) => filter === "all" || project.tool === filter).filter((project) => project.clientName.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")), [projects, filter, query]);
  const monthLabel = currentMonth.toLocaleString("en", { month: "long", year: "numeric" });

  return <main className="dashboard-shell">
    <header className="dashboard-header">
      <div className="header-copy"><p className="eyebrow">OPERATIONS OVERVIEW</p><h1>Onboarding SOP - Admin View</h1><p className="subhead">A live management view of onboarding workload, delivery health, and completed projects across Digital Marketing and SEO.</p></div>
      <div className="live"><span className="live-dot" /><div><strong>{loading ? "Connecting" : "Live data"}</strong><small>Realtime sync</small></div></div>
    </header>

    {error ? <section className="error"><strong>Dashboard connection needs attention</strong><p>{error}</p>{firebaseConfigured && <button onClick={retryConnection}>Retry connection</button>}</section> : <>
      <section className="overview-grid" aria-label="Dashboard overview">
        <OverviewCard type="active" label="Active onboarding" value={overallMetrics.active} note="Across both workspaces" tone="blue" />
        <OverviewCard type="overdue" label="Overdue" value={overallMetrics.overdue} note={overallMetrics.overdue ? "Requires attention" : "No overdue projects"} tone={overallMetrics.overdue ? "red" : "green"} />
        <OverviewCard type="completed" label="Completed this month" value={thisMetrics.completed} note={monthLabel} tone="purple" />
        <OverviewCard type="rate" label="This month on-time" value={thisMetrics.onTimeRate === null ? "-" : `${thisMetrics.onTimeRate}%`} note="Classified deliveries" tone="slate" />
      </section>

      <section className="workspace-block">
        <div className="block-heading"><div><p className="eyebrow">WORKSPACE HEALTH</p><h2>Onboarding workspaces</h2></div><p>Open either tracker to manage project tasks and delivery progress.</p></div>
        <div className="tool-grid"><ToolCard tool="dm" projects={dmProjects} /><ToolCard tool="seo" projects={seoProjects} /></div>
      </section>

      <section className="section performance-section">
        <div className="section-heading"><div><p className="eyebrow">DELIVERY PERFORMANCE</p><h2>Monthly completion health</h2></div><p>Timeliness is calculated against the 15-day onboarding milestone.</p></div>
        <div className="period-grid">
          <div className="period current-period"><div className="period-label"><div><span className="period-kicker">CURRENT PERIOD</span><h3>This month</h3></div><span>{monthLabel}</span></div><div className="metrics"><Metric label="Completed" value={thisMetrics.completed} /><Metric label="Timely" value={thisMetrics.timely} /><Metric label="Delayed" value={thisMetrics.delayed} /><Metric label="On-time rate" value={thisMetrics.onTimeRate === null ? "-" : `${thisMetrics.onTimeRate}%`} /></div></div>
          <div className="period previous-period"><div className="period-label"><div><span className="period-kicker">COMPARISON</span><h3>Last month</h3></div><span>{lastMonth.toLocaleString("en", { month: "long", year: "numeric" })}</span></div><div className="metrics"><Metric label="Completed" value={lastMetrics.completed} /><Metric label="Timely" value={lastMetrics.timely} /><Metric label="Delayed" value={lastMetrics.delayed} /><Metric label="On-time rate" value={lastMetrics.onTimeRate === null ? "-" : `${lastMetrics.onTimeRate}%`} /></div></div>
        </div>
      </section>

      <section className={`section attention-section ${attention.length ? "has-attention" : ""}`}>
        <div className="section-heading"><div><p className="eyebrow">ATTENTION QUEUE</p><h2>Active overdue projects</h2></div><span className={attention.length ? "count danger" : "count"}>{attention.length} project{attention.length === 1 ? "" : "s"}</span></div>
        {attention.length ? <div className="attention-list">{attention.map((project) => <div className="attention-item" key={`${project.tool}-${project.id}`}><span className={`tag ${project.tool}`}>{toolLabel[project.tool]}</span><strong>{project.clientName}</strong><span>Due {shortDate(project.dueDate)}</span><span>{project.owner ?? "No owner"}</span></div>)}</div> : <EmptyAttention />}
      </section>

      <section className="section delivery-section">
        <div className="delivery-heading"><div><p className="eyebrow">DELIVERY LOG</p><h2>Completed deliveries</h2><p className="section-description">Review delivered projects across both onboarding workspaces.</p></div><div className="controls"><label className="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/></svg><input aria-label="Search completed deliveries" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client" /></label><div className="filters">{(["all", "dm", "seo"] as Filter[]).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : toolLabel[value]}</button>)}</div></div></div>
        <div className="table-wrap"><table><thead><tr><th>Client</th><th>Workspace</th><th>Completed</th><th>Due date</th><th>Delivery</th><th>Owner</th></tr></thead><tbody>{deliveries.map((project) => <tr key={`${project.tool}-${project.id}`}><td><strong>{project.clientName}</strong></td><td><span className={`tag ${project.tool}`}>{toolLabel[project.tool]}</span></td><td>{shortDate(project.completedAt)}</td><td>{shortDate(project.dueDate)}</td><td><span className={`status ${deliveryState(project)}`}>{deliveryLabel(project)}</span></td><td>{project.owner ?? "-"}</td></tr>)}{!deliveries.length && <tr><td colSpan={6}><div className="table-empty"><strong>No completed projects found</strong><span>Completed deliveries will appear here automatically.</span></div></td></tr>}</tbody></table></div>
      </section>
    </>}

    <footer><span className="footer-dot" /> Read-only admin view. Data refreshes automatically when either tracker updates.</footer>
  </main>;
}
