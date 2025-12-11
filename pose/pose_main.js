// main.js
// Main entry point: choose mode and run pose detection
import { runPoseDetectionOnFrames } from './pose_module.js';
import { loadOpenCV } from '../load_opencv.js';
import { setShared } from '../shared_state.js';
import { CropBox } from '../CropBox.js';
import { showOrbSection } from '../orb/orb_main.js';

/* DOM ELEMENTS 
___________________________________________________________________________________*/

// Helper to get element by ID
const el = (id) => document.getElementById(id);

const videoFileInput = el('videoFile'); // Video file input element
const videoEl        = el('video'); // Video element
const canvasEl       = el('overlay'); // Canvas element for overlay
const poseDetectBtn  = el('poseDetectBtn'); // Button to start pose detection
const statusEl       = el('status'); // Status display element
const intervalInput  = el('intervalInput'); // Input for frame interval
const frameNav       = el('frameNav'); // Frame navigation element
const prevFrameBtn   = el('prevFrameBtn'); // Previous frame button
const nextFrameBtn   = el('nextFrameBtn'); // Next frame button
const cropBoxEl      = el('cropBoxPose'); // Crop box element
const showImgA       = el('showImgA'); // Show Image A section

/* GLOBAL VARIABLES
___________________________________________________________________________________*/

const poseResults = []; // Array to store pose detection results
const cropBox     = new CropBox(videoEl, cropBoxEl); // CropBox instance to select area 
let currentFrameIdx; // Current frame index for navigation

/* HELPER FUNCTIONS
___________________________________________________________________________________*/

/* DISPLAY FRAME WITH LANDMARKS 
-----------------------------------------------------------------------------------
Display a specific frame with pose landmarks and crop box overlays. Used in 
frame navigation controls.
-----------------------------------------------------------------------------------*/
function showFrame(idx) {
  if (!poseResults.length) return; 
  idx = Math.max(0, Math.min(idx, poseResults.length - 1));
  
  // Get frame data and create image element
  const frameData = poseResults[idx]; 
  const img = new Image(); 
  img.src = frameData.frameUrl; 
  
  // Load frame image and display
  img.onload = () => {       
    
    // Set canvas size/dimensions to match displayed video
    const displayedVideo = videoEl.getBoundingClientRect(); 
    canvasEl.width = displayedVideo.width; 
    canvasEl.height = displayedVideo.height; 
    const ctx = canvasEl.getContext('2d');    
    
    // Clear and draw the frame image
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
  };
}

/* EVENT HANDLERS 
___________________________________________________________________________________*/

/* VIDEO LOADED EVENT
-----------------------------------------------------------------------------------
Set up canvas and crop box when video metadata is loaded (video uploaded)
-----------------------------------------------------------------------------------*/
videoEl.addEventListener('loadeddata', () => {
  
  // Enable pose detect button and show pose section
  poseDetectBtn.disabled = false; 
  poseSection.hidden = false; 

  // Set canvas size to match video resulution (for drawing landmarks) 
  canvasEl.width = videoEl.videoWidth; 
  canvasEl.height = videoEl.videoHeight;  
  
  /* Set Up Canvas Styles for Display
  ---------------------------------------------------------------------------*/
  // Position canvas over video element
  canvasEl.style.position = 'absolute'; 
  canvasEl.style.left = '0px'; 
  canvasEl.style.top = '0px';   
  // Allow interaction with crop box through canvas
  canvasEl.style.pointerEvents = 'none';
  // Set canvas display size to match displayed video (CSS size)
  const videoRect = videoEl.getBoundingClientRect(); 
  canvasEl.style.width = videoRect.width + 'px'; 
  canvasEl.style.height = videoRect.height + 'px';  

  // Display crop box to select detection area
  cropBoxEl.hidden = false; 

  // Update status
  statusEl.innerHTML = 
    `1. Set crop box around the target ( leave room for full range of motion ).<br>
    2. Click 'Detect Pose'.`;

});

/* WINDOW RESIZE EVENT
-----------------------------------------------------------------------------------
Resize canvas and crop box to match video display size
-----------------------------------------------------------------------------------*/
window.addEventListener('resize', () => {

  const videoRect = videoEl.getBoundingClientRect();
  canvasEl.style.width   = videoRect.width + 'px'; 
  canvasEl.style.height  = videoRect.height + 'px'; 
  cropBoxEl.style.width  = videoRect.width + 'px'; 
  cropBoxEl.style.height = videoRect.height + 'px';
});

/* VIDEO FILE INPUT CHANGE EVENT
-----------------------------------------------------------------------------------
Load selected video file into video element
-----------------------------------------------------------------------------------*/
videoFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0]; 
  if (!file) return; 

  const url = URL.createObjectURL(file); 
  videoEl.src = url; 
  poseDetectBtn.disabled = true;
  statusEl.textContent = "Loading video..."; 
});

/* ON POSE DETECT BUTTON CLICK
-----------------------------------------------------------------------------------
Run pose detection on video frames when button is clicked
-----------------------------------------------------------------------------------*/
poseDetectBtn.addEventListener('click', async function handlePoseDetect() {
    
  canvasEl.style.display = ''; // Show canvas
  videoEl.style.display  = ''; // Show video
  videoEl.style.position = 'relative'; // Ensure video is positioned for overlay

  // Hide crop box during detection (still accessible for crop data)
  cropBoxEl.style.zIndex = -1; 
  
  videoEl.pause(); // Pause video playback
  videoEl.currentTime = 0; // Seek to first frame

  await new Promise(resolve => { videoEl.onseeked = resolve; });

  // Get crop rectangle in video pixel coordinates using CropBox class
  const cropRect = cropBox.getCropRect();
  cropRect.left = cropRect.x;
  cropRect.top = cropRect.y;

  /* RUN POSE DETECTION
  -----------------------------------------------------------------------------*/
  const n = parseInt(intervalInput.value, 10) || 1;
  poseResults.length = 0;
  statusEl.textContent = "Detecting pose landmarks...";
  
  await runPoseDetectionOnFrames(videoEl, canvasEl, poseResults, n, cropRect);
   
  /* SETUP FRAME NAVIGATION
  -----------------------------------------------------------------------------*/
  frameNav.hidden = false;
  prevFrameBtn.disabled = poseResults.length === 0;
  nextFrameBtn.disabled = poseResults.length === 0;
  currentFrameIdx = 0; // Ensure this is defined at the top
  frameNav.style.display = ''; // show frame navigation
  showFrame(currentFrameIdx); // show first frame

  /* RESET CROP BOX
  -----------------------------------------------------------------------------*/
  cropBoxEl.style.zIndex = 1; 
  cropBoxEl.hidden = true; 
  
  /* UPDATE STATUS AND ENABLE ORB BUTTON
  -----------------------------------------------------------------------------*/
  statusEl.textContent = "Pose detection complete.";

  // load opencv to window.cv for ORB module
  await loadOpenCV();
  await showOrbSection(); // Show ORB section
  
  /* STORE POSE DATA IN SHARED STATE
  -----------------------------------------------------------------------------
  Allows access from ORB module for pose landmark transformation
  -----------------------------------------------------------------------------*/
  setShared('poseA', poseResults.map(frame => frame.landmarks));
  console.log('Pose Landmarks:', poseResults.map(frame => frame.landmarks));
  setShared('sizeA', {
    width: videoEl.videoWidth,
    height: videoEl.videoHeight
  });

});

/* FRAME NAVIGATION BUTTONS
-----------------------------------------------------------------------------------*/
prevFrameBtn.onclick = () => {
  if (currentFrameIdx > 0) {
    showFrame(currentFrameIdx - 1);
    currentFrameIdx -= 1;
  }
};
  
nextFrameBtn.onclick = () => {
  if (currentFrameIdx < poseResults.length - 1) {
    showFrame(currentFrameIdx + 1);
    currentFrameIdx += 1;
  }
};
