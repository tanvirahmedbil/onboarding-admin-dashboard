export type ToolType = "dm" | "seo";
export type DeliveryState = "timely" | "delayed" | "unclassified";

export interface DashboardProject {
  id: string;
  tool: ToolType;
  clientName: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  owner: string | null;
  updatedAt: string | null;
}

export interface ProjectMetrics {
  completed: number;
  timely: number;
  delayed: number;
  active: number;
  overdue: number;
  onTimeRate: number | null;
}

export const toolLabel: Record<ToolType, string> = { dm: "Digital Marketing", seo: "SEO" };

function dateFrom(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

export function mapProject(id: string, tool: ToolType, raw: Record<string, unknown>): DashboardProject {
  return {
    id,
    tool,
    clientName: String(raw.clientName ?? raw.client ?? raw.name ?? "Untitled project"),
    status: String(raw.status ?? "active").toLowerCase(),
    startDate: dateFrom(raw.startDate ?? raw.createdAt),
    dueDate: dateFrom(raw.dueDate ?? raw.deliveryDate ?? raw.targetDate),
    completedAt: dateFrom(raw.completedAt ?? raw.completionDate ?? raw.deliveredAt),
    owner: typeof raw.assignedTeam === "string" ? raw.assignedTeam : typeof raw.owner === "string" ? raw.owner : null,
    updatedAt: dateFrom(raw.updatedAt ?? raw.createdAt),
  };
}

export function isCompleted(project: DashboardProject) {
  return project.status === "completed" || Boolean(project.completedAt);
}

export function deliveryState(project: DashboardProject): DeliveryState {
  if (!isCompleted(project) || !project.completedAt || !project.dueDate) return "unclassified";
  return new Date(project.completedAt).getTime() <= endOfDay(project.dueDate).getTime() ? "timely" : "delayed";
}

function endOfDay(value: string) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function isInMonth(value: string | null, month: Date) {
  if (!value) return false;
  const date = new Date(value);
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

export function isOverdue(project: DashboardProject, now = new Date()) {
  return !isCompleted(project) && Boolean(project.dueDate) && endOfDay(project.dueDate as string).getTime() < now.getTime();
}

export function calculateMetrics(projects: DashboardProject[]): ProjectMetrics {
  const completed = projects.filter(isCompleted);
  const timely = completed.filter((project) => deliveryState(project) === "timely").length;
  const delayed = completed.filter((project) => deliveryState(project) === "delayed").length;
  const classified = timely + delayed;
  return {
    completed: completed.length,
    timely,
    delayed,
    active: projects.filter((project) => !isCompleted(project) && project.status !== "archived").length,
    overdue: projects.filter((project) => isOverdue(project)).length,
    onTimeRate: classified ? Math.round((timely / classified) * 100) : null,
  };
}

export function shortDate(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
