import type { Principal } from "./auth.js";

// Shared by list and report/drill-down. Technical admin has no implicit access.
export const caseScopeSql = `((pack_id='g02' AND 'environment_officer'=ANY($2::text[]) AND (coordinator_id=$1 OR technician_id=$1)) OR (pack_id='g01' AND (('reporter'=ANY($2::text[]) AND reporter_id=$1) OR
 ('coordinator'=ANY($2::text[]) AND coordinator_id=$1) OR ('approver'=ANY($2::text[]) AND approver_id=$1) OR
 ('technician'=ANY($2::text[]) AND (technician_id=$1 OR
 (status='assigned' AND technician_id IS NULL AND team_id=ANY($3::text[])))))))`;

export const steps = {
  verification: "verify",
  supplement: "supplement",
  assignment: "assign",
  assigned: "receive",
  in_progress: "repair",
  acceptance: "approve",
  closed: null,
} as const;
export type CaseStatus = keyof typeof steps;
export type CaseAccess = {
  pack_id?: string;
  reporter_id: string;
  coordinator_id: string;
  technician_id: string | null;
  approver_id: string | null;
  team_id: string | null;
  status: CaseStatus;
  sync_status: string;
};
const role = (user: Principal, name: string) =>
  user.roles.some((r) => r === name);
export function canReadCase(user: Principal, row: CaseAccess, teams: string[]) {
  if (row.pack_id === "g02")
    return (
      role(user, "environment_officer") &&
      (row.coordinator_id === user.id || row.technician_id === user.id)
    );
  return (
    (role(user, "reporter") && row.reporter_id === user.id) ||
    (role(user, "coordinator") && row.coordinator_id === user.id) ||
    (role(user, "technician") &&
      (row.technician_id === user.id ||
        (row.status === "assigned" &&
          !row.technician_id &&
          !!row.team_id &&
          teams.includes(row.team_id)))) ||
    (role(user, "approver") && row.approver_id === user.id)
  );
}
export function caseActions(user: Principal, row: CaseAccess, teams: string[]) {
  if (row.sync_status !== "ready" || !canReadCase(user, row, teams)) return [];
  if (row.pack_id === "g02")
    return row.status === "verification"
      ? ["confirm", "dismiss"]
      : row.status === "in_progress"
        ? ["save_work", "resolve"]
        : [];
  if (
    row.status === "verification" &&
    row.coordinator_id === user.id &&
    role(user, "coordinator")
  )
    return ["accept", "return_info"];
  if (
    row.status === "supplement" &&
    row.reporter_id === user.id &&
    role(user, "reporter")
  )
    return ["resubmit"];
  if (
    row.status === "assignment" &&
    row.coordinator_id === user.id &&
    role(user, "coordinator")
  )
    return ["assign"];
  if (
    row.status === "assigned" &&
    row.approver_id !== user.id &&
    role(user, "technician") &&
    (row.technician_id === user.id ||
      (!row.technician_id && !!row.team_id && teams.includes(row.team_id)))
  )
    return ["receive"];
  if (
    row.status === "in_progress" &&
    row.technician_id === user.id &&
    role(user, "technician")
  )
    return ["save_work", "submit"];
  if (
    row.status === "acceptance" &&
    row.approver_id === user.id &&
    row.technician_id !== user.id &&
    role(user, "approver")
  )
    return ["approve", "return_work"];
  return [];
}
