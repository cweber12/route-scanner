// transform_pose.js
// Module to compute and apply transformation matrices between matched pose landmarks using OpenCV.js

export class PoseTransform {
  constructor(cv) {
    this.cv = cv;
  }
  
  /*____________________________________________________________________________________
      COMPUTE TRANSFORM MATRIX

      Transform computation from matched keypoints between two sets of ORB features

      Input:
        - srcLandmarks: Array of source landmarks [{x, y}, ...] (normalized coordinates)
        - dstLandmarks: Array of destination landmarks [{x, y}, ...] (pixel coordinates)
        - srcSize: Size of source image { width, height } for denormalization
        - method: 'homography' or 'affine' (default: 'homography')
      Output:
        - M: transformation matrix (cv.Mat)
  ___________________________________________________________________________________*/
  
  computeTransform(srcLandmarks, dstLandmarks, srcSize, method = 'homography') {
    const cv = this.cv;
    if (srcLandmarks.length !== dstLandmarks.length 
      || srcLandmarks.length < (method === 'homography' ? 4 : 3)) {
      throw new Error('Insufficient or mismatched landmark pairs');
    }

    // Denormalize source if needed
    const srcPts = [];
    for (const lm of srcLandmarks) {
      srcPts.push(lm.x * srcSize.width);
      srcPts.push(lm.y * srcSize.height);
    }
    
    const dstPts = [];
    for (const lm of dstLandmarks) {
      dstPts.push(lm.x);
      dstPts.push(lm.y);
    }

    // Convert to cv.Mat
    const srcMat = cv.matFromArray(srcLandmarks.length, 1, cv.CV_32FC2, srcPts);
    const dstMat = cv.matFromArray(dstLandmarks.length, 1, cv.CV_32FC2, dstPts);

    let M;
    if (method === 'homography') {
      M = cv.findHomography(srcMat, dstMat, cv.RANSAC);
    } else {
      M = cv.estimateAffine2D(srcMat, dstMat);
    }

    srcMat.delete();
    dstMat.delete();

    return M;
  }

  /*____________________________________________________________________________________
      APPLY TRANSFORM TO LANDMARKS

      Apply transformation matrix to detected pose landmarks from image A to 
      map them to the coordinate space of image B.

      Input:
        - landmarks: Array of landmarks [{x, y}, ...] (normalized coordinates)
        - srcSize: Size of source image { width, height } for denormalization
        - M: transformation matrix (cv.Mat)
        - method: 'homography' or 'affine' (default: 'homography')
      Output:
        - out: Array of transformed landmarks [{x, y}, ...] (pixel coordinates)
  ___________________________________________________________________________________*/   

  transformLandmarks(landmarks, srcSize, M, method = 'homography') {
    const cv = this.cv;
    const pts = [];

    for (const lm of landmarks) {
      pts.push(lm.x * srcSize.width);
      pts.push(lm.y * srcSize.height);
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