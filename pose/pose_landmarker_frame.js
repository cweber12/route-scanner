// pose_landmarker_frame.js
// Pose detection on extracted frames

// Import MediaPipe Tasks Vision bundle
import {
    FilesetResolver,
    PoseLandmarker, 
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";
import { VideoFrameExtractor } from './video_frame_extractor.js';
import {getShared, setShared} from '../shared_state.js';    

// Run pose detection on extracted video frames at specified interval
export async function runPoseDetectionOnFrames(
    videoEl,            // input video element 
    canvasEl,           // canvas element for drawing results
    statusEl,           // status element to display messages
    poseResults,        // output array to hold results
    intervalSeconds,    // detect every n seconds 
    frameNav,           // frame navigation controls
    frameCounter,       // frame counter display
    cropRect            // cropping rectangle for the video
) {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    
    // Create Pose Landmarker
    const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        // Use lite model from MediaPipe Model Zoo
        baseOptions: {
            modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU"
        },
        runningMode: "IMAGE", // IMAGE mode for individual images
        numPoses: 1           // Detect one pose
    });

    // Clear previous results
    poseResults.length = 0;
    let crop = cropRect ? { ...cropRect } : null;
    let frameIdx = 0;
    let isFirstFrame = true;

    // Initialize VideoFrameExtractor
    const extractor = new VideoFrameExtractor(videoEl, canvasEl);

    // Extract frames and run pose detection
    await extractor.extractFrames(intervalSeconds, async (frameUrl, t, frameWidth, frameHeight) => {
        const img = new Image();
        img.src = frameUrl;
        await new Promise(resolve => { img.onload = resolve; });

        // Set shared image as the full frame (first frame only)
        if (isFirstFrame) {
            isFirstFrame = false;
            // Create a canvas with the full frame size
            const fullFrameCanvas = document.createElement('canvas');
            fullFrameCanvas.width = img.width;
            fullFrameCanvas.height = img.height;
            const fullFrameCtx = fullFrameCanvas.getContext('2d');
            fullFrameCtx.drawImage(img, 0, 0, img.width, img.height);
            // Store as Data URL (or the canvas itself if you prefer)
            setShared('firstFrameImage', fullFrameCanvas.toDataURL());           
        }

        // Snapshot crop for THIS frame
        const cropForThisFrame = crop ? { ...crop } : null;

        // --- 1) Crop current frame ---
        const croppedCanvas = document.createElement('canvas');
        const croppedCtx = croppedCanvas.getContext('2d');

        if (cropForThisFrame) {
            croppedCanvas.width = cropForThisFrame.width;
            croppedCanvas.height = cropForThisFrame.height;
            croppedCtx.drawImage(
                img,
                cropForThisFrame.left, cropForThisFrame.top,
                cropForThisFrame.width, cropForThisFrame.height,
                0, 0, cropForThisFrame.width, cropForThisFrame.height
            );
        } else {
            croppedCanvas.width  = img.width;
            croppedCanvas.height = img.height;
            croppedCtx.drawImage(img, 0, 0, img.width, img.height);
        }

        // --- 2) Detect on cropped image ---
        const croppedImg = new Image();
        croppedImg.src = croppedCanvas.toDataURL();
        await new Promise(resolve => { croppedImg.onload = resolve; });

        const result = poseLandmarker.detect(croppedImg);

        // --- 3) Draw landmarks on ORIGINAL frame using cropForThisFrame ---
        canvasEl.width = frameWidth;
        canvasEl.height = frameHeight;
        const ctx = canvasEl.getContext('2d');
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(img, 0, 0, frameWidth, frameHeight);

        let offsetLandmarks = [];

        if (result.landmarks && result.landmarks.length > 0 && cropForThisFrame) {
            const drawingUtils = new DrawingUtils(ctx);

            for (const landmarkSet of result.landmarks) {
                offsetLandmarks = landmarkSet.map(lm => ({
                    ...lm,
                    x: lm.x * cropForThisFrame.width  + cropForThisFrame.left,
                    y: lm.y * cropForThisFrame.height + cropForThisFrame.top,
                    z: lm.z,
                    visibility: lm.visibility
                }));

                // Draw points
                offsetLandmarks.forEach(lm => {
                    ctx.beginPath();
                    ctx.arc(lm.x, lm.y, 4, 0, 2 * Math.PI);
                    ctx.fillStyle = 'lime';
                    ctx.fill();
                });


                // Draw connectors using full-frame normalized coords
                const normalizedLandmarks = offsetLandmarks.map(lm => ({
                    x: lm.x / canvasEl.width,
                    y: lm.y / canvasEl.height,
                    z: lm.z,
                    visibility: lm.visibility
                }));
                drawingUtils.drawConnectors(
                    normalizedLandmarks,
                    PoseLandmarker.POSE_CONNECTIONS,
                    { color: 'lime', lineWidth: 2 }
                );
            }
        }

        // --- 4) Now update `crop` for the NEXT frame ---
        if (crop && result.landmarks && result.landmarks.length > 0) {
            const landmarkSet = result.landmarks[0];
            const leftHipIdx = 23;
            const rightHipIdx = 24;

            if (landmarkSet[leftHipIdx] && landmarkSet[rightHipIdx]) {
                const centerX_cropped =
                    (landmarkSet[leftHipIdx].x + landmarkSet[rightHipIdx].x) / 2;
                const centerY_cropped =
                    (landmarkSet[leftHipIdx].y + landmarkSet[rightHipIdx].y) / 2;

                const centerX_original =
                    crop.left + centerX_cropped * crop.width;
                const centerY_original =
                    crop.top  + centerY_cropped * crop.height;

                crop.left = Math.max(0, Math.round(centerX_original - crop.width / 2));
                crop.top  = Math.max(0, Math.round(centerY_original - crop.height / 2));
                crop.left = Math.min(crop.left, frameWidth  - crop.width);
                crop.top  = Math.min(crop.top,  frameHeight - crop.height);
            }
        }

        poseResults.push({
            frameIdx: frameIdx++,
            frameUrl: canvasEl.toDataURL(),
            landmarks: offsetLandmarks,
            cropRect: cropForThisFrame ? { ...cropForThisFrame } : null
        });

    });

    let currentFrameIdx = 0; // Ensure this is defined at the top

    function showFrame(idx) {
        if (!poseResults.length) return;
        currentFrameIdx = Math.max(0, Math.min(idx, poseResults.length - 1));
        const frameData = poseResults[currentFrameIdx];
        const img = new Image();
        img.src = frameData.frameUrl;
        img.onload = () => {
            // Get display size and scaling factors
            const videoRect = videoEl.getBoundingClientRect();
            const scaleX = videoRect.width / videoEl.videoWidth;
            const scaleY = videoRect.height / videoEl.videoHeight;

            // Set canvas to display size for UI
            canvasEl.width = videoRect.width;
            canvasEl.height = videoRect.height;
            const ctx = canvasEl.getContext('2d');
            ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);

            // Draw the crop box rectangle in display space
            if (frameData.cropRect) {
                ctx.save();
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    frameData.cropRect.left * scaleX,
                    frameData.cropRect.top * scaleY,
                    frameData.cropRect.width * scaleX,
                    frameData.cropRect.height * scaleY
                );
                ctx.restore();
            }

            // Draw landmarks for this frame in display space
            if (frameData.landmarks && frameData.landmarks.length > 0) {
                frameData.landmarks.forEach(lm => {
                    ctx.beginPath();
                    ctx.arc(lm.x * scaleX, lm.y * scaleY, 4, 0, 2 * Math.PI);
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
            frameCounter.textContent = `Frame ${currentFrameIdx + 1} / ${poseResults.length}`;
        };
    }
    
    frameNav.style.display = '';
    showFrame(currentFrameIdx);

    frameNav.querySelector('#prevFrameBtn').onclick = () => {
        if (currentFrameIdx > 0) showFrame(currentFrameIdx - 1);
    };
    frameNav.querySelector('#nextFrameBtn').onclick = () => {
        if (currentFrameIdx < poseResults.length - 1) showFrame(currentFrameIdx + 1);
    };

    statusEl.textContent = "Finished pose detection, review frames below.";
}