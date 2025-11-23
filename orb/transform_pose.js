export class PoseTransform {
  constructor(cv) {
    this.cv = cv;
  }

  // srcLandmarks: [{x, y}, ...] from image A (normalized or pixel)
  // dstLandmarks: [{x, y}, ...] from image B (pixel)
  // srcSize: {width, height} of image A (needed if srcLandmarks are normalized)
  // method: 'homography' or 'affine'
  computeTransform(srcLandmarks, dstLandmarks, srcSize, method = 'homography') {
    const cv = this.cv;
    if (srcLandmarks.length !== dstLandmarks.length || srcLandmarks.length < (method === 'homography' ? 4 : 3)) {
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

  // Transform pose landmarks from image A to image B using the matrix
  // landmarks: [{x, y}, ...] (normalized or pixel)
  // srcSize: {width, height} (needed if normalized)
  // M: transformation matrix (cv.Mat)
  // method: 'homography' or 'affine'
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
    const out = [];
    for (let i = 0; i < landmarks.length; i++) {
      out.push({
        x: outMat.data32F[i * 2],
        y: outMat.data32F[i * 2 + 1]
      });
    }

    ptsMat.delete();
    outMat.delete();
    if (M) M.delete();

    return out;
  }
}