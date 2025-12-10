// pose_landmarker_frame.js
// Pose detection on extracted frames

import {
    FilesetResolver,
    PoseLandmarker, 
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

import { VideoFrameExtractor } from '../VideoFrameExtractor.js';
import {setShared} from '../shared_state.js'; 
import { drawLandmarksOnImage } from './pose_utils.js'; 

/* RUN POSE DETECTION ON FRAMES
______________________________________________________________________________
Extract frames from video at given interval, run pose detection,and store 
results. 
______________________________________________________________________________*/

export async function runPoseDetectionOnFrames(
    originalVideo,  
    canvasEl, // canvas element for drawing landmarks on original images
    poseResults, // output array to hold results
    intervalSeconds, // detect every n seconds 
    cropRect // cropping rectangle for the video
) {
    
    /* INITIALIZE POSE LANDMARKER
    --------------------------------------------------------------------------- */
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
    --------------------------------------------------------------------------
    This funtion processes single video frames as they are extracted by 
    VideoFrameExtractor. It runs pose detection, draws landmarks, and stores 
    results in poseResults array.
    --------------------------------------------------------------------------*/
    async function processFrame(frameUrl, t, frameWidth, frameHeight) {
        
        /* LOAD FRAME IMAGE
        --------------------------------------------------------------------------*/
        const img = new Image();
        img.src   = frameUrl;        
        await new Promise(resolve => { img.onload = resolve; });

        /* SAVE FIRST FRAME FOR ORB DETECTION
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
        Create cropped image if crop rectangle is defined. This helps focus on the 
        subject and improves detection accuracy and speed.
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
        result contains detected landmarks for the current frame relative to the 
        cropped image.
        -------------------------------------------------------------------------*/
        const result = poseLandmarker.detect(croppedImg); 
        
        /* OFFSET AND DRAW LANDMARKS
        -------------------------------------------------------------------------
        Scaled and offset landmark coordinates to match the original image 
        coordinate space for display and storage. 
        -------------------------------------------------------------------------*/
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
                drawLandmarksOnImage(canvasEl, img, offsetLandmarks);
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
        ------------------------------------------------------------------------- */
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
    
}