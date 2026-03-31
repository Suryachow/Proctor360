/**
 * Security and proctoring utility functions
 */

/**
 * Detects if the device is a mobile or tablet device
 * @returns {Object} Device detection result
 */
export function detectDeviceType() {
  const userAgent = navigator.userAgent.toLowerCase();
  
  const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobi|mobile/i.test(userAgent);
  const isTablet = /(ipad|tablet|playbook|silk)|(android(?!.*mobi))/i.test(userAgent);
  const isPhone = /iphone|android(?!.*tablet)|blackberry|mobile|opera mini/i.test(userAgent);
  
  // Check screen size as additional confirmation
  const isMobileSize = window.innerWidth <= 768;
  const isPortraitMode = window.innerHeight > window.innerWidth;
  
  return {
    isMobileDevice,
    isTablet,
    isPhone,
    isMobileSize,
    isPortraitMode,
    userAgent,
    platform: navigator.platform,
    vendor: navigator.vendor,
  };
}

/**
 * Generates a device fingerprint based on browser and device characteristics
 * @returns {string} Hash of device fingerprint
 */
export async function generateDeviceFingerprint() {
  const fingerprint = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
    maxTouchPoints: navigator.maxTouchPoints,
    vendor: navigator.vendor,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    colorDepth: window.screen.colorDepth,
    pixelDepth: window.screen.pixelDepth,
    timestamp: new Date().toISOString(),
  };

  // Create a simple hash of the fingerprint
  const fingerprintStr = JSON.stringify(fingerprint);
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprintStr);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return {
    hash: hashHex,
    details: fingerprint,
  };
}

/**
 * Prevents developer tools from opening
 */
export function preventDeveloperTools() {
  // F12 - Opens developer tools
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F12') {
      e.preventDefault();
      return false;
    }
  }, true);

  // Ctrl+Shift+I - Opens developer tools
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      return false;
    }
  }, true);

  // Ctrl+Shift+J - Opens developer console
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') {
      e.preventDefault();
      return false;
    }
  }, true);

  // Ctrl+Shift+C - Opens developer tools inspector
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      return false;
    }
  }, true);

  // Right-click context menu
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  }, true);

  // Detect if developer tools are open via console methods
  const devToolsDetected = () => {
    const threshold = 160;
    if (window.outerHeight - window.innerHeight > threshold || 
        window.outerWidth - window.innerWidth > threshold) {
      return true;
    }
    return false;
  };

  // Check every second if dev tools are opened
  setInterval(() => {
    if (devToolsDetected()) {
      console.clear();
      console.log('%c⚠️ Developer tools detected during exam. Session will be terminated.', 'color: red; font-size: 14px;');
      // Trigger violation for dev tools detection
      window.dispatchEvent(new CustomEvent('devToolsDetected'));
    }
  }, 1000);
}

/**
 * Validates browser context for exam security
 * @returns {Object} Browser context validation result
 */
export function validateBrowserContext() {
  const checks = {
    cookiesEnabled: navigator.cookieEnabled,
    isOnline: navigator.onLine,
    hasWebGL: (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && 
          (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
      } catch (e) {
        return false;
      }
    })(),
    hasLocalStorage: (() => {
      try {
        const test = '__storage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
      } catch (e) {
        return false;
      }
    })(),
    hasSessionStorage: (() => {
      try {
        const test = '__storage_test__';
        sessionStorage.setItem(test, test);
        sessionStorage.removeItem(test);
        return true;
      } catch (e) {
        return false;
      }
    })(),
    canAccessCamera: false, // Will be set dynamically
    canAccessMicrophone: false, // Will be set dynamically
  };

  return checks;
}

/**
 * Enforces strict keyboard restrictions during exam
 * @param {Function} onViolation - Callback when violation detected
 */
export function enforceKeyboardRestrictions(onViolation) {
  const restrictedKeys = {
    'F12': 'Developer tools',
    'F11': 'Fullscreen toggle',
    'Control+Shift+I': 'Developer tools',
    'Control+Shift+J': 'Developer console',
    'Control+Shift+C': 'Inspector',
    'Control+Shift+K': 'Console',
    'Control+U': 'View source',
    'Control+S': 'Save page',
    'Control+P': 'Print',
    'Alt+Tab': 'Window switch',
    'Alt+F4': 'Close window',
  };

  document.addEventListener('keydown', (e) => {
    const keyCombo = [
      e.ctrlKey && 'Control',
      e.altKey && 'Alt',
      e.shiftKey && 'Shift',
      e.key.toUpperCase()
    ]
      .filter(Boolean)
      .join('+');

    if (restrictedKeys[keyCombo]) {
      e.preventDefault();
      onViolation('restricted_keyboard_shortcut', `Attempted: ${restrictedKeys[keyCombo]}`);
      return false;
    }
  }, true);
}

/**
 * Monitors for application window/tab changes
 * @param {Function} onViolation - Callback when violation detected
 */
export function monitorBrowserActivity(onViolation) {
  // Detect if browser is in fullscreen
  const handleFullscreenChange = () => {
    if (!document.fullscreenElement) {
      onViolation('fullscreen_exit', 'Exam exited fullscreen mode');
    }
  };

  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('msfullscreenchange', handleFullscreenChange);
  document.addEventListener('mozfullscreenchange', handleFullscreenChange);

  // Detect application/window changes  
  const handleVisibilityChange = () => {
    if (document.hidden) {
      onViolation('tab_switch', 'Tab switched away from exam');
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Detect mouse leaving window
  let mouseLeftWindow = false;
  document.addEventListener('mouseout', (e) => {
    if (e.clientY <= 0 || e.clientX <= 0 || 
        e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      mouseLeftWindow = true;
      onViolation('mouse_left_window', 'Mouse left the application window');
    }
  });

  // Detect if not in active tab
  window.addEventListener('blur', () => {
    onViolation('window_blur', 'Application lost focus');
  });
}

/**
 * Validates that exam is being taken on desktop/laptop only
 * @returns {Object} Validation result with isAllowed flag
 */
export function validateExamDevice() {
  const device = detectDeviceType();
  
  if (device.isMobileDevice || device.isPhone || device.isTablet) {
    return {
      isAllowed: false,
      reason: 'Exam can only be taken on a desktop or laptop computer. Mobile and tablet devices are not permitted.',
      device,
    };
  }

  if (device.isMobileSize) {
    return {
      isAllowed: false,
      reason: 'Your screen size appears to be too small. Please use a desktop or laptop with a minimum window width of 800px.',
      device,
    };
  }

  return {
    isAllowed: true,
    reason: 'Device validation passed',
    device,
  };
}
