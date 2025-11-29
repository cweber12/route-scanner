// pose/draw_landmarks.js
// Module to draw pose landmarks and connections on a canvas

import {
    PoseLandmarker, 
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

export function drawLandmarksOnImage(canvasEl, img, landmarks, color = 'lime') {
    // Return if no landmarks
    if (!landmarks || landmarks.length === 0) return;
    
    canvasEl.width  = img.width; // set canvas to image width
    canvasEl.height = img.height; // set canvas to image height
    const ctx       = canvasEl.getContext('2d'); // get 2D context

    // Clear canvas before drawing
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    
    // Draw the image onto the canvas
    ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);

    // Draw points
    landmarks.forEach(lm => {
        ctx.beginPath(); // begin path for point
        ctx.arc(lm.x, lm.y, 4, 0, 2 * Math.PI); // draw circle at landmark
        ctx.fillStyle = color; // set fill color
        ctx.fill(); // fill the circle
    });

    // Define normalized landmarks for drawing connections
    const drawingUtils = new DrawingUtils(ctx);
    const normalizedLandmarks = landmarks.map(lm => ({
        x: lm.x / canvasEl.width, // normalize x coordinate
        y: lm.y / canvasEl.height, // normalize y coordinate
        z: lm.z, // normalized z coordinate
        visibility: lm.visibility // visibility of the landmark
    }));
    
    // Draw pose connections
    drawingUtils.drawConnectors(
        normalizedLandmarks, // normalized landmarks
        PoseLandmarker.POSE_CONNECTIONS, // pose connections
        { color, lineWidth: 2 } // drawing style
    );
}