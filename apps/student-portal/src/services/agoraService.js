import AgoraRTC from "agora-rtc-sdk-ng";

/**
 * Agora Streaming Bridge for Proctor360
 * This component handles low-latency WebRTC streaming from the student camera
 * to the proctoring clusters for high-throughput AI analysis.
 */

const APP_ID = import.meta.env.VITE_AGORA_APP_ID || "YOUR_AGORA_APP_ID";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

export const startLiveStreaming = async (sessionId, videoTrack, audioTrack) => {
  if (APP_ID === "YOUR_AGORA_APP_ID") {
    console.warn("Agora APP_ID not configured. WebRTC streaming disabled.");
    return null;
  }

  try {
    const uid = await client.join(APP_ID, sessionId, null, null);
    await client.publish([videoTrack, audioTrack]);
    console.log("WebRTC Stream Published:", uid);
    return client;
  } catch (error) {
    console.error("Agora RTC Join Failed:", error);
    return null;
  }
};

export const stopLiveStreaming = async () => {
  await client.unpublish();
  await client.leave();
  console.log("WebRTC Stream Stopped");
};
