# MediaPipe Pose Detection Tool

This project provides a browser-based tool for extracting pose landmarks from video frames using [MediaPipe](https://mediapipe.dev/) and exporting the results to JSON. It supports cropping, frame-by-frame pose detection, and interactive navigation of processed frames.

---

## Features

- **Upload a video** and extract pose landmarks using MediaPipe.
- **Crop region selection**: Select a region of interest before processing frames.
- **Frame-based pose detection**: Extract frames at a user-defined interval, crop, detect pose, and save results.
- **Real-time pose detection**: Overlay pose landmarks on video playback.
- **Interactive frame navigation**: View processed frames, pose skeletons, and crop boxes.
- **Export results**: Download pose landmark data as JSON.

---

## File Overview

### `index.html`
Defines the UI structure, including:
- Video upload input
- Video display
- Canvas overlay for drawing
- Crop box for region selection
- Controls for detection modes, interval input, navigation, and download

### `main.js`
Main entry point. Handles:
- DOM element references
- Video upload and initialization
- Crop box setup and conversion between display and video pixel space
- Mode selection (video or frame-based detection)
- Event listeners for UI controls
- Invokes pose detection functions and manages results

### `setup_crop_box.js`
Implements crop box drag and resize functionality:
- Allows users to select and adjust a crop region over the video
- Handles mouse events for moving and resizing the crop box
- Ensures crop box stays within video bounds

### `video_frame_extractor.js`
Extracts frames from the video:
- Seeks to specified timestamps
- Draws video frames to a canvas
- Passes each frame to a callback for processing (cropping, pose detection, etc.)

### `pose_landmarker_frame.js`
Frame-by-frame pose detection workflow:
- Crops each extracted frame using the selected crop box
- Runs pose detection on the cropped frame
- Offsets landmark coordinates to original frame pixel space
- Draws pose skeleton and crop box on the original frame
- Saves processed frame data and landmarks to `poseResults`
- Updates crop box for next frame based on hip landmarks
- Implements interactive navigation (`showFrame`) for viewing results

### `pose_landmarker_video.js`
Real-time pose detection on video playback:
- Runs pose detection on each video frame as it plays
- Overlays pose landmarks and connectors on the video
- Saves results for export

---

## Usage

1. **Open the tool in your browser.**
2. **Upload a video** using the file input.
3. **Choose a detection mode:**
   - **Detect from Video:** Runs pose detection in real time as the video plays.
   - **Detect from Frames:** Pauses the video, lets you select a crop region, then processes frames at the chosen interval.
4. **For frame-based detection:**
   - Adjust the crop box to select your region of interest.
   - Click the detection button again to start processing.
   - Navigate through processed frames using the provided controls.
5. **Download results:** Click the download button to export pose landmark data as JSON.

---

## Technical Notes

- **Coordinate Systems:**  
  - Crop box and landmarks are saved in video pixel space for accuracy and export.
  - For UI display, coordinates are scaled to match the displayed video size.
- **Crop Box Handling:**  
  - The crop box is initialized and manipulated in display space, then converted to video pixel space for processing.
  - For each frame, the crop box is updated to center on the detected hip landmarks.
- **Frame Processing:**  
  - Each frame is processed sequentially: extract → crop → detect pose → offset coordinates → draw → save.
  - Results are stored in `poseResults` for navigation and export.
- **Navigation:**  
  - The `showFrame` function displays each processed frame, overlays the crop box and pose skeleton, and updates the frame counter.

---

## Dependencies

- [MediaPipe Tasks Vision](https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm)
- JavaScript (ES6 modules)
- HTML5 video and canvas APIs

---

## Customization

- **Change detection interval:** Adjust the interval input to control frame extraction frequency.
- **Modify crop box behavior:** Edit `setup_crop_box.js` for custom drag/resize logic.
- **Extend pose data:** Add more fields to the JSON export as needed.

---

## Troubleshooting

- **Landmarks misaligned:**  
  Ensure crop box coordinates are correctly converted between display and pixel space.  
  The crop box used for each frame is saved and used for offset calculations.
- **UI overlays not matching video:**  
  Check that canvas and crop box sizes are updated on video load and window resize.
- **Performance issues:**  
  For large videos, frame-by-frame processing is more memory-efficient than extracting all frames at once.

---

## License

MIT License 

---

## Credits

- Built with [MediaPipe](https://mediapipe.dev/)

---