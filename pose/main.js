// main.js
// Main entry point: choose mode and run pose detection
import { runPoseDetectionOnFrames } from './pose_module.js';
import { VideoFrameExtractor } from '../VideoFrameExtractor.js';
import { loadOpenCV } from '../load_opencv.js';
import { setShared } from '../shared_state.js';
import { CropBox } from '../CropBox.js';

/*___________________________________________________________________________________
                                  DOM ELEMENTS
___________________________________________________________________________________*/

// Helper to get element by ID
const el = (id) => document.getElementById(id);

const videoFileInput = el('videoFile'); // Video file input element
const videoEl        = el('video'); // Video element
const canvasEl       = el('overlay'); // Canvas element for overlay
const poseDetectBtn  = el('poseDetectBtn'); // Button to start pose detection
const downloadBtn    = el('downloadBtn');// Button to download results
const showOrbBtn     = el('showOrb'); // Button to show ORB features
const statusEl       = el('status'); // Status display element
const intervalInput  = el('intervalInput'); // Input for frame interval
const frameNav       = el('frameNav'); // Frame navigation element
const frameCounter   = el('frameCounter'); // Frame counter display
const cropBoxEl      = el('cropBoxPose'); // Crop box element

/*___________________________________________________________________________________
                              GLOBAL VARIABLES
___________________________________________________________________________________*/

const poseResults = []; // Array to store pose detection results
const cropBox     = new CropBox(videoEl, cropBoxEl); // CropBox instance to select area 

/*___________________________________________________________________________________
                               EVENT HANDLERS
___________________________________________________________________________________*/

// Video loaded metadata event
videoEl.addEventListener('loadedmetadata', () => {
  poseDetectBtn.disabled = false;

  // Canvas size
  canvasEl.width  = videoEl.videoWidth; // match video width
  canvasEl.height = videoEl.videoHeight; // match video height
  
  // Canvas positioning
  canvasEl.style.position = 'absolute'; // position over video
  canvasEl.style.left     = '0px'; // align left
  canvasEl.style.top      = '0px'; // align top

  // Disable pointer events on canvas to allow interaction with crop box
  canvasEl.style.pointerEvents = 'none';

  // Set canvas and crop box size to match video display size
  const videoRect       = videoEl.getBoundingClientRect(); // get displayed video size
  canvasEl.style.width  = videoRect.width + 'px'; // match displayed video width
  canvasEl.style.height = videoRect.height + 'px';  // match displayed video height

  // Show and size crop box
  cropBoxEl.hidden = false;
  
  // Update status
  statusEl.textContent = "Adjust crop box over subject and click \"Detect Pose Landmarks\".";
});

// Window resize event to adjust canvas and crop box size
window.addEventListener('resize', () => {
  // Adjust canvas and crop box size to match video display size
  const videoRect = videoEl.getBoundingClientRect();
  
  // Set canvas and crop box size to match video display size
  canvasEl.style.width   = videoRect.width + 'px'; // displayed video width
  canvasEl.style.height  = videoRect.height + 'px'; // displayed video height
  cropBoxEl.style.width  = videoRect.width + 'px'; // displayed video width
  cropBoxEl.style.height = videoRect.height + 'px'; // displayed video height
});

// Video file input change event
videoFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0]; // Selected video file
  if (!file) return; // No file selected
  // Set video source to selected file
  const url = URL.createObjectURL(file); // Create object URL for the file
  videoEl.src = url; // Set video element source to the file URL
  poseDetectBtn.disabled = true; // Disable pose detect button until video is loaded
  statusEl.textContent = "Loading video..."; // Update status
});

// Frame detection button click event
poseDetectBtn.addEventListener('click', async function handlePoseDetect() {
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

  // Get crop rectangle in video pixel coordinates using CropBox class
  const cropRect = cropBox.getCropRect();
  cropRect.left = cropRect.x;
  cropRect.top = cropRect.y;

  // Get interval n
  const n = parseInt(intervalInput.value, 10) || 1;
  poseResults.length = 0;
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

