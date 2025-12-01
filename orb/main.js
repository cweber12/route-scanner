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
 } from './utils.js?v=20251104';
 
import {getShared, setShared} from '../shared_state.js';
import { drawLandmarksOnImage } from '../pose/draw_landmarks.js?v=20251104';

console.log('orb/main.js loaded');

/*___________________________________________________________________________________
                                  DOM ELEMENTS
___________________________________________________________________________________*/

// Helper to get element by ID
const el = (id) => document.getElementById(id);

// File input elements
const imgA     = el('imgA'); // Image A element
const fileJSON = el('fileJSON'); // File input for features.json
const fileB    = el('fileB'); // File input for Image B
const imgB     = el('imgB'); // Image B element

// Canvas elements
const canvasA       = el('canvasA'); // Display keypoints on Image A
const canvasMatches = el('canvasMatches'); // Display matches between A and B

// Action buttons
const btnDetect   = el('btnDetect'); // Detect features button
const btnDownload = el('btnDownload'); // Download features.json button
const btnMatch    = el('btnMatch'); // Match features button
const showOrbBtn  = el('showOrb'); // Show ORB button to switch to ORB mode

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
const landmarkNav   = el('landmarkNav'); // Navigation container
const prevBtn       = el('prevBtn'); // Previous frame button
const nextBtn       = el('nextBtn'); // Next frame button
const frameCounter  = el('frameCounter'); // Frame counter display
const frameImg      = el('frameImg'); // Frame image display

// Section elements for showing/hiding sections
const detectOrb    = el('detectOrb'); // Detect ORB section
const matchSection = el('matchSection'); // Match features section 

/*___________________________________________________________________________________
                            GLOBAL VARIABLES
___________________________________________________________________________________*/

// CropBox instances for Image A and B
const cropBoxA = new CropBox(imgA, el('cropBoxOrbA'));
const cropBoxB = new CropBox(imgB, el('cropBoxOrbB'));

// Check if features available (from detection or loaded JSON)
const haveFeatures = () => Boolean(loadedJSON || detectResult);

let mod; // ORBModule instance
let opts; // ORB options

/*___________________________________________________________________________________
                                  STATES
___________________________________________________________________________________*/

let cvReady      = false; // OpenCV.js readiness flag 
let imgAReady    = false; // Image A readiness flag
let imgBReady    = false; // Image B readiness flag
let detectResult = null; // Detection result state
let loadedJSON   = null; // Loaded JSON state
let detectJSON   = null; // Detected features JSON state

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
        mod = new ORBModule(window.cv); // create ORBModule instance
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
    btnDetect.disabled   = !(cvReady && imgAReady); 
    btnDownload.disabled = !(detectResult && detectResult.descriptors); 
    btnMatch.disabled    = !(cvReady && imgBReady && haveFeatures()); 
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

/*--------------------------------------------------------------------------- 
ON JSON FILE UPLOAD
Load and parse features.json file with ORB features from image A */

fileJSON.addEventListener('change', async () => {
    const f = fileJSON.files?.[0]; // get selected file
    if (!f) return; // if no file, exit
    try { // parse JSON
        loadedJSON = JSON.parse(await f.text());  
    } catch (e) { // catch parse errors                                  
        console.error('JSON parse error', e);
        loadedJSON = null;
    }
    refreshButtons(); // refresh button states
});

/*--------------------------------------------------------------------------- 
ON "DETECT" BUTTON CLICK 
Detect ORB features on cropped Image A */

btnDetect.addEventListener('click', () => {
    if (!cvReady || !imgAReady) return; // If not ready, exit
    const cv = window.cv; // Get OpenCV.js reference 
    
    // Crop image A according to crop box and convert to Mat
    const cropRectA = cropBoxA.getCropRect(); // get crop rectangle
    const croppedCanvasA = cropBoxA.cropImage(); // crop image to canvas
    const src = matFromImageEl(croppedCanvasA); // convert to Mat     

    // Set ORB options 
    opts = { 
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
        detectResult = mod.detectORB(src, opts);
        
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
        const baseJson = mod.exportJSON(detectResult);
        detectJSON = {
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
        imgA.hidden    = true; // hide original imageA
        
        const fullMat = matFromImageEl(imgA); // Create Mat from full image A
        
        // Draw keypoints on full image A
        mod.drawKeypoints( // Draw keypoints on full image
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
        detectJSON = null;
    // Cleanup
    } finally { 
        src.delete();     // release Mat
        refreshButtons(); // refresh buttons
    }
});

/*--------------------------------------------------------------------------- 
ON "DOWNLOAD" BUTTON CLICK
Download detected ORB features as features.json file */

btnDownload.addEventListener('click', () => {
    if (!detectResult) return; // If no detection result, exit
    // Inintialize JSON to download
    const json = detectJSON || mod.exportJSON(detectResult);
    const blob = new Blob( // Create Blob from JSON string
        [JSON.stringify(json, null, 2)], // pretty-print with 2-space indent
        { type: 'application/json' }     // MIME type
    );
    const a = document.createElement('a'); // create temporary anchor element
    a.href = URL.createObjectURL(blob); // create object URL for Blob
    a.download = 'features.json'; // set download filename
    a.click(); // trigger download
    URL.revokeObjectURL(a.href); // revoke object URL
});

/*--------------------------------------------------------------------------- 
ON "MATCH" BUTTON CLICK 
- Match features from loaded JSON or detected features on image A to
  features detected on cropped image B 
- Compute homography from matches to generate transform
- Apply transform to pose landmarks. */

btnMatch.addEventListener('click', () => {
    if (!cvReady || !imgBReady) return; // If not ready, exit
    if (!loadedJSON && !detectResult) { // No features available
        alert('Load features.json or run Detect on Image A first.');
        return;
    }
    
    const cv = window.cv; // Get OpenCV.js reference

    // Crop image B according to crop box and convert to Mat
    const cropRectB      = cropBoxB.getCropRect();
    const croppedCanvasB = cropBoxB.cropImage();;
    const target         = matFromImageEl(croppedCanvasB);

    // Detect features on image B using same opts as image A
    const detectResultB = mod.detectORB(target, opts);
    // Offset keypoints to match their position on the full image B
    const offsetKeypointsB = detectResultB.keypoints.map(kp => ({
        ...kp, // copy keypoint
        x: kp.x + cropRectB.x, // offset x by crop rectangle
        y: kp.y + cropRectB.y // offset y by crop rectangle
    }));

    // Prepare source features from loaded JSON or detected result
    const source = loadedJSON || detectJSON || mod.exportJSON(detectResult);
    const keypointsA = source.keypoints; // keypoints from source
    try {
        // Match features
        const res = mod.matchToTarget(
            { ...source, keypoints: keypointsA }, // source features
            target, // target Mat (image B)   
            { // matching options
                useKnn: true, // use k-NN matching
                ratio: Number(ratio.value) || 0.75, // ratio test threshold
                ransacReprojThreshold: Number(ransac.value) || 3.0 // RANSAC reproj threshold
            }
        );

        // Update stats for image B
        statsB.textContent =
            `B: ${target.cols}x${target.rows}\n` +
            `matches: ${res.matches.length}\n` +
            `inliers: ${res.numInliers ?? 0}\n` +
            (res.homography ? `H: [${res.homography.map(v => v.toFixed(3)).join(', ')}]` : 'H: (none)');

        // Check if keypoints and matches are valid arrays
        if (!Array.isArray(keypointsA) || !Array.isArray(offsetKeypointsB) || !Array.isArray(res.matches)) {
            alert('No keypoints or matches found. Check your crop area and images.');
            return;
        }
        
        
        // Draw matches on full images using offset keypoints
        const A = matFromImageEl(imgA);
        const B = matFromImageEl(imgB);
        
        // Draw matches on full images using offset keypoints
        mod.drawMatches(
            A, // full image A
            B, // full image B
            keypointsA, // use full image A keypoints
            offsetKeypointsB, // use offset keypoints for full image B
            res, // match result
            source.imageSize // original image A size for correct scaling
        );

        // Display matches on canvas
        imshowCompat(
            canvasMatches, // canvas to draw on
            mod._lastCanvasMat // get last drawn matches Mat
        );

        cropBoxB.cropBoxEl.style.display = 'none'; // hide crop box B
        canvasMatches.hidden = false;    // show matches canvas
        
        // Clean up
        A.delete();
        B.delete();
        mod._releaseLastCanvasMat();

        console.log('Match result:', res.matches);
        console.log('Offset Keypoints B:', offsetKeypointsB);
        console.log('Image Size:', source.imageSize);
        
        
        /*-----------------------------------------------------------------------
        Compute transform from matches */ 

        const kpA = getShared('orbA'); // get keypoints A from shared state
        const imgSizeA = getShared('sizeA'); // Original image A size
        let transformMat;
        console.log('Keypoints A:', kpA);
        console.log('Image Size A:', imgSizeA);


        const [srcMatches, dstMatches] = matchesToArray(
            res.matches,
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
                 
        /*-----------------------------------------------------------------------
        Apply transform to pose landmarks */ 
       
        const poseTransformer = new PoseTransform(window.cv);
        const poseLandmarksAllFrames = getShared('poseA'); // Array of arrays (frames)
        const transformedAllFrames = [];

        for (let i = 0; i < poseLandmarksAllFrames.length; i++) {
            const frameLandmarks = poseLandmarksAllFrames[i];
            if (!frameLandmarks || frameLandmarks.length === 0) continue; // skip empty frames

            const transformed = poseTransformer.transformLandmarks(
                frameLandmarks,
                imgSizeA,
                transformMat,
                'homography'
            );
            transformedAllFrames.push(transformed);
        }

        console.log('All Transformed Pose Landmarks:', transformedAllFrames);
        setShared('transformedPoseLandmarks', transformedAllFrames);

        /*-----------------------------------------------------------------------
        Draw transformed landmarks on copies of image B and store the images */

        const drawnImages = [];
        for (let i = 0; i < transformedAllFrames.length; i++) {
            const landmarks = transformedAllFrames[i];
            if (!landmarks || landmarks.length === 0) continue;

            // Create a new canvas for each frame
            const tempCanvas = document.createElement('canvas');
            // Draw landmarks on a copy of image B
            drawLandmarksOnImage(tempCanvas, imgB, landmarks, 'red');
            // Store the image as a data URL
            drawnImages.push(tempCanvas.toDataURL());
        }

        // Optionally, store in shared state for later use
        setShared('landmarkImagesOnB', drawnImages);

        console.log('Drawn images with landmarks:', drawnImages);

        /*-----------------------------------------------------------------------
        Display images with drawn landmarks */

        let landmarkImages = [];
        let landmarkFrameIdx = 0;

        function showLandmarkFrame(idx) {
            if (!landmarkImages.length) return;
            landmarkFrameIdx = Math.max(0, Math.min(idx, landmarkImages.length - 1));
            frameImg.src = landmarkImages[landmarkFrameIdx];
            frameCounter.textContent = `Frame ${landmarkFrameIdx + 1} / ${landmarkImages.length}`;
            prevBtn.disabled = landmarkFrameIdx === 0;
            nextBtn.disabled = landmarkFrameIdx === landmarkImages.length - 1;
        }

        prevBtn.addEventListener('click', () => showLandmarkFrame(landmarkFrameIdx - 1));
        nextBtn.addEventListener('click', () => showLandmarkFrame(landmarkFrameIdx + 1));

        // After you generate drawnImages:
        landmarkImages = drawnImages;
        if (landmarkImages.length > 0) {
            landmarkNav.style.display = '';
            showLandmarkFrame(0);
            frameImg.style.display = '';
        } else {
            landmarkNav.style.display = 'none';
            frameImg.style.display = 'none';
        }


    // Catch any errors during matching
    } catch (e) {
        console.error('Match error', e);
        alert('Match failed. See console.');
    // Cleanup
    } finally {
        target.delete();
        refreshButtons();
    }
});

/*-----------------------------------------------------------------------
SHOW ORB DETECTION SECTION   
Get first frame image from shared state and display it in imgA for
ORB detection. */

showOrbBtn.addEventListener('click', async () => {
    console.log('Switching to ORB mode');
    const dataUrl = await getShared('firstFrameImage');
    if (!dataUrl) {
        alert('No shared first frame image found.');
        return;
    }
    
    const res = await fetch(dataUrl); // Fetch the data URL
    const blob = await res.blob(); // Convert to Blob
    
    // Create a File object 
    const file = new File([blob], 'first_frame.png', { type: blob.type });
   
    await loadImg(file, imgA); // Load image into imgA

    imgA.hidden        = false; // show imgA
    imgAReady          = true; // set imgAReady flag
    detectResult       = null; // reset previous detection result
    statsA.textContent = ''; // clear stats A
    canvasA.hidden     = true; // hide canvas A
    
    refreshButtons(); // refresh buttons
});