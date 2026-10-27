// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { useSyncExternalStore } from "react";

export type View = "g01" | "foundation" | "packs" | "environment" | "safety";
const views: View[] = ["g01", "foundation", "packs", "environment", "safety"];
const changeEvent = "schoolops:navigation";

export function parseLocation(search: string) {
  const params = new URLSearchParams(search);
  const value = params.get("view");
  const id = params.get("case");
  return {
    view: views.includes(value as View) ? (value as View) : null,
    caseId:
      id && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id) ? id : null,
  };
}

export function defaultView(roles: string[]): View {
  if (
    roles.some((role) =>
      ["reporter", "coordinator", "technician", "approver"].includes(role),
    )
  )
    return "g01";
  if (
    roles.some((role) => ["safety_reporter", "safety_officer"].includes(role))
  )
    return "safety";
  if (roles.includes("environment_officer")) return "environment";
  if (roles.includes("admin")) return "packs";
  return "foundation";
}

export function navigate(
  view: View,
  caseId: string | null = null,
  replace = false,
) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  if (caseId) url.searchParams.set("case", caseId);
  else url.searchParams.delete("case");
  if (url.href === window.location.href) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(changeEvent, callback);
  };
}
export function useWorkspaceLocation() {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => "",
  );
  return parseLocation(search);
}

export const caseViews: Record<string, View> = {
  g01: "g01",
  g02: "environment",
  g03: "safety",
};
export const caseLabels = {
  g01: {
    heading: "Hồ sơ sự cố",
    form: "Báo sự cố cơ sở vật chất",
    create: "Báo sự cố mới",
    submit: "Gửi báo sự cố",
    noun: "sự cố",
  },
  g02: {
    heading: "Hồ sơ môi trường",
    form: "Ghi nhận cảnh báo môi trường",
    create: "Ghi nhận cảnh báo",
    submit: "Gửi cảnh báo",
    noun: "cảnh báo",
  },
  g03: {
    heading: "Hồ sơ an toàn",
    form: "Gửi phản ánh an toàn",
    create: "Phản ánh an toàn mới",
    submit: "Gửi phản ánh",
    noun: "phản ánh",
  },
} as const;
