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
export const ONBOARDING_MILESTONE_DAYS = 15;

function dateFrom(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function parseDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

function milestoneDueDate(startDate: string | null): string | null {
  if (!startDate) return null;
  const start = parseDate(startDate);
  if (Number.isNaN(start.getTime())) return null;
  const due = new Date(start);
  due.setDate(due.getDate() + ONBOARDING_MILESTONE_DAYS - 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    const year = due.getFullYear();
    const month = String(due.getMonth() + 1).padStart(2, "0");
    const day = String(due.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return due.toISOString();
}

function ownerFrom(raw: Record<string, unknown>): string | null {
  if (Array.isArray(raw.assignedMembers)) {
    const members = raw.assignedMembers.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (members.length) return members.join(", ");
  }
  if (typeof raw.assignedTeam === "string" && raw.assignedTeam.trim()) return raw.assignedTeam;
  if (typeof raw.owner === "string" && raw.owner.trim()) return raw.owner;
  return null;
}

export function mapProject(id: string, tool: ToolType, raw: Record<string, unknown>): DashboardProject {
  const startDate = dateFrom(raw.startDate ?? raw.createdAt);
  const explicitDueDate = dateFrom(raw.dueDate ?? raw.deliveryDate ?? raw.targetDate);
  return {
    id,
    tool,
    clientName: String(raw.clientName ?? raw.client ?? raw.name ?? "Untitled project"),
    status: String(raw.status ?? "active").toLowerCase(),
    startDate,
    dueDate: explicitDueDate ?? milestoneDueDate(startDate),
    completedAt: dateFrom(raw.completedAt ?? raw.completionDate ?? raw.deliveredAt),
    owner: ownerFrom(raw),
    updatedAt: dateFrom(raw.updatedAt ?? raw.createdAt),
  };
}

export function isCompleted(project: DashboardProject) {
  if (project.status === "completed") return true;
  return project.status === "archived" && Boolean(project.completedAt);
}

export function deliveryState(project: DashboardProject): DeliveryState {
  if (!isCompleted(project) || !project.completedAt || !project.dueDate) return "unclassified";
  const completed = parseDate(project.completedAt);
  const due = endOfDay(project.dueDate);
  if (Number.isNaN(completed.getTime()) || Number.isNaN(due.getTime())) return "unclassified";
  return completed.getTime() <= due.getTime() ? "timely" : "delayed";
}

function endOfDay(value: string) {
  const date = parseDate(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function isInMonth(value: string | null, month: Date) {
  if (!value) return false;
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

export function isOverdue(project: DashboardProject, now = new Date()) {
  if (project.status === "archived" || isCompleted(project) || !project.dueDate) return false;
  const due = endOfDay(project.dueDate);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
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
    active: projects.filter((project) => project.status !== "archived" && !isCompleted(project)).length,
    overdue: projects.filter((project) => isOverdue(project)).length,
    onTimeRate: classified ? Math.round((timely / classified) * 100) : null,
  };
}

export function shortDate(value: string | null) {
  if (!value) return "Not set";
  const date = parseDate(value);
  return Number.isNaN(date.getTime()) ? "Not set" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
