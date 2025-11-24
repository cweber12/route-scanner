// main.js
// Main entry point: choose mode and run pose detection
import { runPoseDetectionOnFrames } from './pose_module.js';
import { VideoFrameExtractor } from './video_frame_extractor.js';
import { setupCropBox } from './setup_crop_box.js';
import { loadOpenCV } from '../load_opencv.js';
import { setShared } from '../shared_state.js';

//-------------------------------------------------------------
// DOM ELEMENTS
//-------------------------------------------------------------

// File input for video
const videoFileInput = document.getElementById('videoFile'); 
// HTML video element 
const videoEl = document.getElementById('video');
// Overlay canvas for drawing landmarks
const canvasEl = document.getElementById('overlay');
// Frame detection button
const frameDetectBtn = document.getElementById('frameDetectBtn');
// Download button for results
const downloadBtn = document.getElementById('downloadBtn');
// Show ORB button to switch to ORB mode
const showOrbBtn = document.getElementById('showOrb');
// Status display element
const statusEl = document.getElementById('status');
// Interval input for frame extraction
const intervalInput = document.getElementById('intervalInput');
// Element containing prev/next frame buttons and counter
const frameNav = document.getElementById('frameNav');
// Displays current frame number in frameNav
const frameCounter = document.getElementById('frameCounter');
// Crop box element to select ROI to detect within
const cropBoxEl = document.getElementById('cropBoxPose');
// Results
const poseResults = [];

//-------------------------------------------------------------
// EVENT LISTENERS
//-------------------------------------------------------------

// Video loaded metadata event
videoEl.addEventListener('loadedmetadata', () => {
  frameDetectBtn.disabled = false;

  // Adjust canvas pixel buffer size
  canvasEl.width = videoEl.videoWidth;    // match video width
  canvasEl.height = videoEl.videoHeight;  // match video height
  canvasEl.style.position = 'absolute';   // position over video
  canvasEl.style.left = '0px';            // align left
  canvasEl.style.top = '0px';             // align top
  canvasEl.style.pointerEvents = 'none';  // allow clicks to pass through

  // Set canvas and crop box size to match video display size
  const videoRect = videoEl.getBoundingClientRect(); // get displayed video size
  canvasEl.style.width = videoRect.width + 'px';    // match displayed video width
  canvasEl.style.height = videoRect.height + 'px';  // match displayed video height
  cropBoxEl.style.width = videoRect.width + 'px';   // match displayed video width
  cropBoxEl.style.height = videoRect.height + 'px'; // match displayed video height
  cropBoxEl.style.left = '0px'; // align left
  cropBoxEl.style.top = '0px';  // align top

  // Update status
  statusEl.textContent = "Video loaded. Click \"Detect Pose Landmarks\" to start.";
});

// Window resize event to adjust canvas and crop box size
window.addEventListener('resize', () => {
  // Adjust canvas and crop box size to match video display size
  const videoRect = videoEl.getBoundingClientRect();
  // Set canvas and crop box size to match video display size
  canvasEl.style.width = videoRect.width + 'px';
  canvasEl.style.height = videoRect.height + 'px';
  cropBoxEl.style.width = videoRect.width + 'px';
  cropBoxEl.style.height = videoRect.height + 'px';
});

// Video file input change event
videoFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0]; // Selected video file
  if (!file) return; // No file selected
  // Set video source to selected file
  const url = URL.createObjectURL(file); // Create object URL for the file
  videoEl.src = url; // Set video element source to the file URL
  frameDetectBtn.disabled = true; // Disable frame detect button until video is loaded
  statusEl.textContent = "Loading video..."; // Update status
});

// Normalization function
function normalizeLandmarks(landmarks, refWidth, refHeight) {
  return landmarks.map(lm => ({
    ...lm,
    x: lm.x / refWidth,
    y: lm.y / refHeight
  }));
}

// Frame detection button click event
frameDetectBtn.addEventListener('click', async function handleFrameDetect() {
  frameNav.style.display = 'none'; // Hide frame navigation
  canvasEl.style.display = ''; // Show canvas
  videoEl.style.display = ''; // Show video
  videoEl.style.position = 'relative'; // Ensure video is positioned for overlay

  // Pause video and seek to first frame
  videoEl.pause(); // Pause video playback
  videoEl.currentTime = 0; // Seek to first frame

  // Wait for seek operation to complete
  await new Promise(resolve => {
    videoEl.onseeked = resolve;
  });

  // Show crop box over video
  cropBoxEl.hidden = false;
  cropBoxEl.style.left = '0px';
  cropBoxEl.style.top = '0px';
  setupCropBox(videoEl, cropBoxEl);

  // Update status
  statusEl.textContent = "Adjust crop box, set interval, then click \"Detect Pose Landmarks\" again to confirm crop and start detection.";

  // Replace this handler with a one-time confirm handler
  frameDetectBtn.removeEventListener('click', handleFrameDetect);
  frameDetectBtn.addEventListener('click', async function confirmCropHandler() {   
    // Hide crop box
    cropBoxEl.hidden = true;
    
    // Get crop rectangle in video pixel coordinates
    const videoRect = videoEl.getBoundingClientRect();
    // Calculate scale between displayed video size and actual video size
    const scaleX = videoEl.videoWidth  / videoRect.width;
    // Calculate scale between displayed video size and actual video size
    const scaleY = videoEl.videoHeight / videoRect.height;

    // Calculate crop rectangle in video pixel coordinates
    const cropRect = {
      left:   Math.round(parseInt(cropBoxEl.style.left, 10)   * scaleX),
      top:    Math.round(parseInt(cropBoxEl.style.top, 10)    * scaleY),
      width:  Math.round(parseInt(cropBoxEl.style.width, 10)  * scaleX),
      height: Math.round(parseInt(cropBoxEl.style.height, 10) * scaleY)
    };

    // Get interval n
    const n = parseInt(intervalInput.value, 10) || 1;
    // Clear previous results
    poseResults.length = 0;
    // Disable download button until results are ready
    downloadBtn.disabled = true;

    // Run pose detection on frames with cropping
    await runPoseDetectionOnFrames(
      videoEl,
      canvasEl,
      statusEl,
      poseResults,
      n,
      frameNav,
      frameCounter,
      cropRect
    );

    showOrbBtn.disabled = poseResults.length === 0;
    downloadBtn.disabled = poseResults.length === 0;
    frameDetectBtn.removeEventListener('click', confirmCropHandler);
    frameDetectBtn.addEventListener('click', handleFrameDetect);
    await loadOpenCV();
    console.log('OpenCV loaded');

    setShared('poseA', poseResults.map(frame => frame.landmarks));
    console.log('Pose Landmarks:', poseResults.map(frame => frame.landmarks));
    setShared('sizeA', {
      width: videoEl.videoWidth,
      height: videoEl.videoHeight
    });
    console.log('Image Size:', {
      width: videoEl.videoWidth,
      height: videoEl.videoHeight
    });

  }, { once: true });
});

downloadBtn.addEventListener('click', () => {
  if (poseResults.length === 0) {
    alert("No pose data collected yet.");
    return;
  }
  
  const blob = new Blob([
    JSON.stringify(normalizedResults, null, 2)], 
      { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "pose_landmarks.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

