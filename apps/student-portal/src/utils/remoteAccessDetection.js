/**
 * Remote Desktop and Virtual Environment Detection
 * Detects: RDP, TeamViewer, Chrome Remote Desktop, AnyDesk, VPN, Virtual Machines, etc.
 */

/**
 * Detects if the application is running via Remote Desktop Protocol (RDP)
 * @returns {boolean} True if RDP is detected
 */
export function detectRemoteDesktop() {
  // Check for RDP-related screen characteristics
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  
  // RDP often has vendor string containing "Microsoft" or "RemoteFX"
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      if (renderer && (renderer.includes('RemoteFX') || renderer.includes('RDP'))) {
        return true;
      }
    }
  }

  // Check for virtual display adapters
  if (navigator.hardwareConcurrency === 1 && navigator.deviceMemory === 4) {
    // Common RDP configuration: 1 CPU, 4GB memory
    return true;
  }

  // RDP often reports strange screen dimensions
  const width = window.screen.width;
  const height = window.screen.height;
  const aspectRatio = width / height;
  
  // Detect common RDP resolutions and aspect ratios
  const rdpResolutions = [
    { w: 1024, h: 768 },
    { w: 1280, h: 1024 },
    { w: 1920, h: 1440 },
  ];

  for (const res of rdpResolutions) {
    if (width === res.w && height === res.h) {
      return true;
    }
  }

  return false;
}

/**
 * Detects virtual machine or emulation environment
 * @returns {boolean} True if virtual environment detected
 */
export function detectVirtualMachine() {
  const checks = {
    virtualBoxDetected: false,
    vmwareDetected: false,
    hypervDetected: false,
    qemuDetected: false,
    parallelsDetected: false,
  };

  // Check for VirtualBox
  if (navigator.userAgent.includes('VirtualBox')) {
    checks.virtualBoxDetected = true;
  }

  // Check for VMware
  if (navigator.userAgent.includes('VMware')) {
    checks.vmwareDetected = true;
  }

  // Check for Hyper-V
  if (navigator.userAgent.includes('Hyper-V')) {
    checks.hypervDetected = true;
  }

  // Check for QEMU
  if (navigator.userAgent.includes('QEMU')) {
    checks.qemuDetected = true;
  }

  // Check for Parallels
  if (navigator.userAgent.includes('Parallels')) {
    checks.parallelsDetected = true;
  }

  // Check screen metrics typical of VMs
  const dpr = window.devicePixelRatio;
  const width = window.screen.width;
  const height = window.screen.height;

  if (dpr === 1.0 && ((width === 1024 && height === 768) || (width === 1280 && height === 1024))) {
    return true;
  }

  // If any VM detected, return true
  return Object.values(checks).some(v => v);
}

/**
 * Detects screen sharing or remote collaboration tools
 * @returns {boolean} True if screen sharing detected
 */
export function detectScreenSharing() {
  const checks = {};

  // Check for Chrome Remote Desktop
  if (navigator.userAgent.includes('chromecast')) {
    checks.chromeRemoteDesktop = true;
  }

  // Check for TeamViewer
  if (navigator.userAgent.includes('TeamViewer')) {
    checks.teamViewer = true;
  }

  // Check for AnyDesk
  if (navigator.userAgent.includes('AnyDesk')) {
    checks.anyDesk = true;
  }

  // Check for media stream from screen capture (screen sharing)
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    // Display capture API available - but this doesn't mean it's being used
    // We'll monitor actual streaming later
  }

  // Check for unusual pointer behavior (common in remote desktop)
  // This will be monitored in real-time

  return Object.values(checks).some(v => v);
}

/**
 * Detects virtual cameras and microphones (webcam emulation)
 * @returns {Promise<Object>} Detection results
 */
export async function detectVirtualDevices() {
  const results = {
    hasWebcam: false,
    hasMicrophone: false,
    webcamBrand: null,
    microphoneBrand: null,
    isVirtualWebcam: false,
    isVirtualMicrophone: false,
    suspiciousDeviceNames: [],
  };

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    devices.forEach(device => {
      const label = device.label.toLowerCase();
      
      // Detect virtual/emulated devices
      const virtualKeywords = [
        'virtual',
        'dummy',
        'fake',
        'emulated',
        'test',
        'obs',
        'open broadcaster',
        'manycam',
        'vb-audio',
        'voicemeeter',
      ];

      const suspicious = virtualKeywords.some(keyword => label.includes(keyword));

      if (device.kind === 'videoinput') {
        results.hasWebcam = true;
        results.webcamBrand = device.label;
        if (suspicious) {
          results.isVirtualWebcam = true;
          results.suspiciousDeviceNames.push(`Webcam: ${device.label}`);
        }
      }

      if (device.kind === 'audioinput') {
        results.hasMicrophone = true;
        results.microphoneBrand = device.label;
        if (suspicious) {
          results.isVirtualMicrophone = true;
          results.suspiciousDeviceNames.push(`Microphone: ${device.label}`);
        }
      }
    });
  } catch (err) {
    console.warn('Unable to enumerate media devices:', err);
  }

  return results;
}

/**
 * Monitors for unusual pointer/mouse behavior typical of remote control
 * @param {Function} onViolation - Callback when suspicious behavior detected
 */
export function monitorPointerBehavior(onViolation) {
  let lastX = 0;
  let lastY = 0;
  let lastTime = Date.now();
  const suspiciousMovements = [];

  document.addEventListener('mousemove', (e) => {
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTime;
    
    if (timeDiff > 0) {
      const distance = Math.sqrt(
        Math.pow(e.clientX - lastX, 2) + Math.pow(e.clientY - lastY, 2)
      );
      const velocity = distance / timeDiff; // pixels per millisecond

      // Remote desktop often has jerky/teleporting cursor
      // Normal: 0-2 px/ms, Remote: >3 px/ms or very sudden jumps
      if (velocity > 5 || (distance > 200 && timeDiff < 10)) {
        suspiciousMovements.push({
          distance,
          timeDiff,
          velocity,
          timestamp: currentTime,
        });

        // If we see multiple suspicious movements, report violation
        const recentSuspicious = suspiciousMovements.filter(
          m => currentTime - m.timestamp < 10000 // Last 10 seconds
        );

        if (recentSuspicious.length > 3) {
          onViolation(
            'suspicious_pointer_behavior',
            `Detected ${recentSuspicious.length} unusual pointer jumps suggesting remote control`
          );
          suspiciousMovements.length = 0; // Reset
        }
      }

      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = currentTime;
    }
  });
}

/**
 * Monitors for unusual keyboard patterns typical of remote control/automation
 * @param {Function} onViolation - Callback when suspicious behavior detected
 */
export function monitorKeyboardBehavior(onViolation) {
  let lastKeyTime = 0;
  let keyTimings = [];
  const suspiciousPatterns = [];

  document.addEventListener('keydown', (e) => {
    const currentTime = Date.now();
    
    if (lastKeyTime > 0) {
      const interval = currentTime - lastKeyTime;
      keyTimings.push(interval);

      // Remote desktop/automation often has:
      // 1. Perfectly consistent intervals (robotic typing)
      // 2. Too fast typing (copy-paste via automation)
      // 3. Perfect rhythm between keys

      if (keyTimings.length >= 5) {
        const avgInterval = keyTimings.reduce((a, b) => a + b) / keyTimings.length;
        const variance = keyTimings.reduce(
          (sum, interval) => sum + Math.pow(interval - avgInterval, 2),
          0
        ) / keyTimings.length;

        // Very low variance = robotic typing
        // Very high speed = automation
        if (variance < 1000 || avgInterval < 30) {
          suspiciousPatterns.push({
            variance,
            avgInterval,
            timestamp: currentTime,
          });

          if (suspiciousPatterns.length > 2) {
            onViolation(
              'suspicious_keyboard_pattern',
              `Detected robotic or automated typing pattern (variance: ${variance.toFixed(0)}, interval: ${avgInterval.toFixed(0)}ms)`
            );
            suspiciousPatterns.length = 0;
            keyTimings = [];
          }
        }

        // Keep only last 10 keystrokes for analysis
        if (keyTimings.length > 10) {
          keyTimings.shift();
        }
      }
    }

    lastKeyTime = currentTime;
  });
}

/**
 * Detects VPN or proxy connections
 * @returns {Promise<Object>} VPN detection results
 */
export async function detectVPN() {
  const results = {
    possibleVPN: false,
    suspiciousNetworkAdapter: false,
    reasonsDetected: [],
  };

  // Check for common VPN indicators in user agent
  const vpnKeywords = [
    'vpn',
    'proxy',
    'tunnel',
    'tor',
    'onion',
    'shadowsocks',
  ];

  if (vpnKeywords.some(keyword => navigator.userAgent.toLowerCase().includes(keyword))) {
    results.possibleVPN = true;
    results.reasonsDetected.push('VPN keywords detected in user agent');
  }

  // Check WebRTC leak (can reveal real IP behind VPN)
  try {
    const pc = new RTCPeerConnection({ iceServers: [] });
    const iceServers = pc.getConfiguration().iceServers;
    
    if (iceServers && iceServers.length > 0) {
      // Multiple ICE servers can indicate VPN manipulation
      if (iceServers.length > 3) {
        results.suspiciousNetworkAdapter = true;
        results.reasonsDetected.push('Multiple ICE servers detected');
      }
    }
    pc.close();
  } catch (err) {
    console.warn('WebRTC check failed:', err);
  }

  return results;
}

/**
 * Comprehensive remote access detection
 * @returns {Promise<Object>} Comprehensive detection results
 */
export async function detectRemoteAccess() {
  const results = {
    isRemoteDesktop: detectRemoteDesktop(),
    isVirtualMachine: detectVirtualMachine(),
    isScreenSharing: detectScreenSharing(),
    virtualDevices: await detectVirtualDevices(),
    vpnDetected: await detectVPN(),
    overallRisk: 'low',
    threats: [],
  };

  // Calculate overall risk
  let riskScore = 0;

  if (results.isRemoteDesktop) {
    riskScore += 40;
    results.threats.push('Remote Desktop Protocol (RDP) detected');
  }

  if (results.isVirtualMachine) {
    riskScore += 30;
    results.threats.push('Virtual Machine environment detected');
  }

  if (results.isScreenSharing) {
    riskScore += 35;
    results.threats.push('Screen sharing or remote collaboration tool detected');
  }

  if (results.virtualDevices?.isVirtualWebcam) {
    riskScore += 25;
    results.threats.push(`Virtual webcam detected: ${results.virtualDevices.webcamBrand}`);
  }

  if (results.virtualDevices?.isVirtualMicrophone) {
    riskScore += 20;
    results.threats.push(`Virtual microphone detected: ${results.virtualDevices.microphoneBrand}`);
  }

  if (results.vpnDetected?.possibleVPN) {
    riskScore += 15;
    results.threats.push('VPN or proxy connection detected');
  }

  if (riskScore >= 40) {
    results.overallRisk = 'critical';
  } else if (riskScore >= 25) {
    results.overallRisk = 'high';
  } else if (riskScore >= 10) {
    results.overallRisk = 'medium';
  }

  results.riskScore = riskScore;

  return results;
}

/**
 * Validates that exam is being accessed directly (not via remote control)
 * @returns {Promise<Object>} Validation result
 */
export async function validateDirectAccess() {
  const remoteAccessCheck = await detectRemoteAccess();

  if (remoteAccessCheck.riskScore >= 40) {
    return {
      isAllowed: false,
      reason: `Remote access detected: ${remoteAccessCheck.threats.join(', ')}. Exams must be taken directly on the computer.`,
      details: remoteAccessCheck,
    };
  }

  if (remoteAccessCheck.riskScore >= 25) {
    return {
      isAllowed: false,
      reason: `Suspicious remote access indicators detected. This exam must be taken directly without remote access tools.`,
      details: remoteAccessCheck,
    };
  }

  return {
    isAllowed: true,
    reason: 'Direct access validated',
    details: remoteAccessCheck,
  };
}
