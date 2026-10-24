import { readFile } from "node:fs/promises";

export type EngineTask = {
  id: string;
  assignee: string;
  processInstanceId: string;
  name: string;
  taskDefinitionKey: string;
  dueDate?: string;
};
export class Flowable {
  constructor(
    private readonly base: string,
    private readonly username: string,
    private readonly password: string,
  ) {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set(
      "Authorization",
      `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`,
    );
    if (init.body && !(init.body instanceof FormData))
      headers.set("Content-Type", "application/json");
    const response = await fetch(`${this.base}/${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Workflow HTTP ${response.status}`);
    if (response.status === 204) return undefined as T;
    const body = await response.text();
    return (body ? JSON.parse(body) : undefined) as T;
  }
  async ready() {
    await this.request("management/engine");
  }
  async deploy(path: string, name = "sirocco-foundation-v1-0-0") {
    // The deployed name is immutable in phase 1. Later revisions use a new package version.
    // Flowable derives the deployment name from the filename before its first dot.
    const existing = await this.request<{ data: { id: string }[] }>(
      `repository/deployments?name=${name}`,
    );
    let deploymentId = existing.data[0]?.id;
    if (!deploymentId) {
      const data = new FormData();
      data.append(
        name,
        new Blob([await readFile(path, "utf8")], { type: "application/xml" }),
        `${name}.bpmn20.xml`,
      );
      const deployed = await this.request<{ id: string }>(
        "repository/deployments",
        {
          method: "POST",
          body: data,
        },
      );
      deploymentId = deployed.id;
    }
    const definitions = await this.request<{ data: { id: string }[] }>(
      `repository/process-definitions?deploymentId=${encodeURIComponent(deploymentId)}`,
    );
    const id = definitions.data[0]?.id;
    if (!id) throw new Error("Foundation workflow not deployed");
    return id;
  }
  start(definitionId: string, runId: string, assignee: string) {
    return this.startWithVariables(definitionId, runId, { assignee });
  }
  startWithVariables(
    definitionId: string,
    runId: string,
    variables: Record<string, string | boolean>,
  ) {
    return this.request<{ id: string }>("runtime/process-instances", {
      method: "POST",
      body: JSON.stringify({
        processDefinitionId: definitionId,
        businessKey: runId,
        variables: Object.entries(variables).map(([name, value]) => ({
          name,
          value,
          type: typeof value,
        })),
      }),
    });
  }
  async tasks(processId: string) {
    const result = await this.request<{ data: EngineTask[] }>(
      `runtime/tasks?processInstanceId=${encodeURIComponent(processId)}&size=10`,
    );
    return result.data;
  }
  async finished(processId: string) {
    const result = await this.request<{ data: { id: string }[] }>(
      `history/historic-process-instances?processInstanceId=${encodeURIComponent(processId)}&finished=true`,
    );
    return result.data.some((item) => item.id === processId);
  }
  async processesByBusinessKey(key: string) {
    return (
      await this.request<{
        data: { id: string; processDefinitionId: string }[];
      }>(
        `history/historic-process-instances?businessKey=${encodeURIComponent(key)}&size=10`,
      )
    ).data;
  }
  async taskEnded(id: string, processId: string) {
    const history = await this.request<{
      data: {
        id: string;
        processInstanceId: string;
        endTime: string | null;
        deleteReason: string | null;
      }[];
    }>(
      `history/historic-task-instances?taskId=${encodeURIComponent(id)}&processInstanceId=${encodeURIComponent(processId)}&finished=true`,
    );
    return history.data.some(
      (t) =>
        t.id === id &&
        t.processInstanceId === processId &&
        t.endTime &&
        !t.deleteReason,
    );
  }
  complete(taskId: string, variables: Record<string, string | boolean> = {}) {
    return this.request(`runtime/tasks/${encodeURIComponent(taskId)}`, {
      method: "POST",
      body: JSON.stringify({
        action: "complete",
        variables: Object.entries(variables).map(([name, value]) => ({
          name,
          value,
          type: typeof value,
        })),
      }),
    });
  }
  claim(taskId: string, assignee: string) {
    return this.request(`runtime/tasks/${encodeURIComponent(taskId)}`, {
      method: "POST",
      body: JSON.stringify({ action: "claim", assignee }),
    });
  }
}
