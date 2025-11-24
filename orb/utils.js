// image_utils.js
// Utilities for loading images and converting to cv.Mat

/*______________________________________________________________________________
LOAD IMAGE

Load an uploaded image file into an HTMLImageElement for display and processing.

Input:
    - file: input File object (from file input)
    - imgEl: HTMLImageElement to load the image into
    - cropBox: crop box HTML element to initialize
Output:
    - Promise that resolves when image is loaded and crop box initialized
______________________________________________________________________________ */

export function loadImg(file, imgEl, cropBox) {
    // Return a promise that resolves when the image is loaded
    return new Promise((res, rej) => {
    const r = new FileReader(); // FileReader to read the file
    r.onload = () => { // onload handler for FileReader
        imgEl.onload = () => { // onload handler for image element
            imgEl.hidden = false; // show image element in UI
            
            // Initialize crop box to cover the entire loaded image
            const imgRect = imgEl.getBoundingClientRect(); // get image A bounding rect 
            cropBox.style.display = 'block'; // show crop box
            cropBox.style.left = '0px';      // align to left
            cropBox.style.top = '0px';       // align to top
            cropBox.style.width = imgRect.width + 'px';   // image width
            cropBox.style.height = imgRect.height + 'px'; // image height
            res(); 
        };
        imgEl.onerror = rej;    // onerror handler for image element
        imgEl.src = r.result;   // set image source to FileReader result
    };
    r.onerror = rej;        // onerror handler for FileReader
    r.readAsDataURL(file);  // read file as data URL
    });
}

/*______________________________________________________________________________
CREATE MAT FROM IMAGE ELEMENT

Convert an HTMLImageElement to cv.Mat (CV_8UC4) for OpenCV processing.

Input:
    - imgEl: HTMLImageElement uploaded in UI
Output:
    - cv.Mat in CV_8UC4 format

Internal temporary canvas for image to Mat conversion and
context for the temporary canvas*/
const __tmpCanvas = document.createElement('canvas');
const __tmpCtx = __tmpCanvas.getContext('2d', { willReadFrequently: true });

/*______________________________________________________________________________ */

export function matFromImageEl(imgEl) {
    // Get image dimensions, use natural size if available
    const w = imgEl.naturalWidth || imgEl.width;
    const h = imgEl.naturalHeight || imgEl.height;
    // Draw the <img> to an offscreen canvas and grab RGBA bytes
    __tmpCanvas.width = w;  // set canvas to image width
    __tmpCanvas.height = h; // set canvas to image height
    __tmpCtx.clearRect(0, 0, w, h);        // clear canvas
    __tmpCtx.drawImage(imgEl, 0, 0, w, h); // draw image to canvas
    const imageData = __tmpCtx.getImageData(0, 0, w, h); // get RGBA pixel data

    // Allocate CV_8UC4 Mat and copy RGBA data in
    const mat = window.cv.Mat.zeros(h, w, window.cv.CV_8UC4);
    mat.data.set(imageData.data); // copy RGBA buffer in
    return mat;                   // return CV_8UC4 Mat
}

/* ___________________________________________________________________________
DETERMINE CROP AREA 

Scales the crop box coordinates from rendered size to natural image size.
    - ensures the cropped area is the same as the area selected in UI. 
    - accounts for image resizing in the browser with CSS.
    - ensures correct mapping of detected points back to original image.
    
Input:
    - imgEl: HTMLImageElement
    - cropBoxEl: crop box HTML element
Output:
    - crop rectangle: { x, y, width, height } in image natural coordinates
___________________________________________________________________________

Diagram reference for coordinate calculations:

(imgRect.left, imgRect.top)
    |
    V    (cropRect.left, cropRect.top)
    -----|----------------------------- 
    |    |                            |  
    |    |      imgEl                 |    
    |    |                            |
    |    |                            |
    |    V                            |
    |    ----------------------       | 
    |    |                    |       |
    |    |     cropBoxEl      |       |
    |    |                    |       |
    |    |                    |       |
    |    ---------------------- <-----|---- (cropRect.width, cropRect.height)
    |                                 |
    ----------------------------------- <-- (imgRect.width, imgRect.height)
____________________________________________________________________________ */

export function getCropRectGeneric(imgEl, cropBoxEl) {
    const imgRect = imgEl.getBoundingClientRect();      // rendered image rect
    const cropRect = cropBoxEl.getBoundingClientRect(); // crop box rect
    
    /*Calculate scale factors between natural image size and displayed size
        - naturalWidth/Height: original image size
        - imgRect.width/height: displayed size when rendered in browser */
    const scaleX = imgEl.naturalWidth / imgRect.width;   // scale factor X
    const scaleY = imgEl.naturalHeight / imgRect.height; // scale factor Y   
    
    // Calculate crop rectangle in natural image coordinates 
    // NOTE: See diagram above for coordinate reference
    const result = {    
        x: Math.round((cropRect.left - imgRect.left) * scaleX),
        y: Math.round((cropRect.top - imgRect.top) * scaleY),
        width: Math.round(cropRect.width * scaleX),
        height: Math.round(cropRect.height * scaleY)
    };

    return result;
       
}

/* ___________________________________________________________________________
CROP IMAGE

Crop the full image element using the scaled crop rectangle returned by 
getCropRectGeneric() and return a canvas element with the cropped image.

Input:
  - imgEl: HTMLImageElement
  - cropRect: { x, y, width, height }
Output:
  - cropped canvas element for cropped detection area
____________________________________________________________________________ */

export function cropImage(imgEl, cropRect) {
    // Create a canvas to hold the cropped image
    const cropCanvas = document.createElement('canvas');
    
    // Set the canvas size to the crop rectangle size and draw the cropped image
    cropCanvas.width = cropRect.width; 
    cropCanvas.height = cropRect.height;
    const ctx = cropCanvas.getContext('2d');
    ctx.drawImage(
        imgEl,           // Source image element
        cropRect.x,      // Source X 
        cropRect.y,      // Source Y
        cropRect.width,  // Source width
        cropRect.height, // Source height
        0,0,             // Dest X, Y
        cropRect.width,  // Dest width
        cropRect.height  // Dest height
    );
    
    return cropCanvas; // Return the cropped canvas for detection
}


/* ___________________________________________________________________________
SAVE MATCHES TO ARRAYS

Transform computation from matched keypoints between two sets of ORB features

Input:
  - matches: array of match objects with queryIdx and trainIdx
  - keypointsA: array of keypoints from image A (normalized coordinates)
  - keypointsB: array of keypoints from image B (pixel coordinates)
  - imageSizeA: size of image A { width, height } for denormalization
Output:
  - [ matchedSrc, matchedDst ]: arrays of matched keypoints in pixel coordinates

____________________________________________________________________________ */

export function matchesToArray(matches, keypointsA, keypointsB, imageSizeA) {
    // Validate inputs
    if (!Array.isArray(matches) || !Array.isArray(keypointsA) || !Array.isArray(keypointsB)) {
        console.warn('Invalid arguments to computeTransformFromMatches');
        return null;
    }

    // Build matched keypoint arrays in pixel coordinates
    const matchedSrc = []; // from image A
    const matchedDst = []; // from image B
    // Loop over matches and extract corresponding matched keypoints from both sets
    for (const m of matches) {
        const s = keypointsA[m.queryIdx];  // Source keypoint (normalized, from keypointsA)
        const t = keypointsB[m.trainIdx];  // Target keypoint (pixel, from keypointsB)
        // Push filtered source keypoints
        matchedSrc.push({ 
            x: s.x * imageSizeA.width, // denormalized (pixel) x
            y: s.y * imageSizeA.height // denormalized (pixel) y
        });
        // Push filtered target keypoints
        matchedDst.push({ 
            x: t.x, // pixel x
            y: t.y  // pixel y 
        });
    }

    // Ensure enough matches to compute transform
    if (matchedSrc.length < 4 || matchedDst.length < 4) {
        console.warn('Not enough matches to compute transform');
        return null;
    }
    // Return matched keypoint arrays
    return [matchedSrc, matchedDst];

}