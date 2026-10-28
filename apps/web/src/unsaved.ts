// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
import { useEffect, useRef } from "react";
import type { View } from "./workspace-state.js";
type Scope = { view: View; caseId?: string | null };
type Target = { view: string | null; caseId: string | null };
type Block = { current: { dirty: boolean; scope: Scope; focus?: HTMLElement } };
const blocks = new Set<Block>();
const message = "Nội dung đang nhập chưa được gửi hoặc lưu. Tiếp tục có thể bỏ nội dung đó.";
const entryKey = "schoolops:history-index";
let initialized = false, currentIndex = 0, restoring = false, unloadAttached = false;
function dirtyBlocks(target?: Target, refresh = false) {
  return [...blocks].filter(({ current: b }) => b.dirty && (!target || (refresh
    ? b.scope.view === target.view && b.scope.caseId === target.caseId
    : b.scope.view !== target.view || (b.scope.caseId !== undefined && b.scope.caseId !== target.caseId))));
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirtyBlocks().length) return;
  event.preventDefault();
  event.returnValue = "";
}
function syncUnload() {
  const needed = dirtyBlocks().length > 0;
  if (needed && !unloadAttached) window.addEventListener("beforeunload", beforeUnload);
  if (!needed && unloadAttached) window.removeEventListener("beforeunload", beforeUnload);
  unloadAttached = needed;
}
function ask(target?: Target, refresh = false) {
  const dirty = dirtyBlocks(target, refresh);
  if (!dirty.length || window.confirm(message)) return true;
  dirty[dirty.length - 1]?.current.focus?.focus({ preventScroll: true });
  return false;
}
function index() {
  const value = window.history.state?.[entryKey];
  return Number.isSafeInteger(value) ? value as number : null;
}
export function initializeWorkspaceHistory() {
  if (initialized) return;
  initialized = true;
  currentIndex = index() ?? 0;
  window.history.replaceState({ ...window.history.state, [entryKey]: currentIndex }, "", window.location.href);
  // Capture before subscribers see a rejected traversal's temporary URL.
  window.addEventListener("popstate", event => {
    const next = index();
    if (restoring) {
      event.stopImmediatePropagation();
      if (next === currentIndex) restoring = false;
      else if (next !== null) window.history.go(currentIndex - next);
      else restoring = false;
      return;
    }
    // Cross-document/foreign history is handled by native beforeunload. Only own entries have a reversible delta.
    if (next === null) {
      currentIndex = 0;
      window.history.replaceState({ ...window.history.state, [entryKey]: currentIndex }, "", window.location.href);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (next !== currentIndex && !ask({ view: params.get("view"), caseId: params.get("case") })) {
      event.stopImmediatePropagation();
      restoring = true;
      window.history.go(currentIndex - next);
      return;
    }
    currentIndex = next;
  }, true);
}
export function navigateWithGuard(url: URL, replace: boolean) {
  initializeWorkspaceHistory();
  if (restoring) return false;
  if (!ask({ view: url.searchParams.get("view"), caseId: url.searchParams.get("case") })) return false;
  if (!replace) currentIndex++;
  window.history[replace ? "replaceState" : "pushState"]({ ...window.history.state, [entryKey]: currentIndex }, "", url);
  return true;
}
export function confirmCaseRefresh(view: View, caseId: string | null) {
  return ask({ view, caseId }, true);
}
export function hasUnsavedCase(view: View, caseId: string) {
  return dirtyBlocks({ view, caseId }, true).length > 0;
}
export function useUnsavedChanges(dirty: boolean, scope: Scope) {
  const block = useRef<Block["current"]>({ dirty, scope });
  block.current.dirty = dirty;
  block.current.scope = scope;
  useEffect(() => {
    if (!dirty) return;
    initializeWorkspaceHistory();
    blocks.add(block);
    if (document.activeElement instanceof HTMLElement) block.current.focus = document.activeElement;
    function focusChanged(event: FocusEvent) {
      if (event.target instanceof HTMLElement && event.target.matches("input,textarea,select")) block.current.focus = event.target;
    }
    document.addEventListener("focusin", focusChanged);
    syncUnload();
    return () => {
      blocks.delete(block);
      document.removeEventListener("focusin", focusChanged);
      syncUnload();
    };
  }, [dirty, scope.view, scope.caseId]);
  return () => { block.current.dirty = false; syncUnload(); };
}
