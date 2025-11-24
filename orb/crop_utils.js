// crop_utils.js
// Utilities for setting up and using a crop box over an image element
/* 
___________________________________________________________________________
SETUP CROP BOX

Make the crop box element draggable and resizable over the image element.

Input:
    - imgEl: HTMLImageElement to overlay crop box on
    - cropBoxEl: crop box HTML element
______________________________________________________________________________ */

export function setupCropBox(imgEl, cropBoxEl) {
  
  // Variables for dragging and resizing
  let isDragging = false;   // flag for dragging
  let isResizing = false;   // flag for resizing
  let resizeCorner = null;  // which corner is being resized
  
  // Starting positions
  let startX;     // initial mouse X
  let startY;     // initial mouse Y
  let startLeft;  // initial crop box left
  let startTop;   // initial crop box top
  let startW;     // initial crop box width
  let startH;     // initial crop box height

  // Mouse down on crop box to start dragging entire crop box (not resizing)
  //_____________________________________________________________________________
  cropBoxEl.addEventListener('mousedown', (e) => {
    // Ignore if clicking on resize handle
    if (e.target.classList.contains('resize-handle')) return;
    isDragging = true;  // Set while moving entire crop box
    
    // Mouse coordinates in viewport
    startX = e.clientX; // Initial mouse x
    startY = e.clientY; // Initial mouse y
    
    // Crop box starting position inside image element
    startLeft = parseInt(cropBoxEl.style.left, 10); // Initial left (x)
    startTop = parseInt(cropBoxEl.style.top, 10);   // Initial top (y)
    
    e.preventDefault();  // prevent browser default behavior
  });

  // Mouse down on resize handles to start resizing
  //_____________________________________________________________________________
  cropBoxEl.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      isResizing = true;  // Set while resizing crop box
      resizeCorner = handle.dataset.corner; // which corner
      
      // Mouse coordinates in viewport
      startX = e.clientX; // Initial mouse x
      startY = e.clientY; // Initial mouse y
      
      // Crop box starting position inside image element
      startW = parseInt(cropBoxEl.style.width, 10);   // initial width
      startH = parseInt(cropBoxEl.style.height, 10);  // initial height
      startLeft = parseInt(cropBoxEl.style.left, 10); // initial left (x)
      startTop = parseInt(cropBoxEl.style.top, 10);   // initial top (y)
      
      e.stopPropagation(); // prevent triggering drag handler
      e.preventDefault();  // prevent browser default behavior
    });
  });

  // Mouse move to drag or resize crop box
  //_____________________________________________________________________________
  document.addEventListener('mousemove', (e) => {
    // Get image bounding rect for limits
    const imgRect = imgEl.getBoundingClientRect();
    
    // Handle dragging
    if (isDragging) {
      let dx = e.clientX - startX;  // delta X
      let dy = e.clientY - startY;  // delta Y    
      let newLeft = startLeft + dx; // new left (x)
      let newTop = startTop + dy;   // new top (y)      
      
      // Constrain within image bounds
      newLeft = Math.max(0, Math.min(newLeft, imgRect.width - parseInt(cropBoxEl.style.width, 10)));
      newTop = Math.max(0, Math.min(newTop, imgRect.height - parseInt(cropBoxEl.style.height, 10)));      
      
      // Update crop box position in UI
      cropBoxEl.style.left = `${newLeft}px`; // update left
      cropBoxEl.style.top = `${newTop}px`;   // update top
    
    // Handle resizing
    } else if (isResizing) {
      let dx = e.clientX - startX; // delta X
      let dy = e.clientY - startY; // delta Y
      let left = startLeft; // initial left
      let top = startTop;   // initial top
      let width = startW;   // initial width
      let height = startH;  // initial height

      // Adjust based on which corner is being resized
      // Top-left corner
      if (resizeCorner === 'nw') {
        left = startLeft + dx;
        top = startTop + dy;
        width = startW - dx;
        height = startH - dy;
      // Top-right corner
      } else if (resizeCorner === 'ne') {
        top = startTop + dy;
        width = startW + dx;
        height = startH - dy;
      // Bottom-left corner
      } else if (resizeCorner === 'sw') {
        left = startLeft + dx;
        width = startW - dx;
        height = startH + dy;
      // Bottom-right corner
      } else if (resizeCorner === 'se') {
        width = startW + dx;
        height = startH + dy;
      }

      // Constrain within image bounds and minimum size
      left = Math.max(0, Math.min(left, imgRect.width - width));
      top = Math.max(0, Math.min(top, imgRect.height - height));
      width = Math.max(10, Math.min(width, imgRect.width - left));
      height = Math.max(10, Math.min(height, imgRect.height - top));

      // Update crop box position and size in UI
      cropBoxEl.style.left = `${left}px`;
      cropBoxEl.style.top = `${top}px`;
      cropBoxEl.style.width = `${width}px`;
      cropBoxEl.style.height = `${height}px`;
    }
  });

  // Mouse up to stop dragging or resizing
  //_____________________________________________________________________________
  document.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
    resizeCorner = null;
  });

  // Initialize crop box when image loads
  //_____________________________________________________________________________
  imgEl.onload = () => {
    imgEl.hidden = false;
    const imgRect = imgEl.getBoundingClientRect();
    const parent = imgEl.parentElement;
    parent.style.width = imgRect.width + 'px';
    parent.style.height = imgRect.height + 'px';
    cropBoxEl.style.display = 'block';
    cropBoxEl.style.left = '0px';
    cropBoxEl.style.top = '0px';
    cropBoxEl.style.width = imgRect.width + 'px';
    cropBoxEl.style.height = imgRect.height + 'px';
  };
}
/* 
___________________________________________________________________________
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
/* 
___________________________________________________________________________
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