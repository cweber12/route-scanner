// pose_landmarker_video.js
// Pose detection on video playback, overlaying landmarks in real time
// Notes: 
// - Not currently implemented in main.js. 
// - Slightly faster but much less accurate than detecting on extracted frames. 
// - May be useful for future applications needing real-time feedback.
import {
  FilesetResolver,
  PoseLandmarker,
  DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

export async function runPoseDetectionOnVideo(videoEl, canvasEl, statusEl, poseResults, startBtn, stopBtn, downloadBtn) {
  // Load pose model
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.9,
    minPosePresenceConfidence: 0.9,
    minTrackingConfidence: 0.9,
    outputSegmentationMasks: false
  });

  const drawingUtils = new DrawingUtils(canvasEl.getContext('2d'));
  let running = true;
  let lastVideoTime = -1;
  poseResults.length = 0;

  function processVideoFrame() {
    if (!running || !poseLandmarker) return;
    if (videoEl.ended || videoEl.currentTime >= videoEl.duration) {
      running = false;
      startBtn.disabled = false;
      stopBtn.disabled = true;
      downloadBtn.disabled = poseResults.length === 0;
      statusEl.textContent = "Finished processing video.";
      return;
    }
    const now = performance.now();
    if (videoEl.currentTime !== lastVideoTime) {
      lastVideoTime = videoEl.currentTime;
      poseLandmarker.detectForVideo(videoEl, now, (result) => {
        const ctx = canvasEl.getContext('2d');
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        if (result && result.landmarks && result.landmarks.length > 0) {
          for (const landmarkSet of result.landmarks) {
            drawingUtils.drawLandmarks(landmarkSet, {
              radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1)
            });
            drawingUtils.drawConnectors(
              landmarkSet,
              PoseLandmarker.POSE_CONNECTIONS,
              { color: 'lime', lineWidth: 4 }
            );
          }
          poseResults.push({
            timeSec: videoEl.currentTime,
            frameWidth: videoEl.videoWidth,
            frameHeight: videoEl.videoHeight,
            landmarks: result.landmarks
          });
        }
      });
    }
    requestAnimationFrame(processVideoFrame);
  }

  startBtn.disabled = true;
  stopBtn.disabled = false;
  downloadBtn.disabled = true;
  statusEl.textContent = "Running pose detection on video...";
  videoEl.play();
  requestAnimationFrame(processVideoFrame);

  stopBtn.onclick = () => {
    running = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    downloadBtn.disabled = poseResults.length === 0;
    statusEl.textContent = "Stopped. You can download JSON or start again.";
  };
}
