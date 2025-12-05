// pose_landmarker_frame.js
// Pose detection on extracted frames

/* TODO: 
   - Separate pose detection in to its own class 
   - Figure out a more efficient way to normalize and denormalize landmarks
   - dont normalize landmarks at all? 
   */

// Import MediaPipe Tasks Vision bundle
import {
    FilesetResolver,
    PoseLandmarker, 
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";
// Import other modules from directory
import { VideoFrameExtractor } from '../VideoFrameExtractor.js';
import {setShared} from '../shared_state.js'; 
import { drawLandmarksOnImage } from './pose_utils.js'; 


/* DETECT POSE ON FRAMES
---------------------------------------------------------------------------------
Extract frames from video, run pose detection with cropping, and store results. 
Inputs: 
- SEE BOLOW
Outputs:
- poseResults: array of results with structure:
    [ */

export async function runPoseDetectionOnFrames(
    videoEl, // input video element 
    canvasEl, // canvas element for drawing results
    statusEl, // status element to display messages
    poseResults, // output array to hold results
    intervalSeconds, // detect every n seconds 
    frameNav, // frame navigation controls
    cropRect // cropping rectangle for the video
) {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    
    // Create Pose Landmarker instance
    const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        // Use lite model from MediaPipe Model Zoo
        baseOptions: {
            modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU"
        },
        runningMode: "IMAGE", // IMAGE mode for individual images
        numPoses: 1 // Detect one pose
    });

    // Clear previous results
    poseResults.length = 0; // Clear existing results
    let crop           = cropRect ? { ...cropRect } : null; // Initial crop rectangle (if exists) 
    let frameIdx       = 0; // Frame index counter
    let isFirstFrame   = true; // Flag for first frame

    // Initialize VideoFrameExtractor
    const extractor = new VideoFrameExtractor(videoEl, canvasEl);

    /* PROCESS FRAME CALLBACK
    -----------------------------------------------------------------------------*/
    async function processFrame(frameUrl, t, frameWidth, frameHeight) {
        const img = new Image();
        img.src   = frameUrl;
        
        await new Promise(resolve => { img.onload = resolve; });

        // Set shared image as the full frame (first frame only)
        if (isFirstFrame) {
            isFirstFrame = false; // clear flag after first frame
            
            // Create a canvas with the full image size
            const fullFrameCanvas = document.createElement('canvas');
            fullFrameCanvas.width  = img.width; // set canvas to image width
            fullFrameCanvas.height = img.height; // set canvas to image height
            
            // Draw the full image onto the canvas
            const fullFrameCtx = fullFrameCanvas.getContext('2d');
            fullFrameCtx.drawImage(img, 0, 0, img.width, img.height);
            
            // Store as Data URL (or the canvas itself if you prefer)
            setShared('firstFrameImage', fullFrameCanvas.toDataURL());           
        }

        // Snapshot crop for THIS frame
        const cropForThisFrame = crop ? { ...crop } : null;

        // 1. Crop current frame
        const croppedCanvas = document.createElement('canvas');
        const croppedCtx = croppedCanvas.getContext('2d');

        // If cropping is defined, use cropped region
        if (cropForThisFrame) {
            croppedCanvas.width  = cropForThisFrame.width; // set canvas to crop width
            croppedCanvas.height = cropForThisFrame.height; // set canvas to crop height
            
            // Draw the cropped image onto the canvas
            croppedCtx.drawImage(
                img, // source image
                cropForThisFrame.left, // source x
                cropForThisFrame.top, // source y
                cropForThisFrame.width, // source width
                cropForThisFrame.height, // source height
                0, 0, // destination x, y
                cropForThisFrame.width, // destination width
                cropForThisFrame.height // destination height
            );
        
        // Else use full image
        } else {
            croppedCanvas.width  = img.width;
            croppedCanvas.height = img.height;
            croppedCtx.drawImage(img, 0, 0, img.width, img.height);
        }

        // 2. Load cropped image into Pose Landmarker
        const croppedImg = new Image(); // create image for cropped region
        croppedImg.src = croppedCanvas.toDataURL(); // set source to cropped canvas data URL
        
        // Wait for cropped image to load
        await new Promise(resolve => { croppedImg.onload = resolve; });

        // 3. Run pose detection on cropped image
        const result = poseLandmarker.detect(croppedImg);
        
        // 4. Draw landmarks on ORIGINAL frame using cropForThisFrame offset
        let offsetLandmarks = []; // Initialize offset landmarks array
        // Only draw if landmarks detected and crop exists
        if (result.landmarks && result.landmarks.length > 0 && cropForThisFrame) {           
            // Offset 
            for (const landmarkSet of result.landmarks) {
                offsetLandmarks = landmarkSet.map(lm => ({
                    ...lm,
                    x: lm.x * cropForThisFrame.width  + cropForThisFrame.left,
                    y: lm.y * cropForThisFrame.height + cropForThisFrame.top,
                    z: lm.z,
                    visibility: lm.visibility
                }));
                // Draw on original image with offsets
                drawLandmarksOnImage(canvasEl, img, offsetLandmarks, 'lime');
            }
        } 

        // 5. Update crop for next frame by centering original crop size around hips
        if (crop && result.landmarks && result.landmarks.length > 0) {
            const landmarkSet = result.landmarks[0]; // pose landmarks
            const leftHipIdx  = 23; // left hip index
            const rightHipIdx = 24; // right hip index

            // If both hip landmarks are present, recenter crop
            if (landmarkSet[leftHipIdx] && landmarkSet[rightHipIdx]) {
                // compute center x
                const centerX_cropped =
                    (landmarkSet[leftHipIdx].x + landmarkSet[rightHipIdx].x) / 2;
                // compute center y
                const centerY_cropped =
                    (landmarkSet[leftHipIdx].y + landmarkSet[rightHipIdx].y) / 2;

                // Convert cropped center to original frame coordinates
                const centerX_original =
                    crop.left + centerX_cropped * crop.width;
                const centerY_original =
                    crop.top  + centerY_cropped * crop.height;

                // Recenter crop around hips
                crop.left = Math.max(0, Math.round(centerX_original - crop.width / 2));
                crop.top  = Math.max(0, Math.round(centerY_original - crop.height / 2));
                crop.left = Math.min(crop.left, frameWidth  - crop.width);
                crop.top  = Math.min(crop.top,  frameHeight - crop.height);
            }
        }

        // 6. Store results for this frame
        poseResults.push({
            frameIdx: frameIdx++, // current frame index
            time: t, // timestamp in seconds
            frameUrl: canvasEl.toDataURL(), // image with drawn landmarks
            landmarks: offsetLandmarks, // landmarks in original frame coords
            cropRect: cropForThisFrame ? { ...cropForThisFrame } : null // crop used
        });
    }
    
    /* EXTRACT FRAMES AND PROCESS
    -----------------------------------------------------------------------------*/
    await extractor.extractFrames(intervalSeconds, processFrame);

    let currentFrameIdx = 0; // Ensure this is defined at the top

    /* SHOW FRAME WITH LANDMARKS AND CROP
    -----------------------------------------------------------------------------*/
    function showFrame(idx) {
        if (!poseResults.length) return; // no results to show
        
        // Clamp index to valid range
        currentFrameIdx = Math.max(0, Math.min(idx, poseResults.length - 1));
        
        const frameData = poseResults[currentFrameIdx]; // get data for current frame
        const img       = new Image(); // create image to load frame
        img.src         = frameData.frameUrl; // set source to frame data URL
        
        // on image load
        img.onload = () => { 
            // Get display size and determine scaling
            const videoRect = videoEl.getBoundingClientRect(); // get video display rect
            const scaleX = videoRect.width / videoEl.videoWidth; // x scaling factor
            const scaleY = videoRect.height / videoEl.videoHeight; // y scaling factor

            // Set canvas to display size for UI
            canvasEl.width  = videoRect.width; // set canvas to video display width
            canvasEl.height = videoRect.height; // set canvas to video display height
            
            // Get canvas context
            const ctx = canvasEl.getContext('2d');
            
            // Clear and draw the frame image
            ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);

            // Draw the crop box rectangle in display space
            if (frameData.cropRect) {
                ctx.save(); // save context state
                ctx.strokeStyle = 'black'; // crop box color
                ctx.lineWidth   = 1; // crop box line width
                // Draw rectangle
                ctx.strokeRect(
                    frameData.cropRect.left * scaleX, // x position
                    frameData.cropRect.top * scaleY, // y position
                    frameData.cropRect.width * scaleX, // scaled width
                    frameData.cropRect.height * scaleY // scaled height
                );
                ctx.restore();
            }

            // If there are landmarks, draw them in display space
            if (frameData.landmarks && frameData.landmarks.length > 0) {
                // Draw each landmark as a circle
                frameData.landmarks.forEach(lm => {
                    ctx.beginPath();
                    const avgScale = (scaleX + scaleY) / 2;
                    ctx.arc(lm.x * scaleX, lm.y * scaleY, 4 * avgScale, 0, 2 * Math.PI);
                    ctx.fillStyle = 'lime';
                    ctx.fill();
                });
                
                // Draw connectors in display space
                const drawingUtils = new DrawingUtils(ctx);
                const normalizedLandmarks = frameData.landmarks.map(lm => ({
                    x: (lm.x * scaleX) / canvasEl.width,
                    y: (lm.y * scaleY) / canvasEl.height,
                    z: lm.z,
                    visibility: lm.visibility
                }));
                drawingUtils.drawConnectors(
                    normalizedLandmarks,
                    PoseLandmarker.POSE_CONNECTIONS,
                    { color: 'lime', lineWidth: 2 }
                );
            }
        };
    }
    
    /* SETUP FRAME NAVIGATION
    -----------------------------------------------------------------------------*/

    frameNav.style.display = ''; // show frame navigation
    showFrame(currentFrameIdx); // show first frame

    // Previous frame button handler
    frameNav.querySelector('#prevFrameBtn').onclick = () => {
        if (currentFrameIdx > 0) showFrame(currentFrameIdx - 1);
    };
    // Next frame button handler
    frameNav.querySelector('#nextFrameBtn').onclick = () => {
        if (currentFrameIdx < poseResults.length - 1) showFrame(currentFrameIdx + 1);
    };

    // Update status (instructions to user)
    statusEl.innerHTML = 
        `&gt; Poses detected in ${poseResults.length} frames<br>
        &gt; Use prev/next buttons to review frames<br>
        &gt; Click 'Open ORB' and scroll down`;
}