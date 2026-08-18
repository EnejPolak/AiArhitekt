export const PROJECT_NAME_MAX = 120;
export const PROJECT_FLOW_VERSION = 1;
export const DEFAULT_STEP_KEY = "greeting";

/** MVP creatable type. Whole-home / new-build are inactive until a later phase. */
export const MVP_PROJECT_TYPE = "room-renovation" as const;

export const CREATABLE_PROJECT_TYPES = [MVP_PROJECT_TYPE] as const;

/** Stored values the DB CHECK still allows. Used only to read historical rows. */
export const KNOWN_PROJECT_TYPES = [
  "room-renovation",
  "home-renovation",
  "new-construction",
] as const;

export type CreatableProjectType = (typeof CREATABLE_PROJECT_TYPES)[number];
export type ProjectType = (typeof KNOWN_PROJECT_TYPES)[number];

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  project_type: ProjectType;
  current_step_key: string;
  flow_version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  "room-renovation": "Room renovation",
  "home-renovation": "Home renovation",
  "new-construction": "New construction",
};

export const DEFAULT_PROJECT_NAMES: Record<ProjectType, string> = {
  ...PROJECT_TYPE_LABELS,
};

export function isProjectType(value: string): value is ProjectType {
  return (KNOWN_PROJECT_TYPES as readonly string[]).includes(value);
}

export function isCreatableProjectType(
  value: string
): value is CreatableProjectType {
  return value === MVP_PROJECT_TYPE;
}

export function isProjectArchived(
  project: Pick<ProjectRow, "archived_at">
): boolean {
  return project.archived_at != null;
}
