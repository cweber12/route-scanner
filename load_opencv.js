// load_opencv.js
// Module to dynamically load OpenCV.js

export function loadOpenCV() {
    return new Promise((resolve, reject) => {
        // If OpenCV is already loaded, resolve immediately
        if (window.cv && (window.cv.Mat || window.cv.getBuildInformation)) {
            resolve();
            return;
        }
        // Create script element to load OpenCV.js
        const script = document.createElement('script');
        // Set the source to the OpenCV.js file path
        script.src = './opencv/opencv.js';
        // Set up onload and onerror handlers
        script.onload = () => {
            cv['onRuntimeInitialized'] = () => {
                window.cvIsReady = true;
                document.dispatchEvent(new Event('cv-ready'));
                resolve();
            };
        };
        script.onerror = reject;
        document.body.appendChild(script);
    });
}