// transform_pose.js
// Module to compute and apply transformation matrices between matched pose landmarks using OpenCV.js

export class PoseTransform {
  constructor(cv) {
    this.cv = cv;
  }
  
  /* COMPUTE TRANSFORM MATRIX
  Transform computation from matched keypoints between two sets of ORB features
  _______________________________________________________________________________*/
  computeTransform(matches, keypointsA, keypointsB, method = 'homography') {

    const matchArrays = this.matchesToArray(
      matches,
      keypointsA,
      keypointsB,
    );

    if (!matchArrays) {
      console.warn('Transform computation failed: not enough matches or invalid input.');
      return null;
    }

    const [srcMatches, dstMatches] = matchArrays;
    
    // Build flat array of source points (image A)
    const srcPts = []; // initialize array
    for (const lm of srcMatches) { 
      srcPts.push(lm.x); 
      srcPts.push(lm.y); 
    }
    
    // Build flat array of destination points (image B)
    const dstPts = []; // initialize array
    for (const lm of dstMatches) {
      dstPts.push(lm.x); // pixel x
      dstPts.push(lm.y); // pixel y
    }

    // Convert to cv.Mat
    const srcMat = this.cv.matFromArray(srcMatches.length, 1, this.cv.CV_32FC2, srcPts);
    const dstMat = this.cv.matFromArray(dstMatches.length, 1, this.cv.CV_32FC2, dstPts);

    let transformationMatrix; // transformation matrix

    // Compute transformation matrix
    if (method === 'homography') {
      transformationMatrix = this.cv.findHomography(srcMat, dstMat, this.cv.RANSAC);
    } else {
      transformationMatrix = this.cv.estimateAffine2D(srcMat, dstMat);
    }

    // Clean up
    srcMat.delete();
    dstMat.delete();

    return transformationMatrix; // return transformation matrix
  }

  /* APPLY TRANSFORM TO LANDMARKS
  ---------------------------------------------------------------------------------------
  Apply transformation matrix to detected pose landmarks from image A to 
  map them to the coordinate space of image B.*/ 

  transformLandmarks(landmarks, M, method = 'homography') {
    let transformedPoses = []; // array to hold transformed landmarks
    
    for (let i = 0; i < landmarks.length; i++) {
      const frameLandmarks = landmarks[i];
      if (!frameLandmarks || frameLandmarks.length === 0) continue;
    
      const pts = [];
      for (const lm of frameLandmarks) {
        pts.push(lm.x);
        pts.push(lm.y);
      }
      const ptsMat = this.cv.matFromArray(
        frameLandmarks.length, 
        1, 
        this.cv.CV_32FC2, pts
      );
      const outMat = new this.cv.Mat();

      if (method === 'homography') {
        this.cv.perspectiveTransform(ptsMat, outMat, M);
      } else {
        this.cv.transform(ptsMat, outMat, M);
      }

      // Convert back to JS array
      const transformed = [];
      for (let i = 0; i < frameLandmarks.length; i++) {
        transformed.push({
          x: outMat.data32F[i * 2],
          y: outMat.data32F[i * 2 + 1]
        });
      }
      transformedPoses.push(transformed);
      ptsMat.delete();
      outMat.delete();
    }
    return transformedPoses;
  }

  matchesToArray(matches, keypointsA, keypointsB) {

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
}

