// image_utils.js
// Utilities for loading images and converting to cv.Mat

//Internal temporary canvas for image to Mat conversion
const __tmpCanvas = document.createElement('canvas');
const __tmpCtx = __tmpCanvas.getContext('2d', { willReadFrequently: true }); /*

/* LOAD IMAGE
----------------------------------------------------------------------------
Load an uploaded image file into an HTMLImageElement for display and 
processing.
----------------------------------------------------------------------------*/

export function loadImg(file, imgEl) {
    // Return a promise that resolves when the image is loaded
    return new Promise((res, rej) => {
    const r = new FileReader(); // FileReader to read the file
    r.onload = () => { // onload handler for FileReader
        imgEl.onload = () => { // onload handler for image element
            imgEl.hidden = false; // show image element in UI
            res(); 
        };
        imgEl.onerror = rej; // onerror handler for image element
        imgEl.src = r.result; // set image source to FileReader result
    };
    r.onerror = rej; // onerror handler for FileReader
    r.readAsDataURL(file); // read file as data URL
    });
}

/* CREATE MAT FROM IMAGE ELEMENT
-----------------------------------------------------------------------------
Convert an HTMLImageElement to cv.Mat (CV_8UC4) for OpenCV processing.
----------------------------------------------------------------------------*/

export function matFromImageEl(imgEl) {
    // Get image dimensions, use natural size if available
    const w = imgEl.naturalWidth || imgEl.width;
    const h = imgEl.naturalHeight || imgEl.height;
    
    // Define temporary canvas size
    __tmpCanvas.width  = w; // set canvas to natural image width
    __tmpCanvas.height = h; // set canvas to image height
    
    // Draw image to temporary canvas and get pixel data
    __tmpCtx.clearRect(0, 0, w, h); // clear canvas
    __tmpCtx.drawImage(imgEl, 0, 0, w, h); // draw image to canvas
    const imageData = __tmpCtx.getImageData(0, 0, w, h); // get RGBA pixel data

    // Allocate CV_8UC4 Mat and copy RGBA data in
    const mat = window.cv.Mat.zeros(h, w, window.cv.CV_8UC4);
    mat.data.set(imageData.data); // copy RGBA buffer in
    return mat; // return CV_8UC4 Mat
}

/* SHOW IMAGE ON CANVAS COMPATIBLY
-----------------------------------------------------------------------------
Display a cv.Mat on a canvas element, compatible with OpenCV.js builds
that may not include cv.imshow. 
----------------------------------------------------------------------------*/

export function imshowCompat(canvas, mat) {    
    if (window.cv.imshow) { // if the build supports imshow          
        window.cv.imshow(canvas, mat);  // use it directly
        return; // done
    }    
    
    let rgba = mat; // Mat in RGBA format

    // 3 channel RGB -> 4 channel RGBA 
    if (mat.type() === window.cv.CV_8UC3) {
        rgba = new window.cv.Mat(); // Temporary Mat for conversion
        window.cv.cvtColor( mat, rgba, window.cv.COLOR_RGB2RGBA );
    
    // Other types -> 4 channel RGBA
    } else if (mat.type() !== window.cv.CV_8UC4) {
        const tmp = new window.cv.Mat(); // Temporary Mat for conversion
        window.cv.cvtColor( // Convert to RGBA
            mat, // source Mat               
            tmp, // destination Mat
            window.cv.COLOR_RGBA2RGBA // color conversion code
        ); 
        rgba = tmp; // Use converted Mat                                         
    
    // Already RGBA -> clone and use directly
    } else {
        rgba = mat.clone();  
    }
    
    // Create ImageData from the RGBA Mat data
    const imageData = new ImageData(
        new Uint8ClampedArray(rgba.data), // pixel data
        rgba.cols, // width 
        rgba.rows // height
    );
    
    // Resize the canvas 
    canvas.width = rgba.cols; // set canvas width
    canvas.height = rgba.rows; // set canvas height
    
    // Draw ImageData to canvas
    canvas.getContext('2d').putImageData(imageData, 0, 0); 
    rgba.delete(); // clean up temporary Mat
}

/* CONVERT MATCHES TO KEYPOINT ARRAYS
-----------------------------------------------------------------------------
Convert array of cv.DMatch objects to two arrays of matched keypoints with x,y 
coordinates for source and destination images.
-----------------------------------------------------------------------------*/
export function matchesToArray(matches, keypointsA, keypointsB) {

    if (!Array.isArray(matches) || !Array.isArray(keypointsA) || !Array.isArray(keypointsB)) {
        console.warn('Invalid arguments to computeTransformFromMatches');
        return null;
    }

    const sourceMatches = [], targetMatches = []; 
    
    // Save matched keypoints (filter out unmatched)
    for (const m of matches) {
        const s = keypointsA[m.queryIdx]; 
        const t = keypointsB[m.trainIdx]; 
        
        sourceMatches.push({ x: s.x, y: s.y });
        targetMatches.push({ x: t.x, y: t.y });
    }

    if (sourceMatches.length < 4 || targetMatches.length < 4) {
        console.warn('Not enough matches to compute transform');
        return null;
    }
    // Return matched keypoint arrays
    return [sourceMatches, targetMatches];

}