"use client";

import { collection, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { firebaseConfigured, getDashboardFirestore } from "../lib/firebase";
import { calculateMetrics, deliveryState, isCompleted, isInMonth, isOverdue, mapProject, shortDate, toolLabel, type DashboardProject, type ToolType } from "../lib/reporting";

type Filter = "all" | ToolType;
const currentMonth = new Date();
const lastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function WorkspaceIcon({ tool }: { tool: ToolType }) {
  if (tool === "dm") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13.5V10a2 2 0 0 1 2-2h2.1l7.4-3.2A1.5 1.5 0 0 1 17.6 6v9.5a1.5 1.5 0 0 1-2.1 1.4L8.1 13.7H6a2 2 0 0 1-2-2Z"/><path d="M8 13.7 9.3 19h2.8l-1.6-4.3"/><path d="M20 8.5v4"/></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/><path d="M8.2 10.7 10 12.5l3-3.3"/></svg>;
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
          <h2>{toolLabel[tool]}</h2>
          <p className="tool-card-subtitle">{isDm ? "Track onboarding progress, workload, and delivery pace." : "Monitor SEO onboarding status, handoffs, and completion health."}</p>
        </div>
      </div>
      <span className={`dot ${tool}`} />
    </div>
    <div className="tool-stats enhanced">
      <div className="stat-box"><strong>{metrics.active}</strong><span>Active</span></div>
      <div className="stat-box"><strong>{metrics.overdue}</strong><span>Overdue</span></div>
      <div className="stat-box"><strong>{metrics.onTimeRate === null ? "-" : `${metrics.onTimeRate}%`}</strong><span>On time</span></div>
    </div>
    {url ? <a className="open-tool" href={url} target="_blank" rel="noreferrer"><span>Open {toolLabel[tool]} tracker</span><span className="open-tool-arrow">↗</span></a> : <p className="missing-link">Add {tool === "dm" ? "NEXT_PUBLIC_DM_TOOL_URL" : "NEXT_PUBLIC_SEO_TOOL_URL"} to enable direct access.</p>}
  </article>;
}

export default function Dashboard() {
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const subscribe = useCallback(() => {
    if (!firebaseConfigured) { setError("Firebase configuration is missing. Add the six NEXT_PUBLIC_FIREBASE_* variables in Netlify, then deploy again."); setLoading(false); return () => {}; }
    setLoading(true); setError(null);
    let dm: DashboardProject[] = []; let seo: DashboardProject[] = [];
    const update = () => { setProjects([...dm, ...seo]); setLoading(false); };
    try {
      const db = getDashboardFirestore();
      const unsubs: Unsubscribe[] = [
        onSnapshot(collection(db, "dmProjects"), (snapshot) => { dm = snapshot.docs.map((doc) => mapProject(doc.id, "dm", doc.data())); update(); }, (reason) => { setError(`Digital Marketing data could not load: ${reason.message}`); setLoading(false); }),
        onSnapshot(collection(db, "projects"), (snapshot) => { seo = snapshot.docs.map((doc) => mapProject(doc.id, "seo", doc.data())); update(); }, (reason) => { setError(`SEO data could not load: ${reason.message}`); setLoading(false); }),
      ];
      return () => unsubs.forEach((unsubscribe) => unsubscribe());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to connect to Firestore."); setLoading(false); return () => {}; }
  }, []);

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) cleanup = subscribe();
    });
    return () => { cancelled = true; cleanup(); };
  }, [subscribe]);

  const dmProjects = useMemo(() => projects.filter((project) => project.tool === "dm"), [projects]);
  const seoProjects = useMemo(() => projects.filter((project) => project.tool === "seo"), [projects]);
  const completedThisMonth = useMemo(() => projects.filter((project) => isCompleted(project) && isInMonth(project.completedAt, currentMonth)), [projects]);
  const completedLastMonth = useMemo(() => projects.filter((project) => isCompleted(project) && isInMonth(project.completedAt, lastMonth)), [projects]);
  const thisMetrics = useMemo(() => calculateMetrics(completedThisMonth), [completedThisMonth]);
  const lastMetrics = useMemo(() => calculateMetrics(completedLastMonth), [completedLastMonth]);
  const attention = useMemo(() => projects.filter((project) => isOverdue(project)).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")), [projects]);
  const deliveries = useMemo(() => projects.filter((project) => isCompleted(project)).filter((project) => filter === "all" || project.tool === filter).filter((project) => project.clientName.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")), [projects, filter, query]);

  return <main>
    <header><div><p className="eyebrow">OPERATIONS OVERVIEW</p><h1>Onboarding SOP - Admin View</h1><p className="subhead">Live delivery reporting across the two independent onboarding workspaces.</p></div><div className="live"><span /> {loading ? "Connecting" : "Live data"}</div></header>
    {error ? <section className="error"><strong>Dashboard connection needs attention</strong><p>{error}</p><button onClick={subscribe}>Retry connection</button></section> : <>
      <section className="tool-grid"><ToolCard tool="dm" projects={dmProjects} /><ToolCard tool="seo" projects={seoProjects} /></section>
      <section className="section"><div className="section-heading"><div><p className="eyebrow">DELIVERY PERFORMANCE</p><h2>Completed projects</h2></div><p>Performance is calculated from completion date versus due date.</p></div>
        <div className="period-grid"><div className="period"><div className="period-label"><h3>This month</h3><span>{currentMonth.toLocaleString("en", { month: "long", year: "numeric" })}</span></div><div className="metrics"><Metric label="Completed" value={thisMetrics.completed} /><Metric label="Timely" value={thisMetrics.timely} /><Metric label="Delayed" value={thisMetrics.delayed} /><Metric label="On-time rate" value={thisMetrics.onTimeRate === null ? "-" : `${thisMetrics.onTimeRate}%`} /></div></div>
          <div className="period muted"><div className="period-label"><h3>Last month</h3><span>{lastMonth.toLocaleString("en", { month: "long", year: "numeric" })}</span></div><div className="metrics"><Metric label="Completed" value={lastMetrics.completed} /><Metric label="Timely" value={lastMetrics.timely} /><Metric label="Delayed" value={lastMetrics.delayed} /><Metric label="On-time rate" value={lastMetrics.onTimeRate === null ? "-" : `${lastMetrics.onTimeRate}%`} /></div></div></div>
      </section>
      <section className="section"><div className="section-heading"><div><p className="eyebrow">ATTENTION QUEUE</p><h2>Active overdue projects</h2></div><span className={attention.length ? "count danger" : "count"}>{attention.length} project{attention.length === 1 ? "" : "s"}</span></div>
        {attention.length ? <div className="attention-list">{attention.map((project) => <div className="attention-item" key={`${project.tool}-${project.id}`}><span className={`tag ${project.tool}`}>{toolLabel[project.tool]}</span><strong>{project.clientName}</strong><span>Due {shortDate(project.dueDate)}</span><span>{project.owner ?? "No owner"}</span></div>)}</div> : <p className="empty">No active projects are overdue.</p>}
      </section>
      <section className="section"><div className="section-heading"><div><p className="eyebrow">DELIVERY LOG</p><h2>Completed deliveries</h2></div><div className="controls"><input aria-label="Search completed deliveries" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client" /><div className="filters">{(["all", "dm", "seo"] as Filter[]).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : toolLabel[value]}</button>)}</div></div></div>
        <div className="table-wrap"><table><thead><tr><th>Client</th><th>Workspace</th><th>Completed</th><th>Due date</th><th>Delivery</th><th>Owner</th></tr></thead><tbody>{deliveries.map((project) => <tr key={`${project.tool}-${project.id}`}><td><strong>{project.clientName}</strong></td><td><span className={`tag ${project.tool}`}>{toolLabel[project.tool]}</span></td><td>{shortDate(project.completedAt)}</td><td>{shortDate(project.dueDate)}</td><td><span className={`status ${deliveryState(project)}`}>{deliveryState(project) === "timely" ? "Timely" : deliveryState(project) === "delayed" ? "Delayed" : "No due date"}</span></td><td>{project.owner ?? "-"}</td></tr>)}{!deliveries.length && <tr><td colSpan={6} className="empty">No completed projects match this view.</td></tr>}</tbody></table></div>
      </section>
    </>}
    <footer>Read-only view. Data refreshes automatically when either tracker updates.</footer>
  </main>;
}
