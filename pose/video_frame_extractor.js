// video_frame_extractor.js
// Extract frames from a video element into a canvas
export class VideoFrameExtractor {

    constructor(videoEl, canvasEl) {
        this.videoEl = videoEl; // HTMLVideoElement
        this.canvasEl = canvasEl; // HTMLCanvasElement
    }

    // Extract frames every n secons and process each frame with a callback
    async extractFrames(n, processFrameCallback) {
        // Check if video is loaded
        if (!this.videoEl.src) throw new Error('No video loaded');

        // Get video duration
        const duration = this.videoEl.duration;

        // Loop through video duration in steps of n seconds
        for (let t = 0; t < duration; t += n) {
            // Seek to time t and draw frame to canvas
            await new Promise((resolve, reject) => {
                // Seek video to time t
                this.videoEl.currentTime = t; 
                // When seeked, draw frame to canvas
                this.videoEl.onseeked = async () => {
                    // Set canvas size to video size
                    this.canvasEl.width = this.videoEl.videoWidth;              
                    this.canvasEl.height = this.videoEl.videoHeight;
                    const ctx = this.canvasEl.getContext('2d');
                    ctx.drawImage(
                        this.videoEl, 
                        0, 0, 
                        this.canvasEl.width, 
                        this.canvasEl.height
                    );
                    // Get frame data URL
                    const frameDataUrl = this.canvasEl.toDataURL();
                    try {
                        // Call the callback with frame data to process
                        if (processFrameCallback) {
                            await processFrameCallback(
                                frameDataUrl, 
                                t, 
                                this.canvasEl.width, 
                                this.canvasEl.height
                            );
                        }
                        // Resolve promise to continue loop
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                };
                this.videoEl.onerror = reject;
            });
        }
    }
}