import { useEffect } from "react";

export const useProctoring = ({ active, onViolation }) => {
  useEffect(() => {
    if (!active) return;

    const onVisibilityChange = () => {
      if (document.hidden) onViolation("tab_switch", "Tab became hidden");
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        onViolation("fullscreen_exit", "Fullscreen exited");
      }
    };

    const blockClipboard = (event) => {
      event.preventDefault();
      onViolation("copy_paste_attempt", "Clipboard operation attempted");
    };

    const onKeyDown = (event) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        ["c", "v", "x", "u", "s"].includes(event.key.toLowerCase())
      ) {
        event.preventDefault();
        onViolation("copy_paste_attempt", `Blocked key combo: ${event.key}`);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", blockClipboard);
    document.addEventListener("paste", blockClipboard);
    document.addEventListener("cut", blockClipboard);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("cut", blockClipboard);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, onViolation]);
};
