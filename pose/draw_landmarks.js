// pose/draw.js
// Module to draw pose landmarks and connections on a canvas

import {
    PoseLandmarker, 
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

export function drawLandmarksOnImage(canvasEl, img, landmarks, color = 'lime') {
    if (!landmarks || landmarks.length === 0) return;
    canvasEl.width = img.width;
    canvasEl.height = img.height;
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);

    // Draw points
    landmarks.forEach(lm => {
        ctx.beginPath();
        ctx.arc(lm.x, lm.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
    });

    // Draw connectors using normalized coordinates
    const drawingUtils = new DrawingUtils(ctx);
    const normalizedLandmarks = landmarks.map(lm => ({
        x: lm.x / canvasEl.width,
        y: lm.y / canvasEl.height,
        z: lm.z,
        visibility: lm.visibility
    }));
    drawingUtils.drawConnectors(
        normalizedLandmarks,
        PoseLandmarker.POSE_CONNECTIONS,
        { color, lineWidth: 2 }
    );
}