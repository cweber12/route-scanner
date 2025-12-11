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
  
  detectORB(srcRGBA, opts = {}, cropX, cropY) {
    
    // Default parameters
    const {
      nfeatures = 1200, 
      scaleFactor = 1.2, 
      nlevels = 8, 
      edgeThreshold = 31, 
      firstLevel = 0, 
      WTA_K = 2, 
      scoreType = this.cv.ORB_HARRIS_SCORE, 
      patchSize = 31, 
      fastThreshold = 20
    } = opts; 

    // Create new Mats and ORB detector
    const gray = new this.cv.Mat();
    this.cv.cvtColor(srcRGBA, gray,this.cv.COLOR_RGBA2GRAY);

    const orbDetector = new this.cv.ORB(
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
    const kpVec = new this.cv.KeyPointVector();
    const des = new this.cv.Mat();

    // 4. Perform detection and computation
    try {
      // 4.1 Detect and compute
      orbDetector.detectAndCompute(
        gray, // input image (grayscale)
        new this.cv.Mat(), // mask (none)
        kpVec, // output keypoints
        des // output descriptors
      );

      // 4.2 Serialize keypoints and descriptors
      const keypoints = this._serializeKeypoints(kpVec);
      const descriptors = this._serializeDescriptors(des);

      if (cropX || cropY > 0) {
        // Adjust keypoint coordinates to full image space
        for (const kp of keypoints) {
          kp.x += cropX; // adjust x coordinate
          kp.y += cropY; // adjust y coordinate
        }
      }

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
  _______________________________________________________________________________
  Matches source <-> target ORB features using Brute-Force matcher
  Reference: https://docs.opencv.org/4.x/dc/dc3/tutorial_py_matcher.html
  _______________________________________________________________________________ */
  matchFeatures(source, target, opts = {}) {  
    
    // Validate source descriptors
    if (!source?.descriptors?.rows || !source?.descriptors?.cols) {
      throw new Error('No source descriptors');
    }
    // Validate target descriptors
    if (!target?.descriptors?.rows || !target?.descriptors?.cols) {
        throw new Error('No target descriptors');
    }

    // Create Mats from source descriptors
    // NOTE: source descriptors are stored as Base64 string in JSON
    // and need to be converted back to Uint8Array for matFromArray
    const sourceDescriptorMat = this.cv.matFromArray(
      source.descriptors.rows, 
      source.descriptors.cols, 
      this.cv.CV_8U, 
      new Uint8Array(source.descriptors.data) 
    );
    
    // Create Mats from target descriptors
    const targetDescriptorMat =this.cv.matFromArray(
      target.descriptors.rows,
      target.descriptors.cols,
      this.cv.CV_8U,
      target.descriptors.data
    );

    // Initialize Brute-Force matcher
    const bruteForceMatcher = new this.cv.BFMatcher( 
      this.cv.NORM_HAMMING, 
      false         
    ); 
    
    // Perform knnMatch to get 2 nearest neighbors for each descriptor 
    const matchVectors = new this.cv.DMatchVectorVector(); 
    bruteForceMatcher.knnMatch(
      sourceDescriptorMat, 
      targetDescriptorMat, 
      matchVectors, 
      2 
    ); 

    const goodMatches = [];

    // Apply Lowe's ratio test to filter good matches
    for (let i = 0; i < matchVectors.size(); i++) {
      const vec = matchVectors.get(i);      
      if (vec.size() >= 2) {  
        const m = vec.get(0); 
        const n = vec.get(1);         
        if (m.distance < opts.ratio * n.distance) goodMatches.push(m);
      }
      vec.delete(); 
    }
    matchVectors.delete();

    let homographyMatrix = null; 
    let inliers          = 0; 
    let inlierMask       = null; 

    if (goodMatches.length >= 4) {    
      // Prepare array for source points
      const srcPts = new this.cv.Mat(goodMatches.length, 1, this.cv.CV_32FC2);

      // Prepare array for destination points
      const dstPts = new this.cv.Mat(goodMatches.length, 1,this.cv.CV_32FC2);

      for (let i = 0; i < goodMatches.length; i++) {
        const m  = goodMatches[i]; // current match
        const s = source.keypoints[m.queryIdx]; // normalized src KP
        const t  = target.keypoints[m.trainIdx]; // target KP point
 
        // Set coordinates for ith point in source and destination Mats
        srcPts.data32F[i*2]   = s.x; // source x
        srcPts.data32F[i*2+1] = s.y; // source y
        dstPts.data32F[i*2]   = t.x; // destination x
        dstPts.data32F[i*2+1] = t.y; // destination y
      }
      
      // Prepare mask for inliers
      const mask = new this.cv.Mat();

      // Compute homography using RANSAC
      const Hmat =this.cv.findHomography(
        srcPts, 
        dstPts,
       this.cv.RANSAC, 
        opts.ransacThresh, 
        mask 
      );

      if (!Hmat.empty()) {
        homographyMatrix = Array.from(Hmat.data64F ?? Hmat.data32F);
        inliers =this.cv.countNonZero(mask);
        inlierMask = Array.from(mask.data).map(v => v !== 0);
      }

      srcPts.delete(); // source points Mat
      dstPts.delete(); // destination points Mat
      mask.delete(); // inlier mask Mat
      Hmat.delete(); // homography Mat
    }

    bruteForceMatcher.delete(); 
    sourceDescriptorMat.delete(); 
    targetDescriptorMat.delete(); 

    console.log('good matches: ', goodMatches.length);

    return { 
      matches: goodMatches, 
      homography: homographyMatrix, 
      numInliers: inliers, 
      inlierMask 
    };
  }

  /* DRAW DETECTED KEYPOINTS ON IMAGE
  ______________________________________________________________________*/

  drawKeypoints(imgRGBA, keypoints, outCanvas) {
    
    // Set output canvas size
    outCanvas.width  = imgRGBA.cols;   
    outCanvas.height = imgRGBA.rows;
    
    // Initialize output Mat
    const out = new this.cv.Mat( 
      imgRGBA.rows, // height
      imgRGBA.cols, // width
     this.cv.CV_8UC4, // type
    );
    
    imgRGBA.copyTo(out); // copy source image
  
    // Loop through keypoints and draw circles
    for (const kp of keypoints) {
      // Draw green circle at keypoint location
      this.cv.circle(
          out, // output Mat
          new this.cv.Point(Math.round(kp.x), Math.round(kp.y)), // center point 
          3, new this.cv.Scalar(0,255,0,255), -1, // raduis, color, fill
          this.cv.LINE_AA // line type
        );
      }
      this.cv.imshow(outCanvas, out); // display on canvas
      out.delete(); // cleanup
  }

  /* DRAW MATCHES BETWEEN IMAGE A <-> IMAGE B
  _______________________________________________________________________________ */

  drawMatches(
    imgA, // HTMLImageElement source image, 
    imgB, // HTMLImageElement target image
    keypointsA, // {x,y} keypoints from image A,
    keypointsB, // {x,y} keypoints from image B,
    matchRes // {matches : DMatch[], inlierMask: Uint8Array} match results
  ) {      

    // Convert images to cv.Mat
    const matrixA = matFromImageEl(imgA);
    const matrixB = matFromImageEl(imgB);

    const outH = Math.max(matrixA.rows, matrixB.rows); 
    const outW = matrixA.cols + matrixB.cols; 
    
    // Create new output Mat
    const drawnMatches = new this.cv.Mat(
      outH, // output height     
      outW, // output width
     this.cv.CV_8UC4, 
      new this.cv.Scalar(0,0,0,255) 
    );

    // Image A placement on drawnMatches (region of interest)
    const roiA = drawnMatches.roi(
      new this.cv.Rect(
        0, 0, // x, y (top-left)
        matrixA.cols, // width
        matrixA.rows // height
      )
    );

    // Copy image A to its region of interest
    matrixA.copyTo(roiA); 
    roiA.delete(); 

    // Image B placement on drawnMatches
    const roiB = drawnMatches.roi(
      new this.cv.Rect(
        matrixA.cols, 0, // x (after image A), y (top)
        matrixB.cols, // width
        matrixB.rows // height
      )
    );
    
    // Copy image B to its region of interest
    matrixB.copyTo(roiB); 
    roiB.delete(); 
    
    // Determine inlier mask
    const inMask = matchRes.inlierMask;

    // Loop through matches and draw lines + circles
    for (let i = 0; i < matchRes.matches.length; i++) {     
      const m  = matchRes.matches[i]; // current match
      const p1 = keypointsA[m.queryIdx]; // point from source image
      const p2 = keypointsB[m.trainIdx]; // point from target image
      
      if (!p1 || !p2) continue; // sanity check
      
      // Determine if inlier
      const inlier = inMask ? Boolean(inMask[i]) : true;
      
      // Define colors for inliers and outliers
      const GREEN = new this.cv.Scalar(0, 255, 0, 255);
      const RED   = new this.cv.Scalar(255, 0, 0, 255);

      const color = inlier ? GREEN : RED;

      // Define points in pixel coordinates
      const pointA = new this.cv.Point(
        Math.round(p1.x * matrixA.cols),
        Math.round(p1.y * matrixA.rows)
      );

      const pointB = new this.cv.Point(
        Math.round(p2.x + matrixA.cols), 
        Math.round(p2.y)
      );

      // Draw the matching keypoints with a line connecting them
      this.cv.line(drawnMatches, pointA, pointB, color, 1,this.cv.LINE_AA);
      this.cv.circle(drawnMatches, pointA, 3, color, -1,this.cv.LINE_AA);
      this.cv.circle(drawnMatches, pointB, 3, color, -1,this.cv.LINE_AA);

    }

    // Clean up
    matrixA.delete();
    matrixB.delete();

    // Return the mat with drawn matches
    return drawnMatches;
  }

  /* Diagram for drawnMatches Layout
  _________________________________________________________________________________ 

        {   matrixA.cols   } {         matrixB.cols    }
  (0,0) -----------------------------------------------
        |    ROI A         >|         ROI B          >|<
        |                >  |                      >  |  <
        | matrixA.rows -->  |       matrixB.rows -->  |  <-- outH
        |                  >|                      >  |  <
        --------------------|                        >|<
        ////////////////////---------------------------
        {                   outW                      } */

  
  
  /*________________________________________________________________________________
                           INTERNAL METHODS
  _________________________________________________________________________________*/

  /* SERIALIZE KEYPOINTVECTOR TO JS ARRAY
  ---------------------------------------------------------------------------------
  Convert OpenCV.js KeyPointVector to JS array of keypoint objects  
  ---------------------------------------------------------------------------------*/
  _serializeKeypoints(kpVec) {
    const out = [];           
    // Loop through keypoints
    for (let i=0; i < kpVec.size(); i++) {       
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
  ---------------------------------------------------------------------------------*/
  _serializeDescriptors(des) {
    // Check for empty descriptors
    if (!des || des.rows===0 || des.cols===0) return null;
    // Return serialized descriptor object
    return { rows: des.rows, cols: des.cols, data: new Uint8Array(des.data) };
  }
  
  /* UINT8ARRAY TO BASE64 STRING
  ----------------------------------------------------------------------------------
  Convert Uint8Array to base64 string for JSON serialization
  ----------------------------------------------------------------------------------*/
  _u8ToB64(u8) {
    
    let binary  = ''; 
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
  ----------------------------------------------------------------------------------*/
  _b64ToU8(b64) {
    const bin = atob(b64); // decode base64 to binary string
    const u8  = new Uint8Array(bin.length); 
    
    // Iterate through binary string and fill Uint8Array
    for (let i=0;i<bin.length;i++) {
      // Convert each character to its char code
      u8[i]=bin.charCodeAt(i);
    }
    return u8;
  }

}
