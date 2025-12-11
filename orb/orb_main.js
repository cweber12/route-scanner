// main.js
// Main script for ORB feature detection and matching tool

import { ORBModule } from './ORBModule.js?v=20251104';
import { CropBox } from '../CropBox.js?v=20251104'; 
import { PoseTransform } from '../PoseTransform.js?v=20251104';

import { 
    loadImg, 
    matFromImageEl, 
    matchesToArray, 
    imshowCompat,
 } from './orb_utils.js?v=20251104';
 
import {getShared, setShared} from '../shared_state.js';
import { drawLandmarksOnImage } from '../pose/pose_utils.js?v=20251104';

console.log('orb/main.js loaded');

/* DOM ELEMENTS
____________________________________________________________________________________*/

// Helper to get element by ID
const el = (id) => document.getElementById(id);

// File input elements
const imgA  = el('imgA'); // Image A element (extracted frame)
const fileB = el('fileB'); // File input for Image B
const imgB  = el('imgB'); // Image B element

// Canvas elements
const canvasA       = el('canvasA'); // Display keypoints on Image A
const canvasMatches = el('canvasMatches'); // Display matches between A and B

// Action buttons
const btnDetect   = el('btnDetect'); // Detect features button
const btnMatch    = el('btnMatch'); // Match features button
const showOrbParams = el('showOrbParams');

// Pose parameters elements
const intervalInput = el('intervalInput'); // Input for frame interval

// ORB detection stats 
const statsDetect = el('statsDetect'); // Stats display for Image A
const statsMatch  = el('statsMatch'); // Stats display for Image B

// ORB parameters elements
const orbParamsEl   = el('orbParams'); // ORB parameters section
const nfeatures     = el('nfeatures'); // Number of features to detect
const ratio         = el('ratio'); // Ratio for feature matching
const ransac        = el('ransac'); // RANSAC threshold
const edgeThreshold = el('edgeThreshold'); // Edge threshold for ORB
const scaleFactor   = el('scaleFactor'); // Scale factor for ORB
const nlevels       = el('nlevels'); // Number of levels in the pyramid
const fastThreshold = el('fastThreshold'); // FAST threshold for ORB
const patchSize     = el('patchSize'); // Patch size for ORB

// Elements for landmark navigation
const landmarkNav  = el('landmarkNav'); // Navigation container
const prevBtn      = el('prevBtn'); // Previous frame button
const nextBtn      = el('nextBtn'); // Next frame button
const frameCounter = el('frameCounter'); // Frame counter display
const frameImg     = el('frameImg'); // Frame image display

// Section elements for showing/hiding sections
const poseSection   = el('poseSection'); // Pose section
const poseControls  = el('poseControls'); // Pose controls section
const orbSection    = el('orbSection'); // ORB section
const matchSection  = el('matchSection'); // Match features section
const matchControls = el('matchControls'); // Match controls section 
const showMatch     = el('showMatch'); // Show match section

// Crop box elements
const cropBoxEl  = el('cropBoxOrbA'); // Crop box for Image A
const cropBoxElB = el('cropBoxOrbB'); // Crop box for Image B

// Status display element
const statusEl  = el('status');
const status2El = el('status-2');

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
let detectResult = null;
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
    btnMatch.disabled  = !(cvReady && imgBReady && detectResult); 
}

export async function showOrbSection() {
    console.log('Switching to ORB mode');
    const dataUrl = await getShared('firstFrameImage');
    if (!dataUrl) {
        alert('No shared first frame image found.');
        return;
    }
    
    const firstFrame = await fetch(dataUrl); // Fetch the data URL
    const blob = await firstFrame.blob(); // Convert to Blob
    
    // Create a File object 
    const file = new File([blob], 'first_frame.png', { type: blob.type });
   
    await loadImg(file, imgA); // Load image into imgA

    orbSection.hidden = false; // show ORB section
    imgAReady = true; // set imgAReady flag
    detectResult = null; // reset previous detection result
    statsDetect.textContent = ''; // clear stats A
    canvasA.hidden = true; // hide canvas A

    statusEl.textContent = '> Scroll down to "Detect Background Features"';
    
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
        setShared('transformedPoseLandmarks', transformedPoses);
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

/*------------------------------------------------------------------------------------
INTERPOLATE FRAMES IN WORKER
Offload frame interpolation to a Web Worker */

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

/* CALL INITIALIZE ORB MODULE
------------------------------------------------------------------------------------
Make sure OpenCV.js is ready before initializing ORBModule and loading 
event handlers 
------------------------------------------------------------------------------------*/

if (window.cvIsReady || (window.cv && (window.cv.Mat || window.cv.getBuildInformation))) {
    initOrbModule();
} else {
    document.addEventListener('cv-ready', initOrbModule, { once: true });
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
    const src = matFromImageEl(croppedCanvasA); // convert to Mat     

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
        detectResult = orbModule.detectORB(src, orbDetectionParameters);
        
        // Get full image dimensions
        const fullW = imgA.naturalWidth;
        const fullH = imgA.naturalHeight;
        
        // Offset keypoints to full image coordinates
        const keypointsFullPx = detectResult.keypoints.map(kp => ({
            ...kp, // copy keypoint
            x: kp.x + cropRectA.x, // offset x by crop rectangle
            y: kp.y + cropRectA.y, // offset y by crop rectangle
        }))

        setShared('orbA', keypointsFullPx); // Store in shared state
        console.log('Set shared orbA:', keypointsFullPx);
        console.log('ImgA width: ', fullW, 'height:', fullH);
        
        // Build JSON
        const baseJson = orbModule.exportJSON(detectResult);
        sourceJson = {
            ...baseJson, // copy base JSON
            imageSize: { width: fullW, height: fullH }, // full image size
            // Normalize keypoints to full image size [0 - 1]
            keypoints: keypointsFullPx.map(kp => ({     
                ...kp, // copy keypoint 
                x: kp.x / fullW, // normalize x to full image width
                y: kp.y / fullH, // normalize y to full image height
            })),
        };
        // NOTE: descriptors stay exactly as baseJson.descriptors (with data_b64)
        
        // Update detection stats display
        statsDetect.textContent =
            `A: ${detectResult.width}x${detectResult.height}\n` +
            `keypoints: ${detectResult.keypoints.length}\n` +
            `descriptors: ${detectResult.descriptors?.rows ?? 0} x ${detectResult.descriptors?.cols ?? 0}`;
        
        canvasA.hidden = false; // show canvasA (image with keypoints)
        matchSection.hidden = false; // show match section
        matchControls.hidden = false; // show match controls
        imgA.style.display = 'none'; // hide original imageA
        cropBoxEl.hidden = true; // hide crop box A
        const fullMat = matFromImageEl(imgA); // Create Mat from full image A
        
        // Draw keypoints on full image A
        orbModule.drawKeypoints( // Draw keypoints on full image
            fullMat, // full image Mat
            keypointsFullPx, // keypoints with full image coordinates
            canvasA // canvas to draw on
        );
        fullMat.delete(); 
    // Catch any errors during detection
    } catch (e) { 
        console.error('Detect error', e);
        alert('Detect failed. See console.');
        detectResult = null;
        sourceJson = null;
    // Cleanup
    } finally { 
        src.delete(); // release Mat
        refreshButtons(); // refresh buttons
        status2El.innerHTML = 
            `&gt; Detected ${detectResult?.keypoints.length || 0} keypoints. <br>
            &gt; Scroll down to load a second image and match features.`;
    }
});

/* Match Button Click Event
-----------------------------------------------------------------------------------
Match ORB features between Image A and Image B when button is clicked
-----------------------------------------------------------------------------------*/
btnMatch.addEventListener('click', () => {
    
    if (!cvReady || !imgBReady) return; 
    if (!detectResult) { 
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
    
    
    // Run ORB detection on cropped Image B
    const detectResultB = orbModule.detectORB(cropAreaBMat, orbDetectionParameters);
    
    // Offset keypoints back to full image coordinates
    const cropRectB  = cropBoxB.getCropRect(); // get crop rectangle   
    const orbDataB = { 
        ...detectResultB, 
        keypoints: detectResultB.keypoints.map(kp => ({
            ...kp, 
            x: kp.x + cropRectB.x, // offset x by crop rectangle
            y: kp.y + cropRectB.y // offset y by crop rectangle
        }))
    };

    /* Prepare Source ORB Data from Image A
    -------------------------------------------------------------------------
    - Use the previously detected features from Image A stored in sourceJson.
    - Convert normalized keypoints back to pixel coordinates for matching.
    -------------------------------------------------------------------------*/ 
    const orbDataA = {
        ...sourceJson,
        keypoints: sourceJson.keypoints.map(kp => ({
            ...kp,
            x: kp.x * sourceJson.imageSize.width,
            y: kp.y * sourceJson.imageSize.height
        })),
        descriptors: {
            ...sourceJson.descriptors,
            // Convert base64 descriptor data to Uint8Array if needed
            data: sourceJson.descriptors.data
                ? new Uint8Array(sourceJson.descriptors.data)
                : orbModule._b64ToU8(sourceJson.descriptors.data_b64)
        }
    };
    
    /* Match Features
    -------------------------------------------------------------------------
    Use the ORBModule to match features between Image A and Image B using
    the specified matching options.
    -------------------------------------------------------------------------*/
    
    // Set matching options    
    const matchOptions = {
        useKnn: true,
        ratio: Number(ratio.value) || 0.75,
        ransacThresh: Number(ransac.value) || 3.0
    };

    // Run feature matching
    const matchResult = orbModule.matchFeatures(orbDataA, orbDataB, matchOptions); 
    
    
    /* Draw Matches on Canvas
    -------------------------------------------------------------------------
    Visualize the matched features between Image A <--> Image B on a combined
    canvas.
    -------------------------------------------------------------------------*/
    
    // Draw matches
    const drawnMatches = orbModule.drawMatches(
        imgA, imgB, 
        orbDataA, orbDataB, 
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
    
    // Create PoseTransform instance
    const poseTransformer = new PoseTransform(window.cv);
    
    // Compute transformation matrix from matches
    const transformationMatrix = poseTransformer.computeTransform(
        matchResult.matches,
        orbDataA.keypoints,
        orbDataB.keypoints, 
        'homography'
    );

    // Apply transformation to pose landmarks
    const transformedPoses = [];
    applyTransformationMatrix(transformationMatrix, transformedPoses);

    // Draw transformed landmarks on image B
    const drawnImages = drawTransformedLandmarks(transformedPoses, imgB);

    // Display transformed landmark images with navigation
    displayTransformedLandmarks(drawnImages);
    
});
