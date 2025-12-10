// pose_landmarker_frame.js
// Pose detection on extracted frames

// Import MediaPipe Tasks Vision bundle
import {
    FilesetResolver,
    PoseLandmarker, 
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

import { VideoFrameExtractor } from '../VideoFrameExtractor.js';
import {setShared} from '../shared_state.js'; 
import { drawLandmarksOnImage } from './pose_utils.js'; 


/* RUN POSE DETECTION ON FRAMES
______________________________________________________________________________
   Extract frames from video at given interval, run pose detection,
   and store results including landmarks and images with drawn landmarks
______________________________________________________________________________*/
export async function runPoseDetectionOnFrames(
    originalVideo,  
    canvasEl, // canvas element for drawing results
    poseResults, // output array to hold results
    intervalSeconds, // detect every n seconds 
    frameNav, // frame navigation controls
    cropRect // cropping rectangle for the video
) {
    
    /* INITIALIZE POSE LANDMARKER
    ---------------------------------------------------------------------------
    vision: MediaPipe vision fileset resolver for loading models
    poseLandmarker: MediaPipe PoseLandmarker instance for pose detection
    --------------------------------------------------------------------------*/
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    
    const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU"
        },
        runningMode: "IMAGE", 
        numPoses: 1 
    });

    /* DETECT POSE LANDMARKS ON A VIDEO FRAME  
    --------------------------------------------------------------------------*/
    async function processFrame(frameUrl, t, frameWidth, frameHeight) {
        const img = new Image();
        img.src   = frameUrl;
        
        await new Promise(resolve => { img.onload = resolve; });

        /* EXTRACT FIRST FRAME FOR ORB DETECTION
        --------------------------------------------------------------------------*/
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

        /* CROP IMAGE FOR POSE DETECTION
        --------------------------------------------------------------------------
           Create cropped image if crop rectangle is defined.
           This helps focus on the subject and improves detection speed.
        --------------------------------------------------------------------------*/
        const cropForThisFrame = crop ? { ...crop } : null;
        const croppedCanvas = document.createElement('canvas');
        const croppedCtx = croppedCanvas.getContext('2d');
        
        // If image was cropped, draw cropped region to cropped canvas
        if (cropForThisFrame) {
            croppedCanvas.width  = cropForThisFrame.width; 
            croppedCanvas.height = cropForThisFrame.height; 
            
            croppedCtx.drawImage(
                img, 
                cropForThisFrame.left,   // source x
                cropForThisFrame.top,    // source y
                cropForThisFrame.width,  // source width
                cropForThisFrame.height, // source height
                0, 0,                    // destination x, y
                cropForThisFrame.width,  // destination width
                cropForThisFrame.height  // destination height
            );
        // If no crop, use full image
        } else {
            croppedCanvas.width  = img.width;
            croppedCanvas.height = img.height;
            croppedCtx.drawImage(img, 0, 0, img.width, img.height);
        }

        // Create new image from cropped canvas to run pose detection on 
        const croppedImg = new Image(); 
        croppedImg.src = croppedCanvas.toDataURL(); 
        await new Promise(resolve => { croppedImg.onload = resolve; });

        /* RUN POSE DETECTION
        -------------------------------------------------------------------------
        Run pose detection on cropped image, offset landmarks back to original 
        image pixel space, and draw landmarks on original image in canvas.
        -------------------------------------------------------------------------*/
        const result = poseLandmarker.detect(croppedImg); 
        let offsetLandmarks = [];
        if (result.landmarks && result.landmarks.length > 0 && cropForThisFrame) {           
            
            for (const landmarkSet of result.landmarks) {
                offsetLandmarks = landmarkSet.map(lm => ({
                    ...lm,
                    x: lm.x * cropForThisFrame.width  + cropForThisFrame.left,
                    y: lm.y * cropForThisFrame.height + cropForThisFrame.top,
                    z: lm.z,
                    visibility: lm.visibility
                }));
                drawLandmarksOnImage(canvasEl, img, offsetLandmarks, 'lime');
            }
        } 

        /* RE-CENTER NEXT FRAME CROP AROUND CURRENT FRAME HIPS
        -------------------------------------------------------------------------
           Allows initial crop to follow the subject if they move in the frame. 
           Avoids using heavy object detection models like YOLO for tracking.
        -------------------------------------------------------------------------*/
        if (crop && result.landmarks && result.landmarks.length > 0) {
            const landmarkSet = result.landmarks[0]; 
            const leftHipIdx = 23; // left hip index
            const rightHipIdx = 24; // right hip index

            // If both hip landmarks are present, recenter crop
            if (landmarkSet[leftHipIdx] && landmarkSet[rightHipIdx]) {
                
                // Get hip coordinates in cropped image space
                const leftHip_x = landmarkSet[leftHipIdx].x;
                const rightHip_x = landmarkSet[rightHipIdx].x;                   
                const leftHip_y = landmarkSet[leftHipIdx].y;
                const rightHip_y = landmarkSet[rightHipIdx].y;

                // Compute center point between hips in cropped space
                const centerX_cropped = (leftHip_x + rightHip_x) / 2;
                const centerY_cropped = (leftHip_y + rightHip_y) / 2;

                // Convert cropped center to original frame coordinates
                const centerX_original = crop.left + centerX_cropped * crop.width;
                const centerY_original = crop.top  + centerY_cropped * crop.height;

                // Center crop around current hip position for next frame
                crop.left = Math.max(0, Math.round(centerX_original - crop.width / 2));
                crop.top  = Math.max(0, Math.round(centerY_original - crop.height / 2));
                crop.left = Math.min(crop.left, frameWidth  - crop.width);
                crop.top  = Math.min(crop.top,  frameHeight - crop.height);
            }
        }

        /* STORE RESULTS FOR THIS FRAME
        -------------------------------------------------------------------------
        time: timestamp in seconds, used for interpolation between frames
        frameUrl: image with drawn landmarks as Data URL
        landmarks: detected landmarks offset to original image pixel space
        cropRect: crop rectangle used for this frame (if any)
        -------------------------------------------------------------------------*/
        poseResults.push({
            time: t, // timestamp in seconds
            frameUrl: canvasEl.toDataURL(), // image with drawn landmarks
            landmarks: offsetLandmarks, // landmarks in original frame coords
            cropRect: cropForThisFrame ? { ...cropForThisFrame } : null // crop used
        });
    }
    
    /* PREPARE FOR FRAME PROCESSING
    -----------------------------------------------------------------------------*/
    poseResults.length = 0; // Clear existing results
    let crop           = cropRect ? { ...cropRect } : null; // Initial crop rectangle (if exists) 
    let isFirstFrame   = true; // Flag for first frame

    // Initialize VideoFrameExtractor
    const extractor = new VideoFrameExtractor(originalVideo, canvasEl);
    
    /* EXTRACT FRAMES AND PROCESS
    -----------------------------------------------------------------------------*/
    await extractor.extractFrames(intervalSeconds, processFrame);

    let currentFrameIdx = 0; // Ensure this is defined at the top

    /* SHOW FRAME WITH LANDMARKS AND CROP
    -----------------------------------------------------------------------------
    function showFrame(idx) {
        if (!poseResults.length) return; // no results to show
        
        // Clamp index to valid range
        currentFrameIdx = Math.max(0, Math.min(idx, poseResults.length - 1));
        
        // Create image for current frame
        const frameData = poseResults[currentFrameIdx]; 
        const img = new Image(); 
        img.src = frameData.frameUrl; 
        
        // When image loads, draw to canvas
        img.onload = () => { 
            
            // Get display size and determine scaling
            const displayedVideo = originalVideo.getBoundingClientRect(); // Displayed video size
            const scaleX = displayedVideo.width / originalVideo.videoWidth; // x scaling factor
            const scaleY = displayedVideo.height / originalVideo.videoHeight; // y scaling factor

            // Set canvas to display size for UI
            canvasEl.width  = displayedVideo.width; // set canvas to video display width
            canvasEl.height = displayedVideo.height; // set canvas to video display height
            
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
    } */
    
    /* SETUP FRAME NAVIGATION
    -----------------------------------------------------------------------------

    frameNav.style.display = ''; // show frame navigation
    showFrame(currentFrameIdx); // show first frame

    // Previous frame button handler
    frameNav.querySelector('#prevFrameBtn').onclick = () => {
        if (currentFrameIdx > 0) showFrame(currentFrameIdx - 1);
    };
    // Next frame button handler
    frameNav.querySelector('#nextFrameBtn').onclick = () => {
        if (currentFrameIdx < poseResults.length - 1) showFrame(currentFrameIdx + 1);
    }; */
    
}