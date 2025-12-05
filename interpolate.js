// interpolate.js
// Module to interpolate between frames of pose landmarks

// Linear interpolation between two arrays of landmarks
function interpolateLandmarks(a, b, alpha) {
    return a.map((lmA, i) => ({
        x: (1 - alpha) * lmA.x + alpha * b[i].x,
        y: (1 - alpha) * lmA.y + alpha * b[i].y
    }));
}

// Interpolate frames
function interpolateFrames(frames, interval) {
    const out = [];
    const steps = 24 * interval;
    for (let i = 0; i < frames.length - 1; i++) {
        const frameA = frames[i];
        const frameB = frames[i + 1];
        out.push(frameA);
        for (let j = 1; j <= steps; j++) {
            const alpha = j / (steps + 1);
            out.push(interpolateLandmarks(frameA, frameB, alpha));
        }
    }
    out.push(frames[frames.length - 1]);
    return out;
}

self.onmessage = function(e) {
    const { frames, interval } = e.data;
    const result = interpolateFrames(frames, interval);
    self.postMessage(result);
};