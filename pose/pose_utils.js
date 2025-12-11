// pose/draw_landmarks.js
// Module to draw pose landmarks and connections on a canvas

import {
    PoseLandmarker, 
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

const leftPointColor = '#FFC400';
const rightPointColor = '#6AECE1';
const connectionColor = 'white';
const cropBoxColor = 'black';
const leftPoints = [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32];
const rightPoints = [1, 2, 3, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
/* DRAW LANDMARKS ON IMAGE
______________________________________________________________________________
Draws pose landmarks and connections on a canvas element overlaid on the image.
______________________________________________________________________________*/

export function drawLandmarksOnImage(canvasEl, img, landmarks, cropBox=null) {
    if (!landmarks || landmarks.length === 0) return;
    
    /* SET UP CANVAS
    --------------------------------------------------------------------------*/
    // Set canvas dimensions to match image dimensions
    canvasEl.width  = img.naturalWidth; 
    canvasEl.height = img.naturalHeight; 
    const ctx       = canvasEl.getContext('2d'); 

    // Clear any previous drawings and draw the image
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);

    /* DRAW CONNECTIONS
    --------------------------------------------------------------------------*/
    // Define normalized landmarks for drawing connections (MediaPipe format)
    const drawingUtils = new DrawingUtils(ctx);
    const normalizedLandmarks = landmarks.map(lm => ({
        x: lm.x / canvasEl.width, 
        y: lm.y / canvasEl.height, 
        visibility: lm.visibility 
    }));
    
    // Draw pose connections
    drawingUtils.drawConnectors(
        normalizedLandmarks, // normalized landmarks
        PoseLandmarker.POSE_CONNECTIONS, // pose connections
        { color: connectionColor , lineWidth: 2 } // drawing style
    );
    
    /* DRAW LANDMARKS
    --------------------------------------------------------------------------*/
    // Draw each landmark as a circle
    landmarks.forEach((lm, idx) => {
        ctx.beginPath(); 
        ctx.arc(lm.x, lm.y, 4, 0, 2 * Math.PI);
        const pointColor = leftPoints.includes(idx) ? leftPointColor :
                        rightPoints.includes(idx) ? rightPointColor :
                        'white'; 
        ctx.fillStyle = pointColor; 
        ctx.fill(); 
    });

    /* DRAW CROP BOX IF PROVIDED
    --------------------------------------------------------------------------*/
    if (cropBox) {
        ctx.strokeStyle = cropBoxColor;
        ctx.lineWidth   = 2;
        ctx.strokeRect(
            cropBox.left, 
            cropBox.top, 
            cropBox.width, 
            cropBox.height
        );
    }



}