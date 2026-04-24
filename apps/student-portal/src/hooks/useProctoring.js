import { useEffect } from "react";

export const useProctoring = ({
  active,
  onViolation,
  minHiddenMs = 1200,
  minBlurMs = 1200,
  fullscreenCooldownMs = 5000,
}) => {
  useEffect(() => {
    if (!active) return;

    let hiddenAt = null;
    let blurAt = null;
    let lastFullscreenViolationAt = 0;
    let lastTabViolationAt = 0;

    const emitTabSwitch = (detail) => {
      const now = Date.now();
      if (now - lastTabViolationAt < 2500) return;
      lastTabViolationAt = now;
      onViolation("tab_switch", detail);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }

      if (hiddenAt) {
        const hiddenDuration = Date.now() - hiddenAt;
        hiddenAt = null;
        if (hiddenDuration >= minHiddenMs) {
          emitTabSwitch(`Tab hidden for ${Math.round(hiddenDuration / 1000)}s`);
        }
      }
    };

    const onWindowBlur = () => {
      blurAt = Date.now();
    };

    const onWindowFocus = () => {
      if (document.hidden) return;

      if (blurAt) {
        const blurDuration = Date.now() - blurAt;
        blurAt = null;
        if (blurDuration >= minBlurMs && !document.fullscreenElement) {
          emitTabSwitch(`Window focus lost for ${Math.round(blurDuration / 1000)}s outside fullscreen`);
        }
      }
    };

    const onFullscreenChange = () => {
      const now = Date.now();
      if (!document.hidden && !document.fullscreenElement && now - lastFullscreenViolationAt >= fullscreenCooldownMs) {
        lastFullscreenViolationAt = now;
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
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", blockClipboard);
    document.addEventListener("paste", blockClipboard);
    document.addEventListener("cut", blockClipboard);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("cut", blockClipboard);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, onViolation, minHiddenMs, minBlurMs, fullscreenCooldownMs]);
};
