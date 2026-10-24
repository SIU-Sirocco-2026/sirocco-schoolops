import type pg from "pg";
import type { Flowable, EngineTask } from "./workflow.js";
import { steps } from "./g01-policy.js";

type Command = {
  id: string;
  case_id: string;
  actor_id: string;
  action: string;
  from_status: string;
  target: Record<string, any>;
  variables: Record<string, string | boolean>;
  details: Record<string, unknown>;
  old_task_id: string | null;
  expected_revision: number;
  attempts: number;
};

function expectedAssignee(row: Record<string, any>) {
  return row.status === "supplement"
    ? row.reporter_id
    : ["verification", "assignment"].includes(row.status)
      ? row.coordinator_id
      : ["assigned", "in_progress"].includes(row.status)
        ? row.technician_id
        : row.approver_id;
}
export async function verifyTarget(
  workflow: Flowable,
  processId: string,
  row: Record<string, any>,
) {
  let task: EngineTask | undefined;
  if (row.status === "closed") {
    if (!(await workflow.finished(processId)))
      throw new Error("Process not finished");
  } else {
    const tasks = await workflow.tasks(processId);
    task = tasks[0];
    if (
      tasks.length !== 1 ||
      task?.taskDefinitionKey !== steps[row.status as keyof typeof steps] ||
      (task.assignee || null) !== (expectedAssignee(row) || null)
    )
      throw new Error("Target task mismatch");
    if (row.status === "assigned" && row.team_id && !row.technician_id) {
      const links = await workflow.request<{ type: string; group: string }[]>(
        `runtime/tasks/${encodeURIComponent(task.id)}/identitylinks`,
      );
      if (!links.some((l) => l.type === "candidate" && l.group === row.team_id))
        throw new Error("Target group mismatch");
    }
    if (
      ["assigned", "in_progress"].includes(row.status) &&
      row.due_at &&
      new Date(task.dueDate!).getTime() !== new Date(row.due_at).getTime()
    )
      throw new Error("Target deadline mismatch");
  }
  return task;
}

export async function recordCaseEvent(
  db: pg.PoolClient,
  row: Record<string, any>,
  actor: string,
  action: string,
  from: string | null,
  details: Record<string, unknown>,
  commandId?: string,
) {
  const audit = await db.query(
    `INSERT INTO case_events(case_id,actor_id,action,from_status,to_status,details,revision,command_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      row.id,
      actor,
      action,
      from,
      row.status,
      JSON.stringify({
        ...details,
        packageVersion: row.package_version,
        schemaVersion: row.schema_version,
        workflowVersion: row.workflow_version,
        evidencePolicyVersion: row.evidence_policy_version,
      }),
      row.revision,
      commandId || null,
    ],
  );
  if (row.pack_id === "g03")
    for (const recipient of [...new Set<string>(row.access_ids || [])])
      await db.query(
        "INSERT INTO case_notifications(case_id,event_id,recipient_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [row.id, audit.rows[0].id, recipient],
      );
}

// API and workers use the same durable command executor. Locks span the network mutation;
// a crash rolls back only this projection, leaving the already-committed command replayable.
export async function executeCommand(
  pool: pg.Pool,
  workflow: Flowable,
  commandId?: string,
) {
  const db = await pool.connect();
  let command: Command | undefined;
  try {
    await db.query("BEGIN");
    command = (
      await db.query<Command>(
        `SELECT * FROM workflow_commands WHERE state='pending'
      AND ($1::uuid IS NULL OR id=$1) AND ($1::uuid IS NOT NULL OR next_attempt_at<=now())
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [commandId || null],
      )
    ).rows[0];
    if (!command) {
      await db.query("COMMIT");
      return false;
    }
    const row = (
      await db.query("SELECT * FROM cases WHERE id=$1 FOR UPDATE", [
        command.case_id,
      ])
    ).rows[0];
    if (
      !row ||
      row.revision !== command.expected_revision ||
      row.sync_status === "ready"
    )
      throw new Error("Command projection mismatch");
    const next = command.target;
    let processId = row.process_id as string | null;
    if (command.action === "created") {
      // The engine-side unique business-key guard also covers an in-flight start whose
      // HTTP response was lost. Lookup alone is not sufficient to prevent that race.
      const history = await workflow.processesByBusinessKey(row.id);
      if (history.length > 1)
        throw new Error("Duplicate process requires operator review");
      if (history.length) {
        if (history[0]!.processDefinitionId !== row.definition_id)
          throw new Error("Definition mismatch");
        processId = history[0]!.id;
      } else
        processId = (
          await workflow.startWithVariables(
            row.definition_id,
            row.id,
            command.variables,
          )
        ).id;
    } else {
      if (!processId || !command.old_task_id)
        throw new Error("Missing command engine reference");
      const history = await workflow.processesByBusinessKey(row.id);
      if (
        history.length !== 1 ||
        history[0]!.id !== processId ||
        history[0]!.processDefinitionId !== row.definition_id
      )
        throw new Error("Process identity mismatch");
      const tasks = await workflow.tasks(processId),
        old = tasks.find((t) => t.id === command!.old_task_id);
      if (old) {
        if (old.taskDefinitionKey !== row.task_key)
          throw new Error("Source task mismatch");
        const expected =
          command.action === "receive"
            ? row.technician_id || command.actor_id
            : expectedAssignee(row);
        if (command.action === "receive" && !row.technician_id && !old.assignee)
          await workflow.claim(old.id, command.actor_id);
        else if ((old.assignee || null) !== (expected || null))
          throw new Error("Source assignee mismatch");
        await workflow.complete(old.id, command.variables);
      } else {
        if (!(await workflow.taskEnded(command.old_task_id, processId)))
          throw new Error("Source task has no completion proof");
      }
    }
    const task = await verifyTarget(workflow, processId!, next);
    const saved = (
      await db.query(
        `UPDATE cases SET title=$2,room_id=$3,asset_id=$4,description=$5,
      technician_id=$6,team_id=$7,approver_id=$8,due_at=$9,status=$10,task_id=$11,task_key=$12,
      measures=$13,result=$14,decision_by=$15,closed_at=CASE WHEN $10='closed' THEN now() ELSE closed_at END,
      process_id=$16,access_ids=$17,sync_status='ready',updated_at=now() WHERE id=$1 RETURNING *`,
        [
          row.id,
          next.title,
          next.room_id,
          next.asset_id,
          next.description,
          next.technician_id,
          next.team_id,
          next.approver_id,
          next.due_at,
          next.status,
          task?.id || null,
          task?.taskDefinitionKey || null,
          next.measures,
          next.result,
          next.decision_by,
          processId,
          next.access_ids || [],
        ],
      )
    ).rows[0];
    if (command.action !== "created")
      await recordCaseEvent(
        db,
        saved,
        command.actor_id,
        command.action,
        command.from_status,
        command.details,
        command.id,
      );
    else
      await recordCaseEvent(
        db,
        saved,
        command.actor_id,
        "workflow_started",
        null,
        { processId },
        command.id,
      );
    await db.query(
      "UPDATE workflow_commands SET state='done',attempts=attempts+1,last_error=NULL,completed_at=now() WHERE id=$1",
      [command.id],
    );
    await db.query("COMMIT");
    return true;
  } catch (error) {
    await db.query("ROLLBACK");
    if (!command) throw error;
    const message =
      error instanceof Error
        ? error.message.slice(0, 250)
        : "Engine unavailable";
    // Update both rows under the same locks; a competing successful executor wins.
    await db.query("BEGIN");
    const still = await db.query(
      "SELECT id FROM workflow_commands WHERE id=$1 AND state='pending' FOR UPDATE",
      [command.id],
    );
    if (still.rowCount) {
      await db.query(
        `UPDATE workflow_commands SET attempts=attempts+1,last_error=$2,
        next_attempt_at=now()+make_interval(secs=>LEAST(60,POWER(2,LEAST(attempts+1,6))::int)) WHERE id=$1`,
        [command.id, message],
      );
      await db.query(
        "UPDATE cases SET sync_status='needs_reconciliation',updated_at=now() WHERE id=$1",
        [command.case_id],
      );
    }
    await db.query("COMMIT");
    return false;
  } finally {
    db.release();
  }
}

export async function enqueueCommand(
  db: pg.PoolClient,
  row: Record<string, any>,
  actor: string,
  action: string,
  from: string,
  next: Record<string, any>,
  variables: Record<string, string | boolean>,
  details: Record<string, unknown>,
) {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO workflow_commands(id,case_id,actor_id,action,from_status,target,variables,details,old_task_id,expected_revision)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      row.id,
      actor,
      action,
      from,
      JSON.stringify(next),
      JSON.stringify(variables),
      JSON.stringify(details),
      row.task_id,
      next.revision,
    ],
  );
  return id;
}
