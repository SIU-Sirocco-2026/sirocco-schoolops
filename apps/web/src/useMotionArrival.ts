// SPDX-License-Identifier: Apache-2.0
import { useLayoutEffect, useRef } from "react";

/** Repaint a changed view without remounting its forms or delaying navigation. */
export function useMotionArrival(identity: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!node || preference.matches || document.hidden || !node.animate) return;
    // Opacity does not establish a containing block for the image dialog.
    const animation = node.animate([{ opacity: 0.72 }, { opacity: 1 }], {
      duration: 180,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    });
    const cancel = () => animation.cancel();
    preference.addEventListener("change", cancel);
    document.addEventListener("visibilitychange", cancel);
    return () => {
      cancel();
      preference.removeEventListener("change", cancel);
      document.removeEventListener("visibilitychange", cancel);
    };
  }, [identity]);
  return ref;
}
