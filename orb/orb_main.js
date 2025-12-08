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

/* TODO: 
- Add option to interpolate frames or not. Frame interpolation takes a while
*/

/*___________________________________________________________________________________
                                  DOM ELEMENTS
___________________________________________________________________________________*/

// Helper to get element by ID
const el = (id) => document.getElementById(id);

// File input elements
const imgA     = el('imgA'); // Image A element (extracted frame)
const fileB    = el('fileB'); // File input for Image B
const imgB     = el('imgB'); // Image B element

// Canvas elements
const canvasA       = el('canvasA'); // Display keypoints on Image A
const canvasMatches = el('canvasMatches'); // Display matches between A and B

// Action buttons
const btnDetect   = el('btnDetect'); // Detect features button
const btnMatch    = el('btnMatch'); // Match features button
const showOrbBtn  = el('showOrb'); // Show ORB button to switch to ORB mode 

// Pose parameters elements
const intervalInput = el('intervalInput'); // Input for frame interval

// ORB detection stats 
const statsA = el('statsA'); // Stats display for Image A
const statsB = el('statsB'); // Stats display for Image B

// ORB parameters elements
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
const poseSection  = el('poseSection'); // Pose section
const poseControls = el('poseControls'); // Pose controls section
const orbSection   = el('orbSection'); // ORB section
const matchSection = el('matchSection'); // Match features section
const matchControls= el('matchControls'); // Match controls section 
const showMatch    = el('showMatch'); // Show match section

// Crop box elements
const cropBoxEl    = el('cropBoxOrbA'); // Crop box for Image A
const cropBoxElB   = el('cropBoxOrbB'); // Crop box for Image B

// Status display element
const statusEl      = el('status');
const status2El     = el('status-2');

/*___________________________________________________________________________________
                            GLOBAL VARIABLES
___________________________________________________________________________________*/

// CropBox instances for Image A and B
const cropBoxA = new CropBox(imgA, el('cropBoxOrbA'));
const cropBoxB = new CropBox(imgB, el('cropBoxOrbB'));

// Check if features available (from detection or loaded JSON)
const haveFeatures = () => Boolean(detectResult);

const cv = window.cv; // attach OpenCV.js API

let orbModule; 
let orbDetectionParameters = {};
let orbMatchParameters = {}; 

let landmarkImages = [];
let landmarkFrameIdx = 0;

let detectResult = null; // Detection result state
let orbJSON      = null; // Detected features JSON state

/*___________________________________________________________________________________
                                  STATES
___________________________________________________________________________________*/

let cvReady      = false; // OpenCV.js readiness flag 
let imgAReady    = false; // Image A readiness flag
let imgBReady    = false; // Image B readiness flag
let interpolate  = false; 

/*------------------------------------------------------------------------------------
VERIFY OPENCV.JS IS READY
Make sure OpenCV.js is ready before initializing ORBModule and loading 
event handlers */

if (window.cvIsReady || (window.cv && (window.cv.Mat || window.cv.getBuildInformation))) {
    initOrbModule();
} else {
    document.addEventListener('cv-ready', initOrbModule, { once: true });
}

/*___________________________________________________________________________________
                                 HELPERS 
  __________________________________________________________________________________*/ 

/*------------------------------------------------------------------------------------
INIT ORB MODULE
Initialize ORBModule when OpenCV.js is ready */

function initOrbModule() {   
    // Create ORBModule instance
    try {
        orbModule = new ORBModule(window.cv); // create ORBModule instance
        cvReady = true; // set cvReady flag         
    } catch (e) {
        console.error('cv init error', e);  
        cvReady = false;                    
    }   
    // Refresh button states
    refreshButtons();
}

/*------------------------------------------------------------------------------------
REFRESH BUTTONS   
Enable or disable buttons based on current states */

function refreshButtons() {    
    btnDetect.disabled = !(cvReady && imgAReady); 
    btnMatch.disabled  = !(cvReady && imgBReady && haveFeatures()); 
}

function computeTransformationMatrix(matchResult, offsetKeypointsB, source) {
    let transformMat = null; // init transformation matrix
    try {
        if (!matchResult.matches || matchResult.matches.length < 4) {
            throw new Error('Not enough matches to compute transform.');
        }
        const kpA = getShared('orbA'); // get keypoints A from shared state
        console.log('Keypoints A:', kpA);

        const [srcMatches, dstMatches] = matchesToArray(
            matchResult.matches,
            kpA,
            offsetKeypointsB,
            source.imageSize
        );

        if (!srcMatches || !dstMatches) {
            console.error('Not enough matches to compute transform.');
            return;
        
        } else {
            console.log('Source Matches:', srcMatches);
            console.log('Destination Matches:', dstMatches);
            // Compute transform
            const poseTransformer = new PoseTransform(window.cv);
            transformMat =  poseTransformer.computeTransform(
                srcMatches,
                dstMatches,
                'homography'
            );
        }
    
        if (!transformMat || transformMat.empty()) {
            console.error('Homography computation failed: transformMat is empty.');
            return;
        }
        console.log('Homography matrix data:', transformMat.data64F || transformMat.data32F);
     
    } catch (e) {
        console.error('Transform computation error', e);
        alert('Transform computation failed. See console.');
        return;
    } finally {
        return transformMat; // return transformation matrix
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

function showLandmarkFrame(idx) {
    if (!landmarkImages.length) return;
    landmarkFrameIdx = Math.max(0, Math.min(idx, landmarkImages.length - 1));
    frameImg.src = landmarkImages[landmarkFrameIdx];
    frameCounter.textContent = `Frame ${landmarkFrameIdx + 1} / ${landmarkImages.length}`;
    prevBtn.disabled = landmarkFrameIdx === 0;
    nextBtn.disabled = landmarkFrameIdx === landmarkImages.length - 1;
}

/*___________________________________________________________________________
                                EVENT HANDLERS
____________________________________________________________________________*/   

/*---------------------------------------------------------------------------
ON IMAGE B UPLOAD     
Load and preview Image B from file input */

fileB.addEventListener('change', async () => {
    const f = fileB.files?.[0]; // get selected file
    if (!f) return; // if no file, exit
    try { 
        await loadImg(f, imgB); // load image into imgB   
        imgB.hidden               = false; // show imgB
        cropBoxB.cropBoxEl.hidden = false; // show crop box B
        matchSection.hidden       = false; // show match section
        showMatch.hidden          = false; // show match section details
        imgBReady                 = true; // set imgBReady flag
        statsB.textContent        = ''; // clear prev stats B
        canvasMatches.hidden      = true; // hide prev matches canvas
    
    } catch (e) { // catch load errors
        console.error('Image B preview error', e);
        imgBReady   = false; // clear imgBReady flag
        imgB.hidden = true; // hide imgB
    }
    refreshButtons(); // refresh button states
});

prevBtn.addEventListener('click', () => showLandmarkFrame(landmarkFrameIdx - 1));
nextBtn.addEventListener('click', () => showLandmarkFrame(landmarkFrameIdx + 1));


/*--------------------------------------------------------------------------- 
ON "DETECT" BUTTON CLICK 
Detect ORB features on cropped Image A */

btnDetect.addEventListener('click', () => {
    if (!cvReady || !imgAReady) return; // If not ready, exit 
    
    // Crop image A according to crop box and convert to Mat
    const cropRectA = cropBoxA.getCropRect(); // get crop rectangle
    const croppedCanvasA = cropBoxA.cropImage(); // crop image to canvas
    const src = matFromImageEl(croppedCanvasA); // convert to Mat     

    // Set ORB options 
    orbDetectionParameters = { 
        nfeatures:     Number(nfeatures.value)     || 1200,
        edgeThreshold: Number(edgeThreshold.value) || 31,
        scaleFactor:   Number(scaleFactor.value)   || 1.2,
        nlevels:       Number(nlevels.value)       || 8,
        fastThreshold: Number(fastThreshold.value) || 20,
        patchSize:     Number(patchSize.value)     || 31,
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
        orbJSON = {
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
        statsA.textContent =
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
        orbJSON = null;
    // Cleanup
    } finally { 
        src.delete(); // release Mat
        refreshButtons(); // refresh buttons
        status2El.innerHTML = 
            `&gt; Detected ${detectResult?.keypoints.length || 0} keypoints. <br>
            &gt; Scroll down to load a second image and match features.`;
    }
});


/*--------------------------------------------------------------------------- 
ON "MATCH" BUTTON CLICK 
- Match features from loaded JSON or detected features on image A to
  features detected on cropped image B 
- Compute homography from matches to generate transform
- Apply transform to pose landmarks. */

btnMatch.addEventListener('click', () => {
    if (!cvReady || !imgBReady) return; // If not ready, exit
    if (!detectResult) { // No features available
        alert('Load features.json or run Detect on Image A first.');
        return;
    }

    // Crop image B according to crop box and convert to Mat
    const cropRectB      = cropBoxB.getCropRect();
    const croppedCanvasB = cropBoxB.cropImage();;
    const target         = matFromImageEl(croppedCanvasB);    
    let matchResult      = null; // match result
    const transformedAllFrames = []; //
    const drawnImages    = []; // images with drawn landmarks

    // Detect features on image B using same orbDetectionParameters as image A
    const detectResultB = orbModule.detectORB(target, orbDetectionParameters);
    // Offset keypoints to match their position on the full image B
    const offsetKeypointsB = detectResultB.keypoints.map(kp => ({
        ...kp, 
        x: kp.x + cropRectB.x, 
        y: kp.y + cropRectB.y 
    }));

    // Prepare source features from loaded JSON or detected result
    const source = orbJSON || mod.exportJSON(detectResult);
    const keypointsA = source.keypoints; // keypoints from source
    
    try {
        // Match features
        matchResult = orbModule.matchToTarget(
            { ...source, keypoints: keypointsA }, // source features
            target,                               // target Mat (image B)   
            { useKnn: true, ratio: Number(ratio.value) || 0.75, ransacReprojThreshold: Number(ransac.value) || 3.0 }
        );

        // Update stats for image B
        statsB.textContent =
            `B: ${target.cols}x${target.rows}\n` +
            `matches: ${matchResult.matches.length}\n` +
            `inliers: ${matchResult.numInliers ?? 0}\n` +
            (matchResult.homography ? `H: [${matchResult.homography.map(v => v.toFixed(3)).join(', ')}]` : 'H: (none)');

        // Check if keypoints and matches are valid arrays
        if (!Array.isArray(keypointsA) || !Array.isArray(offsetKeypointsB) || !Array.isArray(matchResult.matches)) {
            alert('No keypoints or matches found. Check your crop area and images.');
            return;
        }
        
        
        // Draw matches on full images using offset keypoints
        const A = matFromImageEl(imgA);
        const B = matFromImageEl(imgB);
        
        // Draw matches on full images using offset keypoints
        orbModule.drawMatches(
            A, // full image A
            B, // full image B
            keypointsA, // use full image A keypoints
            offsetKeypointsB, // use offset keypoints for full image B
            matchResult, // match result
            source.imageSize // original image A size for correct scaling
        );

        // Display matches on canvas
        imshowCompat(
            canvasMatches, // canvas to draw on
            orbModule._lastCanvasMat // get last drawn matches Mat
        );

        cropBoxB.cropBoxEl.style.display = 'none'; // hide crop box B
        canvasMatches.hidden = false;    // show matches canvas
        
        // Clean up
        A.delete();
        B.delete();
        orbModule._releaseLastCanvasMat();

        console.log('Match result:', matchResult.matches);
        console.log('Offset Keypoints B:', offsetKeypointsB);
        console.log('Image Size:', source.imageSize);
    
    // Catch any errors during matching
    } catch (e) {
        console.error('Match error', e);
        alert('Match failed. See console.');
    // Cleanup
    } finally {
        target.delete(); // release Mat
        refreshButtons(); // refresh buttons
    }
        
    /*-----------------------------------------------------------------------
    Compute transform from matches */ 

    let transformMat = computeTransformationMatrix(matchResult, offsetKeypointsB, source);
    

    /*-----------------------------------------------------------------------
    Apply transform to pose landmarks */ 
    
    try {
        const poseTransformer = new PoseTransform(window.cv);
        const poseLandmarksAllFrames = getShared('poseA'); // Array of arrays (frames)

        for (let i = 0; i < poseLandmarksAllFrames.length; i++) {
            const frameLandmarks = poseLandmarksAllFrames[i];
            if (!frameLandmarks || frameLandmarks.length === 0) continue; // skip empty frames

            const transformed = poseTransformer.transformLandmarks(
                frameLandmarks,
                transformMat,
                'homography'
            );
            transformedAllFrames.push(transformed);
        }

        console.log('All Transformed Pose Landmarks:', transformedAllFrames);
        setShared('transformedPoseLandmarks', transformedAllFrames);
    } catch (e) {
        console.error('Landmark transformation error', e);
        alert('Landmark transformation failed. See console.');
        return;
    }
    
    /*-----------------------------------------------------------------------
    Draw transformed landmarks on copies of image B and store the images */

    try {
        for (let i = 0; i < transformedAllFrames.length; i++) {
            const landmarks = transformedAllFrames[i];
            if (!landmarks || landmarks.length === 0) continue;

            // Create a new canvas for each frame
            const tempCanvas = document.createElement('canvas');
            // Draw landmarks on a copy of image B
            drawLandmarksOnImage(tempCanvas, imgB, landmarks, 'lime');
            // Store the image as a data URL
            drawnImages.push(tempCanvas.toDataURL());
        }

        // Optionally, store in shared state for later use
        setShared('landmarkImagesOnB', drawnImages);

        console.log('Drawn images with landmarks:', drawnImages);
    } catch (e) {
        console.error('Drawing landmarks error', e);
        alert('Drawing landmarks failed. See console.');
        return;
    }

        
    /*-----------------------------------------------------------------------
        
    Display images with drawn landmarks */

    try {

        prevBtn.addEventListener('click', () => showLandmarkFrame(landmarkFrameIdx - 1));
        nextBtn.addEventListener('click', () => showLandmarkFrame(landmarkFrameIdx + 1));

        // After you generate drawnImages:
        landmarkImages = drawnImages;
        if (landmarkImages.length > 0) {
            landmarkNav.hidden = false;
            showLandmarkFrame(0);
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
});

/*-----------------------------------------------------------------------
SHOW ORB DETECTION SECTION   
Get first frame image from shared state and display it in imgA for
ORB detection. 

NOTE: This button seems unnecessary but it is kept to handle the 
extraction of the first frame image used in ORB detection. */

showOrbBtn.addEventListener('click', async () => {
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

    orbSection.hidden  = false; // show ORB section
    imgAReady          = true; // set imgAReady flag
    detectResult       = null; // reset previous detection result
    statsA.textContent = ''; // clear stats A
    canvasA.hidden     = true; // hide canvas A

    statusEl.textContent = '> Scroll down to "Detect Background Features"';
    
    refreshButtons(); // refresh buttons
});