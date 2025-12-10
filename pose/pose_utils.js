// pose/draw_landmarks.js
// Module to draw pose landmarks and connections on a canvas

import {
    PoseLandmarker, 
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

const pointColor = 'red';
const color = 'lime';

/* DRAW LANDMARKS ON IMAGE
______________________________________________________________________________
Draws pose landmarks and connections on a canvas element overlaid on the image.
______________________________________________________________________________*/

export function drawLandmarksOnImage(canvasEl, img, landmarks) {
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
        { color , lineWidth: 2 } // drawing style
    );
    
    /* DRAW LANDMARKS
    --------------------------------------------------------------------------*/
    // Draw each landmark as a circle
    landmarks.forEach(lm => {
        ctx.beginPath(); 
        ctx.arc(lm.x, lm.y, 4, 0, 2 * Math.PI); 
        ctx.fillStyle = pointColor; 
        ctx.fill(); 
    });

}