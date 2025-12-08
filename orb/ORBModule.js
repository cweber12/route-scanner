// orb_module.js
// ORB feature detection and matching

import { setShared } from '../shared_state.js';

import {matFromImageEl} from './orb_utils.js'

export class ORBModule {
  constructor(cv) { 
    this.cv = cv; // OpenCV.js instance
  }
  
  /*_______________________________________________________________________________
                              PUBLIC METHODS
  _______________________________________________________________________________*/
  
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

    // Create new Mats and ORB detector
    const gray = new cv.Mat();
    cv.cvtColor(srcRGBA, gray, cv.COLOR_RGBA2GRAY);

    const orbDetector = new cv.ORB(
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
      orbDetector.detectAndCompute(
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
        keypoints, 
        descriptors, 
        width: srcRGBA.cols,
        height: srcRGBA.rows 
      };
    
    } finally {
      orbDetector.delete(); 
      kpVec.delete(); 
      des.delete(); 
      gray.delete();
    }
  }
  
  /* CREATE JSON WITH DETECTION RESULTS
  ________________________________________________________________________ */

  exportJSON(detectResult) {  

    const { keypoints, descriptors, width, height } = detectResult;
    
    const normalizedKeypoints = keypoints.map(kp => ({
      ...kp, 
      x: kp.x / width, 
      y: kp.y / height 
    }));

    const json = {
      version: 1,
      type: "ORB",
      imageSize: { width, height },
      keypoints: normalizedKeypoints,
      descriptors: descriptors ? {
        rows: descriptors.rows,
        cols: descriptors.cols,
        data_b64: this._u8ToB64(descriptors.data)
      } : null
    };

    return json;
  }

  /* MATCH KEYPOINTS FROM SOURCE <-> TARGET IMAGE
  _______________________________________________________________________________ */

  matchFeatures(orbDataA, orbDataB, opts = {}) {  

    console.log('imgA Keypoints: ', orbDataA.keypoints);
    console.log('imgB Keypoints: ', orbDataB.keypoints);
    console.log('A descriptors:', orbDataA.descriptors.rows, orbDataA.descriptors.cols, orbDataA.descriptors.data.length);
    console.log('B descriptors:', orbDataB.descriptors.rows, orbDataB.descriptors.cols, orbDataB.descriptors.data.length);
    
    if (!orbDataA?.descriptors?.rows || !orbDataA?.descriptors?.cols) {
      throw new Error('No source descriptors');
    }

    if (!orbDataB?.descriptors?.rows || !orbDataB?.descriptors?.cols) {
        throw new Error('No target descriptors');
    }
    
    const cv = this.cv; 

    const ratio        = opts.ratio ?? 0.75;
    const ransacThresh = opts.ransacReprojThreshold ?? 3.0;
    
    const targetDescriptorMat = cv.matFromArray(
      orbDataB.descriptors.rows,
      orbDataB.descriptors.cols,
      cv.CV_8U,
      orbDataB.descriptors.data
    );

    // Reconstruct source descriptors Mat
    const srcU8 = new Uint8Array(orbDataA.descriptors.data);
    // Create cv.Mat for source descriptors
    const sourceDescriptorMat = cv.matFromArray(
      orbDataA.descriptors.rows, 
      orbDataA.descriptors.cols, 
      cv.CV_8U,  // type (unsigned 8-bit)
      srcU8 // data buffer (Uint8Array)
    );

    const bruteForceMatcher = new cv.BFMatcher( // Brute-Force matcher
      cv.NORM_HAMMING, // Hamming distance
      false // crossCheck disabled        
    ); 
    const knn = new cv.DMatchVectorVector(); // Init KNN matches
    bruteForceMatcher.knnMatch(sourceDescriptorMat, targetDescriptorMat, knn, 2); // Match descriptors

    const good = [];

    for (let i = 0; i < knn.size(); i++) {
      const vec = knn.get(i); 
      
      if (vec.size() >= 2) {  
        const m = vec.get(0); 
        const n = vec.get(1); 
        
        if (m.distance < ratio * n.distance) good.push(m);
      }
      vec.delete(); 
    }
    knn.delete();

    let homographyMatrix = null; 
    let inliers          = 0; 
    let inlierMask       = null; 

    if (good.length >= 4) {    
      // Prepare array for source points
      const srcPts = new cv.Mat(
        good.length, 
        1, 
        cv.CV_32FC2 
      );

      // Prepare array for destination points
      const dstPts = new cv.Mat(
        good.length, 
        1, 
        cv.CV_32FC2 
      );

      for (let i = 0; i < good.length; i++) {
        const m  = good[i]; // current match
        const s = orbDataA.keypoints[m.queryIdx]; // normalized src KP
        const t  = orbDataB.keypoints[m.trainIdx]; // target KP point
 
        // Set coordinates for ith point in source and destination Mats
        srcPts.data32F[i*2]   = s.x; // source x
        srcPts.data32F[i*2+1] = s.y; // source y
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

    bruteForceMatcher.delete(); // brute force matcher
    sourceDescriptorMat.delete(); 
    targetDescriptorMat.delete(); 

    console.log('good matches: ', good.length);
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
  - matchRes: result from matchFeatures (matches, inlierMask)
  - originalSizeA: original size of image A {width, height} for denormalization 
  ---------------------------------------------------------------------------------*/
  drawMatches(imgA, imgB, keypointsA, keypointsB, matchRes) {      
    const cv   = this.cv; // OpenCV.js

    const matrixA = matFromImageEl(imgA);
    const matrixB = matFromImageEl(imgB);

    const outH = Math.max(matrixA.rows, matrixB.rows); // Output height
    const outW = matrixA.cols + matrixB.cols; // Output width
    
    // Create new output Mat
    const drawnMatches = new cv.Mat(
      outH, // output height     
      outW, // output width
      cv.CV_8UC4, // type
      new cv.Scalar(0,0,0,255) // black background
    );

    // Region of Interest (ROI) for image A
    const roiA = drawnMatches.roi(
      new cv.Rect(
        0, // init x (left)
        0, // init y (top)
        matrixA.cols, // width
        matrixA.rows // height
      )
    );
    matrixA.copyTo(roiA); // copy image A into ROI
    roiA.delete(); // release ROI

    // ROI for image B
    const roiB = drawnMatches.roi(
      new cv.Rect(
        matrixA.cols, // init x (after image A)
        0, // init y (top)
        matrixB.cols, // width
        matrixB.rows // height
      )
    );
    matrixB.copyTo(roiB); // copy image B into ROI
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
      
      const GREEN = new cv.Scalar(0, 255, 0, 255);
      const RED   = new cv.Scalar(255, 0, 0, 255);

      const color = inlier ? GREEN : RED;

      const pointA = new cv.Point(
        Math.round(p1.x * matrixA.cols),
        Math.round(p1.y * matrixA.rows)
      );

      const pointB = new cv.Point(
        Math.round(p2.x + matrixA.cols), 
        Math.round(p2.y)
      );

      cv.line(drawnMatches, pointA, pointB, color, 1, cv.LINE_AA);
      cv.circle(drawnMatches, pointA, 3, color, -1, cv.LINE_AA);
      cv.circle(drawnMatches, pointB, 3, color, -1, cv.LINE_AA);

    }

    matrixA.delete();
    matrixB.delete();

    return drawnMatches;
  }

      /* DIAGRAM FOR OUTPUT IMAGE LAYOUT
      ------------------------------------------------------------------------------ 

            {   matrixA.cols   } {         matrixB.cols    }
      (0,0) -----------------------------------------------
            |                  >|                        >|<
            |                >  |                      >  |  <
            | matrixA.rows -->  |       matrixB.rows -->  |  <-- outH
            |                  >|                      >  |  <
    empty   --------------------|                        >|<
    space ->////////////////////---------------------------
            {                   outW                      }

      ------------------------------------------------------------------------------ */

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

}
