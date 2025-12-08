// orb_module.js
// ORB feature detection and matching

import { setShared } from '../shared_state.js';

export class ORBModule {
  constructor(cv) { 
    this.cv = cv; // OpenCV.js instance
    this._lastCanvasMat = null; // cached canvas Mat for drawing
  }
  
  /*_______________________________________________________________________________
                              PUBLIC METHODS
  _______________________________________________________________________________*/
  
  /* DETECT ORB FEATURES IN IMAGE
  ---------------------------------------------------------------------------------
  Input:
  - srcRGBA: source image as cv.Mat in RGBA format
  - opts: Parameters for ORB detection
  Output:
  - detectResult: object with keypoints, descriptors, width, height
  ---------------------------------------------------------------------------------*/
  detectORB(srcRGBA, opts = {}) {
    const cv = this.cv; 
    
    // Default parameters
    const {
      nfeatures     = 1200, // Number of features to detect
      scaleFactor   = 1.2, // Pyramid scale factor
      nlevels       = 8, // Number of pyramid levels
      edgeThreshold = 31, // Size of the border where features are not detected
      firstLevel    = 0, // Level of pyramid to put source image to
      WTA_K         = 2, // Number of pts that produce each element of descriptor
      scoreType     = cv.ORB_HARRIS_SCORE, // Score type (HARRIS or FAST)
      patchSize     = 31, // Size of the patch used by the rotated BRIEF descriptor
      fastThreshold = 20 // Threshold for FAST corner detector
    } = opts; 

    // 1. Create new Mats and ORB detector
    const gray = new cv.Mat();
    cv.cvtColor(srcRGBA, gray, cv.COLOR_RGBA2GRAY);

    // 2. Create ORB detector with specified parameters
    const orb = new cv.ORB(
      nfeatures, 
      scaleFactor, 
      nlevels, 
      edgeThreshold, 
      firstLevel, 
      WTA_K, 
      scoreType, 
      patchSize, 
      fastThreshold
    );

    // 3. Prepare keypoint vector and descriptor Mat
    const kpVec = new cv.KeyPointVector();
    const des = new cv.Mat();

    // 4. Perform detection and computation
    try {
      // 4.1 Detect and compute
      orb.detectAndCompute(
        gray, // input image (grayscale)
        new cv.Mat(), // mask (none)
        kpVec, // output keypoints
        des // output descriptors
      );

      // 4.2 Serialize keypoints and descriptors
      const keypoints = this._serializeKeypoints(kpVec);
      const descriptors = this._serializeDescriptors(des);

      // 4.3 Return the results
      return { 
        keypoints, // array of keypoints
        descriptors, // descriptors Mat
        width: srcRGBA.cols, // image width
        height: srcRGBA.rows // image height
      };
    
    // 5. Clean up
    } finally {
      orb.delete(); kpVec.delete(); des.delete(); gray.delete();
    }
  }
  
  /* EXPORT JSON WITH SOURCE IMAGE FEATURES
  ---------------------------------------------------------------------------------
  Export detected features to JSON format and download as features.json

  Input:
  - detectResult: result from detectORB
  Output:
  - json: JSON object with features
  ---------------------------------------------------------------------------------*/
  exportJSON(detectResult) {  
    // 1. Get results from detectORB
    const { keypoints, descriptors, width, height } = detectResult;
    
    // 2. Normalize keypoints to [0,1] range
    const normKeypoints = keypoints.map(kp => ({
      ...kp, // spread existing properties
      x: kp.x / width, // normalize x coordinate
      y: kp.y / height // normalize y coordinate
    }));

    // 3. Create JSON object
    const json = {
      version: 1,
      type: "ORB",
      imageSize: { width, height },
      keypoints: normKeypoints,
      descriptors: descriptors ? {
        rows: descriptors.rows,
        cols: descriptors.cols,
        data_b64: this._u8ToB64(descriptors.data)
      } : null
    };

    return json;
  }
  
  /* IMPORT JSON WITH SOURCE IMAGE FEATURES
  ---------------------------------------------------------------------------------
  Import features from JSON features.json

  Input:
  - obj: parsed JSON object
  Output:
  - detectResult: reconstructed detect result
  ---------------------------------------------------------------------------------*/

  importJSON(obj) {  
    // 1. Validate input JSON
    if (!obj || obj.type !== "ORB") throw new Error("Invalid features JSON");
    
    // 2. Extract properties
    const { imageSize, keypoints, descriptors } = obj;
    
    // 3. Return the reconstructed detect result
    return {
      width: imageSize.width, // original image width
      height: imageSize.height, // original image height
      keypoints, 
      descriptors: descriptors ? { 
        rows: descriptors.rows,                  
        cols: descriptors.cols,            
        data: this._b64ToU8(descriptors.data_b64) // Uint8Array data
      } : null // null if no descriptors
    };
  }
  
  /* MATCH KEYPOINTS FROM SOURCE <-> TARGET IMAGE
  ---------------------------------------------------------------------------------
  Match ORB features from source JSON to target image Mat using KNN + ratio test

  Input:
  - sourceJson: JSON data with ORB keypoints/descriptors and original image size  
  - targetMat: cv.Mat of target image (RGBA)
  - opts: matching options { ratio, ransacReprojThreshold }
  
  Output:
  - { matches, homography, numInliers, inlierMask } 
  ---------------------------------------------------------------------------------*/
  
    matchToTarget(sourceJson, targetMat, opts = {}) {  
    // 1. Access OpenCV.js
    const cv = this.cv; 

    // 2. Set matching parameters (set in UI, else defaults)
    const ratio = opts.ratio ?? 0.75;
    const ransacThresh = opts.ransacReprojThreshold ?? 3.0;

    // 3. Validate source JSON descriptors
    if (!sourceJson?.descriptors?.rows || !sourceJson?.descriptors?.cols) {
      throw new Error('Invalid features JSON: missing descriptors');
    }

    // Reconstruct source descriptors Mat
    const srcU8 = sourceJson.descriptors.data 
      // from existing data (Uint8Array)          
      ? new Uint8Array(sourceJson.descriptors.data)
      // or decode from base64      
      : this._b64ToU8(sourceJson.descriptors.data_b64); 

    // 5. Create cv.Mat for source descriptors
    const srcDesc = cv.matFromArray(
      sourceJson.descriptors.rows, 
      sourceJson.descriptors.cols, 
      cv.CV_8U,  // type (unsigned 8-bit)
      srcU8 // data buffer (Uint8Array)
    );

    // 6. Convert target image to grayscale
    const gray = new cv.Mat(); // Grayscale Mat
    cv.cvtColor (  // Convert target to grayscale
      targetMat, 
      gray, 
      cv.COLOR_RGBA2GRAY 
    );

    // 7. Set up ORB detector
    const orb     = new cv.ORB(this._nfeatures || 1200); // ORB detector
    const targetKeypoints   = new cv.KeyPointVector(); 
    const targetDescriptors = new cv.Mat(); 
    const empty   = new cv.Mat(); // Empty mask
    
    // 8. Detect and compute on target image
    orb.detectAndCompute(gray, empty, targetKeypoints, targetDescriptors, false);

    // 9. KNN match (k=2) + ratio test
    const bf = new cv.BFMatcher( // Brute-Force matcher
      cv.NORM_HAMMING, // Hamming distance
      false // crossCheck disabled        
    ); 
    const knn = new cv.DMatchVectorVector(); // Init KNN matches
    bf.knnMatch(srcDesc, targetDescriptors, knn, 2); // Match descriptors

    // 10. Initialize array for good matches
    const good = [];

    // 11. Iterate through KNN matches and apply ratio test
    for (let i = 0; i < knn.size(); i++) {
      const vec = knn.get(i); // DMatchVector (needs delete)
      
      // If there are at least 2 matches
      if (vec.size() >= 2) {  
        const m = vec.get(0); // get first (best) match  
        const n = vec.get(1); // get second match
        
        // If the the distance is withing the ratio threshold
        // push to good matches
        if (m.distance < ratio * n.distance) good.push(m);
      }
      vec.delete(); // cleanup DMatchVector
    }
    knn.delete(); // cleanup KNN matches

    // 12. Estimate homography using RANSAC if enough good matches
    let homographyMatrix = null; 
    let inliers          = 0; 
    let inlierMask       = null; 

    // 13. If at least 4 good matches, compute homography
    if (good.length >= 4) {
      
      // Prepare array for source points
      const srcPts = new cv.Mat(
        good.length, // number of good matches
        1, // single column
        cv.CV_32FC2 // 2-channel float32
      );

      // Prepare array for destination points
      const dstPts = new cv.Mat(
        good.length, // number of good matches
        1, // single column
        cv.CV_32FC2 // 2-channel float32
      );

      // Fill point arrays based on good matches
      const srcW = sourceJson.imageSize?.width  ?? targetMat.cols;
      const srcH = sourceJson.imageSize?.height ?? targetMat.rows;

      for (let i = 0; i < good.length; i++) {
        const m  = good[i]; // current match
        const sN = sourceJson.keypoints[m.queryIdx]; // normalized src KP
        const t  = targetKeypoints.get(m.trainIdx).pt; // target KP point

        // de-normalize to pixel coords on source image A
        const sx = sN.x * srcW; 
        const sy = sN.y * srcH; 
 
        // Set coordinates for ith point in source and destination Mats
        srcPts.data32F[i*2]   = sx; // source x
        srcPts.data32F[i*2+1] = sy; // source y
        dstPts.data32F[i*2]   = t.x; // destination x
        dstPts.data32F[i*2+1] = t.y; // destination y
      }
      
      // Prepare mask for inliers
      const mask = new cv.Mat();

      // Compute homography using RANSAC
      const Hmat = cv.findHomography(
        srcPts, 
        dstPts,
        cv.RANSAC, // method (RANSAC)
        ransacThresh, 
        mask // output mask
      );
      // If homography is found, extract data
      if (!Hmat.empty()) {
        // Convert homography Mat to JS array
        homographyMatrix = Array.from(Hmat.data64F ?? Hmat.data32F);
        // Count inliers from mask
        inliers = cv.countNonZero(mask);
        // Create inlier mask array (boolean)
        inlierMask = Array.from(mask.data).map(v => v !== 0);
      }
      // Cleanup
      srcPts.delete(); // source points Mat
      dstPts.delete(); // destination points Mat
      mask.delete(); // inlier mask Mat
      Hmat.delete(); // homography Mat
    }

    // 14. Cache target KPs for drawMatches
    const targetKeypoints_JS = this._serializeKeypoints(targetKeypoints);
    this._lastDetB = { keypoints: targetKeypoints_JS };

    // 15. Cleanup
    gray.delete(); // grayscale image
    empty.delete(); // empty mask
    targetDescriptors.delete(); // target descriptors
    targetKeypoints.delete(); // target keypoints
    orb.delete(); // ORB detector
    bf.delete(); // brute force matcher
    srcDesc.delete(); // source descriptors

    // 16. Return match results
    return { 
      matches: good, // array of good matches
      homography: homographyMatrix, // homography array (or null)
      numInliers: inliers, // number of inliers
      inlierMask // inlier mask array (or null)
    };
  }

  /* DRAW DETECTED KEYPOINTS ON IMAGE
  ---------------------------------------------------------------------------------
  Display detected keypoints over the image on a canvas
  
  Inputs:  
  - imgRGBA: source image in RGBA format (cv.Mat)
  - keypoints: array of keypoints with x,y coordinates
  - outCanvas: HTML canvas element to draw on 
  ---------------------------------------------------------------------------------*/
  drawKeypoints(imgRGBA, keypoints, outCanvas) {
    const cv = this.cv; // OpenCV.js
    
    // Set output canvas size
    outCanvas.width  = imgRGBA.cols;   
    outCanvas.height = imgRGBA.rows;
    
    // Initialize output Mat
    const out = new cv.Mat( 
      imgRGBA.rows, // height
      imgRGBA.cols, // width
      cv.CV_8UC4, // type
    );
    
    imgRGBA.copyTo(out); // copy source image

    // Loop through keypoints and draw circles
    for (const kp of keypoints) {
      // Draw green circle at keypoint location
      cv.circle(
        out, // target Mat
        new cv.Point( // center point
          Math.round(kp.x), // x coordinate
          Math.round(kp.y) // y coordinate
        ), 
        3, // radius 
        new cv.Scalar(0,255,0,255), // color (green) 
        -1, // filled circle
        cv.LINE_AA // line type (antialiased)
      );
    }
    cv.imshow(outCanvas, out); // display on canvas
    out.delete(); // cleanup
  }

  
  /* DRAW MATCHES BETWEEN IMAGE A <-> IMAGE B
  ---------------------------------------------------------------------------------
  Display both images side by side with matched keypoints and lines connecting them
  
  Inputs:
  - imgA: first image (cv.Mat)
  - imgB: second image (cv.Mat)
  - keypointsA: keypoints from image A (array)
  - keypointsB: keypoints from image B (array)
  - matchRes: result from matchToTarget (matches, inlierMask)
  - originalSizeA: original size of image A {width, height} for denormalization 
  ---------------------------------------------------------------------------------*/
  drawMatches(imgA, imgB, keypointsA, keypointsB, matchRes, originalSizeA) {   
    const cv   = this.cv; // OpenCV.js
    const outH = Math.max(imgA.rows, imgB.rows); // Output height
    const outW = imgA.cols + imgB.cols; // Output width
    
    this._releaseLastCanvasMat(); // Release previous if any
    
    // Create new output Mat
    this._lastCanvasMat = new cv.Mat(
      outH, // output height     
      outW, // output width
      cv.CV_8UC4, // type
      new cv.Scalar(0,0,0,255) // black background
    );

    // Region of Interest (ROI) for image A
    const roiA = this._lastCanvasMat.roi(
      new cv.Rect(
        0, // init x (left)
        0, // init y (top)
        imgA.cols, // width
        imgA.rows // height
      )
    );
    imgA.copyTo(roiA); // copy image A into ROI
    roiA.delete(); // release ROI

    // ROI for image B
    const roiB = this._lastCanvasMat.roi(
      new cv.Rect(
        imgA.cols, // init x (after image A)
        0, // init y (top)
        imgB.cols, // width
        imgB.rows // height
      )
    );
    imgB.copyTo(roiB); // copy image B into ROI
    roiB.delete(); // release ROI
    
    // Determine inlier mask
    const inMask = matchRes.inlierMask;

    // Loop through matches and draw lines + circles
    for (let i = 0; i < matchRes.matches.length; i++) {
      
      const m  = matchRes.matches[i]; // current match
      const p1 = keypointsA[m.queryIdx]; // point from image A
      const p2 = keypointsB[m.trainIdx]; // point from image B
      
      if (!p1 || !p2) continue; // sanity check
      
      // Determine if inlier
      const inlier = inMask ? Boolean(inMask[i]) : true;
      
      // Determine color (green for inlier, red for outlier)
      const color = inlier ? new cv.Scalar(0,255,0,255) : new cv.Scalar(255,0,0,255);

      // Denormalize keypointsA (from normalized [0,1] to pixel coordinates)
      // Use originalSizeA for denormalization
      const a = new cv.Point(
        Math.round(p1.x * imgA.cols),
        Math.round(p1.y * imgA.rows)
      );

      // keypointsB are already in pixel coordinates
      const b = new cv.Point(
        Math.round(p2.x + imgA.cols), // x coordinate (offset by image A width)
        Math.round(p2.y) // y coordinate
      );

      /* DIAGRAM FOR OUTPUT IMAGE LAYOUT
      ------------------------------------------------------------------------------ 

            {   imgA.cols       }{         imgB.cols      }
      (0,0) -----------------------------------------------
            |                  >|                        >|<
            |                >  |                      >  |  <
            |    imgA.rows -->  |          imgB.rows -->  |  <-- outH
            |                  >|                      >  |  <
    empty   --------------------|                        >|<
    space ->////////////////////---------------------------
            {                   outW                      }

      ------------------------------------------------------------------------------ */

      // Draw line between matched keypoints
      cv.line(this._lastCanvasMat, a, b, color, 1, cv.LINE_AA);
      // Draw circles at keypoints
      cv.circle(this._lastCanvasMat, a, 3, color, -1, cv.LINE_AA);
      cv.circle(this._lastCanvasMat, b, 3, color, -1, cv.LINE_AA);
    }
  }

  /*________________________________________________________________________________
                           INTERNAL METHODS
  _________________________________________________________________________________*/

  /* SERIALIZE KEYPOINTVECTOR TO JS ARRAY
  ---------------------------------------------------------------------------------
  Convert OpenCV.js KeyPointVector to JS array of keypoint objects

  Input:
  - kpVec: OpenCV.js KeyPointVector
  Output:
  - out: Array of keypoints [{x, y, size, angle, response, octave, class_id}, ...]    
  ---------------------------------------------------------------------------------*/
  _serializeKeypoints(kpVec) {
    const n = kpVec.size(); // number of keypoints
    const out = [];         // output array  
    // Loop through keypoints
    for (let i=0; i < n; i++) {       
      const k = kpVec.get(i); // get KeyPoint   
      out.push({ // push serialized object
        x:k.pt.x, // point coordinates  
        y:k.pt.y, // point coordinates
        size:k.size, // diameter of the meaningful keypoint area
        angle:k.angle, // orientation
        response:k.response, // response strength
        octave:k.octave, // octave level
        class_id:k.class_id ?? -1 // class_id may be undefined 
      });
    }
    return out; // return array of keypoints
  }

  /* SERIALIZE DESCRIPTORS MAT TO JS OBJECT
  ---------------------------------------------------------------------------------
  Convert OpenCV.js descriptor Mat to JS object with rows, cols, data (Uint8Array)
  
  Input:
  - des: OpenCV.js Mat of descriptors
  Output:
  - out: Object { rows, cols, data (Uint8Array) }    
  ---------------------------------------------------------------------------------*/
  _serializeDescriptors(des) {
    // Check for empty descriptors
    if (!des || des.rows===0 || des.cols===0) return null;
    // Return serialized descriptor object
    return { 
      rows: des.rows, // number of rows 
      cols: des.cols, // number of columns
      data: new Uint8Array(des.data) // copy data to Uint8Array
    };
  }
  
  /* UINT8ARRAY TO BASE64 STRING
  ----------------------------------------------------------------------------------
  Convert Uint8Array to base64 string for JSON serialization

  Input:
    - u8: Uint8Array
  Output:
    - b64: base64 encoded string 
  ----------------------------------------------------------------------------------*/
  _u8ToB64(u8) {
    
    let binary  = ''; // binary string
    const chunk = 0x8000; // chunk size for processing
    
    // Iterate through Uint8Array in chunks
    for (let i=0;i<u8.length;i+=chunk) {
      // Convert each chunk to binary string
      binary += String.fromCharCode.apply(null, u8.subarray(i,i+chunk));
    }
    // Encode binary string to base64
    return btoa(binary);
  }

  /* BASE64 STRING TO UINT8ARRAY
  ----------------------------------------------------------------------------------
  Convert base64 string back to Uint8Array

  Input:
  - b64: base64 encoded string
  Output:
  - u8: Uint8Array 
  ----------------------------------------------------------------------------------*/
  _b64ToU8(b64) {
    const bin = atob(b64); // decode base64 to binary string
    const u8  = new Uint8Array(bin.length); // create Uint8Array
    
    // Iterate through binary string and fill Uint8Array
    for (let i=0;i<bin.length;i++) {
      // Convert each character to its char code
      u8[i]=bin.charCodeAt(i);
    } 
    // Return the Uint8Array
    return u8;
  }

  /* RELEASE LAST CACHED CANVAS MAT
  ----------------------------------------------------------------------------------
  Release the last cached canvas Mat used for drawing matches 
  ----------------------------------------------------------------------------------*/
  _releaseLastCanvasMat(){
    // If there is a cached Mat
    if (this._lastCanvasMat) { 
      this._lastCanvasMat.delete(); // delete it
      this._lastCanvasMat=null; // clear reference
    } 
  }
}
