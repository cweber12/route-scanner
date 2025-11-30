// transform_pose.js
// Module to compute and apply transformation matrices between matched pose landmarks using OpenCV.js

export class PoseTransform {
  constructor(cv) {
    this.cv = cv;
  }
  
  /* COMPUTE TRANSFORM MATRIX
  ---------------------------------------------------------------------------------------
  Transform computation from matched keypoints between two sets of ORB features

  Input:
    - srcLandmarks: Array of source landmarks [{x, y}, ...] (normalized coordinates)
    - dstLandmarks: Array of destination landmarks [{x, y}, ...] (pixel coordinates)
    - srcSize: Size of source image { width, height } for denormalization
    - method: 'homography' or 'affine' (default: 'homography')
  Output:
    - M: transformation matrix (cv.Mat) */

  computeTransform(srcLandmarks, dstLandmarks, method = 'homography') {
    const cv = this.cv;
    // Validate input landmark arrays
    if (srcLandmarks.length !== dstLandmarks.length 
      || srcLandmarks.length < (method === 'homography' ? 4 : 3)) {
      throw new Error('Insufficient or mismatched landmark pairs');
    }
    
    // Build flat array of source points (image A)
    const srcPts = []; // initialize array
    for (const lm of srcLandmarks) { 
      srcPts.push(lm.x); 
      srcPts.push(lm.y); 
    }
    
    // Build flat array of destination points (image B)
    const dstPts = []; // initialize array
    for (const lm of dstLandmarks) {
      dstPts.push(lm.x); // pixel x
      dstPts.push(lm.y); // pixel y
    }

    // Convert to cv.Mat
    const srcMat = cv.matFromArray(srcLandmarks.length, 1, cv.CV_32FC2, srcPts);
    const dstMat = cv.matFromArray(dstLandmarks.length, 1, cv.CV_32FC2, dstPts);

    let M; // transformation matrix

    // Compute transformation matrix
    if (method === 'homography') {
      M = cv.findHomography(srcMat, dstMat, cv.RANSAC);
    } else {
      M = cv.estimateAffine2D(srcMat, dstMat);
    }

    // Clean up
    srcMat.delete();
    dstMat.delete();

    return M; // return transformation matrix
  }

  /* APPLY TRANSFORM TO LANDMARKS
  ---------------------------------------------------------------------------------------
  Apply transformation matrix to detected pose landmarks from image A to 
  map them to the coordinate space of image B.

  Input:
    - landmarks: Array of landmarks [{x, y}, ...] (normalized coordinates)
    - srcSize: Size of source image { width, height } for denormalization
    - M: transformation matrix (cv.Mat)
    - method: 'homography' or 'affine' (default: 'homography')
  Output:
    - out: Array of transformed landmarks [{x, y}, ...] (pixel coordinates) */   

  transformLandmarks(landmarks, srcSize, M, method = 'homography') {
    const cv = this.cv;
    const pts = [];

    for (const lm of landmarks) {
      pts.push(lm.x);
      pts.push(lm.y);
    }
    const ptsMat = cv.matFromArray(landmarks.length, 1, cv.CV_32FC2, pts);
    const outMat = new cv.Mat();

    if (method === 'homography') {
      cv.perspectiveTransform(ptsMat, outMat, M);
    } else {
      cv.transform(ptsMat, outMat, M);
    }

    // Convert back to JS array
    const transformed = [];
    for (let i = 0; i < landmarks.length; i++) {
      transformed.push({
        x: outMat.data32F[i * 2],
        y: outMat.data32F[i * 2 + 1]
      });
    }

    ptsMat.delete();
    outMat.delete();

    return transformed;
  }
}