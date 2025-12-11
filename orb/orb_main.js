// main.js
// Main script for ORB feature detection and matching tool

import { ORBModule } from './ORBModule.js?v=20251104';
import { CropBox } from '../CropBox.js?v=20251104'; 
import { PoseTransform } from '../PoseTransform.js?v=20251104';
import { loadImg, matFromImageEl, imshowCompat} from './orb_utils.js?v=20251104';
import {getShared, setShared} from '../shared_state.js';
import { drawLandmarksOnImage } from '../pose/pose_utils.js?v=20251104';

/* DOM ELEMENTS
____________________________________________________________________________________*/

// Helper to get element by ID
const el = (id) => document.getElementById(id);

// File input elements
const imgA = el('imgA'); // Image A element (extracted frame)
const fileB = el('fileB'); // File input for Image B
const imgB = el('imgB'); // Image B element

// Canvas elements
const canvasA = el('canvasA'); // Display keypoints on Image A
const canvasMatches = el('canvasMatches'); // Display matches between A and B

// Action buttons
const btnDetect = el('btnDetect'); // Detect features button
const btnMatch = el('btnMatch'); // Match features button
const showOrbParams = el('showOrbParams'); 

// Pose parameters elements
const intervalInput = el('intervalInput'); // Input for frame interval

// ORB detection stats 
const statsDetect = el('statsDetect'); // Stats for initial ORB detection
const statsMatch = el('statsMatch'); // Stats for matching ORB features

// ORB parameter elements
const orbParamsEl = el('orbParams'); // ORB parameters display
const nfeatures = el('nfeatures'); // Number of features to detect
const ratio = el('ratio'); // Ratio for feature matching
const ransac = el('ransac'); // RANSAC threshold
const edgeThreshold = el('edgeThreshold'); // Edge threshold for ORB
const scaleFactor = el('scaleFactor'); // Scale factor for ORB
const nlevels = el('nlevels'); // Number of levels in the pyramid
const fastThreshold = el('fastThreshold'); // FAST threshold for ORB
const patchSize = el('patchSize'); // Patch size for ORB

// Elements for landmark navigation
const landmarkNav = el('landmarkNav'); // Navigation container
const prevBtn = el('prevBtn'); // Previous frame button
const nextBtn = el('nextBtn'); // Next frame button
const frameCounter = el('frameCounter'); // Frame counter display
const frameImg = el('frameImg'); // Frame image display

// Section elements for showing/hiding sections
const orbSection = el('orbSection'); // ORB section
const matchSection = el('matchSection'); // Match features section
const matchControls = el('matchControls'); // Match controls section 
const showMatch = el('showMatch'); // Show match section

// Crop box elements
const cropBoxEl = el('cropBoxOrbA'); // Crop box for Image A
const cropBoxElB = el('cropBoxOrbB'); // Crop box for Image B

// Status display element
const status2El = el('status-2');
const status3El = el('status-3');

/* GLOBAL VARIABLES
____________________________________________________________________________________*/

// CropBox instances for images A and B
const cropBoxA = new CropBox(imgA, el('cropBoxOrbA'));
const cropBoxB = new CropBox(imgB, el('cropBoxOrbB'));

// ORBModule instance and detection parameters
let orbModule; 
let orbDetectionParameters = {};

// Transformed landmark images array and index for navigation
let transformedLandmarkImages = [];
let landmarkFrameIdx = 0;

// ORB detection result and source JSON data
let detectResultA = null;
let sourceJson   = null; 

/* STATE VARIABLES
____________________________________________________________________________________*/

let cvReady     = false; 
let imgAReady   = false; 
let imgBReady   = false; 
let interpolate = false; 

/* HELPER FUNCTIONS
____________________________________________________________________________________*/

/* INITIALIZE ORB MODULE
------------------------------------------------------------------------------------*/

function initOrbModule() {   
    try {
        orbModule = new ORBModule(window.cv); 
        cvReady = true;        
    } catch (e) {
        console.error('cv init error', e);  
        cvReady = false;                    
    }   
    refreshButtons();
}

/* REFRESH BUTTONS
------------------------------------------------------------------------------------
Enable or disable buttons based on current state
-----------------------------------------------------------------------------------*/
function refreshButtons() {    
    btnDetect.disabled = !(cvReady && imgAReady); 
    btnMatch.disabled  = !(cvReady && imgBReady && detectResultA); 
}

/* SHOW ORB SECTION
------------------------------------------------------------------------------------
Load shared first frame image into Image A and show ORB section after pose detection 
is done. 
-----------------------------------------------------------------------------------*/
export async function showOrbSection() {
    
    // Ensure OpenCV.js is ready and initialize ORB module
    if (window.cvIsReady || (window.cv && (window.cv.Mat || window.cv.getBuildInformation))) {
        initOrbModule();
    } else {
        document.addEventListener('cv-ready', initOrbModule, { once: true });
    }

    // Load first frame image and 
    const dataUrl = await getShared('firstFrameImage');
    if (!dataUrl) {
        alert('No shared first frame image found.');
        return;
    }
    const firstFrame = await fetch(dataUrl); // Fetch the data URL
    const blob = await firstFrame.blob(); // Convert to Blob 
    const file = new File([blob], 'first_frame.png', { type: blob.type });
   
    await loadImg(file, imgA); // Load image into imgA

    orbSection.hidden = false; // show ORB section
    imgAReady = true; // set imgAReady flag
    detectResultA = null; // reset previous detection result
    statsDetect.textContent = ''; // clear stats A
    canvasA.hidden = true; // hide canvas A
    
    refreshButtons(); // refresh buttons
}

/* APPLY TRANSFORMATION MATRIX
------------------------------------------------------------------------------------
Transform pose landmarks from image A to image B using the computed transformation
------------------------------------------------------------------------------------*/
function applyTransformationMatrix(transformationMatrix, transformedPoses) {
    try {
        const poseTransformer = new PoseTransform(window.cv);
        const poseLandmarksAllFrames = getShared('poseA'); 

        for (let i = 0; i < poseLandmarksAllFrames.length; i++) {
            const frameLandmarks = poseLandmarksAllFrames[i];
            if (!frameLandmarks || frameLandmarks.length === 0) continue; 

            const transformed = poseTransformer.transformLandmarks(
                frameLandmarks,
                transformationMatrix,
                'homography'
            );
            transformedPoses.push(transformed);
        }
        console.log('All Transformed Pose Landmarks:', transformedPoses);
    } catch (e) {
        console.error('Landmark transformation error', e);
        alert('Landmark transformation failed. See console.');
        return;
    }
}

/* DRAW TRANSFORMED LANDMARKS
------------------------------------------------------------------------------------
Draw transformed landmarks on image B and return array of drawn images 
------------------------------------------------------------------------------------ */
function drawTransformedLandmarks(transformedPoses, imgB) {
    let drawnImages = [];
    try {
        for (let i = 0; i < transformedPoses.length; i++) {
            const landmarks = transformedPoses[i];
            if (!landmarks || landmarks.length === 0) continue;
            const tempCanvas = document.createElement('canvas');
            drawLandmarksOnImage(tempCanvas, imgB, landmarks);
            drawnImages.push(tempCanvas.toDataURL());
        }

    } catch (e) {
        console.error('Drawing landmarks error', e);
        alert('Drawing landmarks failed. See console.');
        return;
    } finally {
        return drawnImages;
    }
}

/* DISPLAY LANDMARK IMAGES
------------------------------------------------------------------------------------
Display images with transformed landmarks drawn on them and set up navigation
------------------------------------------------------------------------------------*/
function displayTransformedLandmarks(drawnImages) {
    try {

        prevBtn.addEventListener('click', () => showTransformedFrame(landmarkFrameIdx - 1));
        nextBtn.addEventListener('click', () => showTransformedFrame(landmarkFrameIdx + 1));

        // After you generate drawnImages:
        transformedLandmarkImages = drawnImages;
        if (transformedLandmarkImages.length > 0) {
            landmarkNav.hidden = false;
            showTransformedFrame(0);
            frameImg.style.display = '';
        } else {
            landmarkNav.hidden = true;
            frameImg.style.display = 'none';
        }
    } catch (e) {
        console.error('Displaying landmarks error', e);
        alert('Displaying landmarks failed. See console.');
        return;
    }
}

/* INTERPOLATE FRAMES IN WORKER
------------------------------------------------------------------------------------
Use a Web Worker to interpolate frames for smoother landmark transitions

NOTE: This function is not currently implemented (too slow). Needs adjustments. 
------------------------------------------------------------------------------------*/

function interpolateFramesInWorker(frames, interval) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('interpolate.js');
        worker.postMessage({ frames, interval });
        worker.onmessage = (e) => {
            resolve(e.data);
            worker.terminate();
        };
        worker.onerror = (err) => {
            reject(err);
            worker.terminate();
        };
    });
}

/* SHOW LANDMARK FRAME
------------------------------------------------------------------------------------
Display a specific frame with transformed landmarks based on the given index
------------------------------------------------------------------------------------*/

function showTransformedFrame(idx) {
    if (!transformedLandmarkImages.length) return;
    landmarkFrameIdx = Math.max(0, Math.min(idx, transformedLandmarkImages.length - 1));
    frameImg.src = transformedLandmarkImages[landmarkFrameIdx];
    frameCounter.textContent = `Frame ${landmarkFrameIdx + 1} / ${transformedLandmarkImages.length}`;
    prevBtn.disabled = landmarkFrameIdx === 0;
    nextBtn.disabled = landmarkFrameIdx === transformedLandmarkImages.length - 1;
}

/* EVENT HANDLERS
___________________________________________________________________________________*/   

/* File Input B Change Event  
-----------------------------------------------------------------------------------
Load Image B when file input changes
-----------------------------------------------------------------------------------*/
fileB.addEventListener('change', async () => {
    const f = fileB.files?.[0]; // get selected file
    if (!f) return; // if no file, exit
    try { 
        await loadImg(f, imgB); // load image into imgB   
        imgB.hidden = false; // show imgB
        cropBoxB.cropBoxEl.hidden = false; // show crop box B
        matchSection.hidden = false; // show match section
        showMatch.hidden = false; // show match section details
        imgBReady = true; // set imgBReady flag
        statsMatch.textContent = ''; // clear prev stats B
        canvasMatches.hidden = true; // hide prev matches canvas
    
    } catch (e) { // catch load errors
        console.error('Image B preview error', e);
        imgBReady   = false; // clear imgBReady flag
        imgB.hidden = true; // hide imgB
    }
    refreshButtons(); // refresh button states
});

/* Show ORB Parameters Click Event
-----------------------------------------------------------------------------------
Show/hide ORB parameters section when button is clicked
-----------------------------------------------------------------------------------*/
showOrbParams.addEventListener('click', () => {
  orbParamsEl.hidden = !orbParamsEl.hidden;
});

/* Detect Button Click Event 
-----------------------------------------------------------------------------------
Run ORB feature detection on cropped Image A when button is clicked
-----------------------------------------------------------------------------------*/
btnDetect.addEventListener('click', () => {
    if (!cvReady || !imgAReady) return; // If not ready, exit 
    
    // Crop image A according to crop box and convert to Mat
    const cropRectA = cropBoxA.getCropRect(); // get crop rectangle
    const croppedCanvasA = cropBoxA.cropImage(); // crop image to canvas
    const croppedMatA = matFromImageEl(croppedCanvasA); // Mat for detection 

    // Set ORB options 
    orbDetectionParameters = { 
        nfeatures: Number(nfeatures.value) || 1200,
        edgeThreshold: Number(edgeThreshold.value) || 31,
        scaleFactor: Number(scaleFactor.value) || 1.2,
        nlevels: Number(nlevels.value) || 8,
        fastThreshold: Number(fastThreshold.value) || 20,
        patchSize: Number(patchSize.value) || 31,
    };
    
    // Run ORB detection
    try {
        
        
        // Detect ORB features on cropped image
        detectResultA = orbModule.detectORB(
            croppedMatA, 
            orbDetectionParameters, 
            cropRectA.x, 
            cropRectA.y,
        );
        
        // Get full image dimensions
        const fullW = imgA.naturalWidth;
        const fullH = imgA.naturalHeight;
        
        // Build JSON
        const baseJson = orbModule.exportJSON(detectResultA);
        /*sourceJson = {
            ...baseJson, // copy base JSON
            imageSize: { width: fullW, height: fullH }, // full image size
            // Normalize keypoints to full image size [0 - 1]
            keypoints: keypointsFullPx.map(kp => ({     
                ...kp, // copy keypoint 
                x: kp.x / fullW, // normalize x to full image width
                y: kp.y / fullH, // normalize y to full image height
            })),
        };
        // NOTE: descriptors stay exactly as baseJson.descriptors (with data_b64)*/
        
        // Update detection stats display
        statsDetect.textContent =
            `A: ${detectResultA.width}x${detectResultA.height}\n` +
            `keypoints: ${detectResultA.keypoints.length}\n` +
            `descriptors: ${detectResultA.descriptors?.rows ?? 0} x ${detectResultA.descriptors?.cols ?? 0}`;
        
        canvasA.hidden = false; // show canvasA (image with keypoints)
        matchSection.hidden = false; // show match section
        matchControls.hidden = false; // show match controls
        imgA.style.display = 'none'; // hide original imageA
        cropBoxEl.hidden = true; // hide crop box A
        const fullMat = matFromImageEl(imgA); // Create Mat from full image A
        
        // Draw keypoints on full image A
        orbModule.drawKeypoints( // Draw keypoints on full image
            fullMat, // full image Mat
            detectResultA.keypoints, // keypoints with full image coordinates
            canvasA // canvas to draw on
        );
        fullMat.delete(); 
    // Catch any errors during detection
    } catch (e) { 
        console.error('Detect error', e);
        alert('Detect failed. See console.');
        detectResultA = null;
        sourceJson = null;
    // Cleanup
    } finally { 
        croppedMatA.delete(); // release Mat
        refreshButtons(); // refresh buttons
        status2El.innerHTML = `Detected ${detectResultA?.keypoints.length || 0} keypoints.`;
    }
});

/* Match Button Click Event
-----------------------------------------------------------------------------------
Match ORB features between Image A and Image B when button is clicked
-----------------------------------------------------------------------------------*/
btnMatch.addEventListener('click', () => {
    
    if (!cvReady || !imgBReady) return; 
    if (!detectResultA) { 
        alert('Load features.json or run Detect on Image A first.');
        return;
    }

    /* Detect ORB Features on Target Image B
    -------------------------------------------------------------------------
    - Crop the target image according to the crop box and run ORB detection on 
    the cropped region. 
    - Offset the detected keypoints back to full image coordinates for matching.
    -------------------------------------------------------------------------*/

    // Crop image B and convert to Mat for detection
    const cropAreaB    = cropBoxB.cropImage();
    const cropAreaBMat = matFromImageEl(cropAreaB); 
    
    const cropRectB  = cropBoxB.getCropRect(); // get crop rectangle
    // Run ORB detection on cropped Image B
    const detectResultB = orbModule.detectORB(cropAreaBMat, orbDetectionParameters, cropRectB.x, cropRectB.y);
    
    /* Match Features
    -------------------------------------------------------------------------
    Use the ORBModule to match features between Image A and Image B using
    the specified matching options.
    -------------------------------------------------------------------------*/
    
    status3El.innerHTML = 'Matching background features...';
    // Set matching options    
    const matchOptions = {
        useKnn: true,
        ratio: Number(ratio.value) || 0.75,
        ransacThresh: Number(ransac.value) || 3.0
    };

    // Run feature matching
    const matchResult = orbModule.matchFeatures(detectResultA, detectResultB, matchOptions); 
    
    
    /* Draw Matches on Canvas
    -------------------------------------------------------------------------
    Visualize the matched features between Image A <--> Image B on a combined
    canvas.
    -------------------------------------------------------------------------*/
    
    // Draw matches
    const drawnMatches = orbModule.drawMatches(
        imgA, imgB, 
        detectResultA, detectResultB, 
        matchResult 
    );
    
    // Display matches on canvas
    imshowCompat(canvasMatches, drawnMatches); 
 
    // Hide crop box and show matches canvas
    cropBoxB.cropBoxEl.style.display = 'none'; 
    canvasMatches.hidden = false; 

    // Display match statistics
    statsMatch.textContent =
        `matches: ${matchResult.matches.length}\n` +
        `inliers: ${matchResult.numInliers ?? 0}\n`;

    /* Transform Pose Landmarks from Image A to Image B
    -------------------------------------------------------------------------
    Use the computed transformation matrix to transform pose landmarks from
    image A --> image B.
    -------------------------------------------------------------------------*/
    
    status3El.innerHTML = 'Transforming pose landmarks...';
    // Create PoseTransform instance
    const poseTransformer = new PoseTransform(window.cv);
    
    // Compute transformation matrix from matches
    const transformationMatrix = poseTransformer.computeTransform(
        matchResult.matches,
        detectResultA.keypoints,
        detectResultB.keypoints, 
        'homography'
    );

    // Apply transformation to pose landmarks
    const transformedPoses = [];
    applyTransformationMatrix(transformationMatrix, transformedPoses);

    // Draw transformed landmarks on image B
    const drawnImages = drawTransformedLandmarks(transformedPoses, imgB);

    // Display transformed landmark images with navigation
    displayTransformedLandmarks(drawnImages);

    imgB.style.display = 'none'; // hide original imageB
    cropBoxB.cropBoxEl.hidden = true; // hide crop box B

    status3El.innerHTML = 
        `Matched ${matchResult.matches.length} features. <br>
        Transformed landmarks drawn on Image B below.`;
    
});
