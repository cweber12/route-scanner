// CropBox.js
// Module to provide an interactive crop box over an image or video element

export class CropBox {/*
    _____________________________________________________________________________________
                                    CONSTRUCTOR
    _____________________________________________________________________________________*/
    
    constructor(imgEl, cropBoxEl) {       
        // Elements
        //------------------------------------------------------------------------------
        this.imgEl     = imgEl; // HTMLImageElement or HTMLVideoElement
        this.cropBoxEl = cropBoxEl; // HTMLDivElement for crop box

        // State
        //------------------------------------------------------------------------------
        this.isDragging   = false; // dragging state
        this.isResizing   = false; // resizing state
        this.resizeCorner = null; // which corner is being resized

        // Initialize start positions for drag/resize
        //------------------------------------------------------------------------------
        this.startX    = 0;
        this.startY    = 0;
        this.startLeft = 0;
        this.startTop  = 0;
        this.startW    = 0;
        this.startH    = 0;

        // Bind event handlers to this instance
        //------------------------------------------------------------------------------
        this._onMouseDown       = this._onMouseDown.bind(this);
        this._onHandleMouseDown = this._onHandleMouseDown.bind(this);
        this._onMouseMove       = this._onMouseMove.bind(this);
        this._onMouseUp         = this._onMouseUp.bind(this);
        this._onImgLoad         = this._onImgLoad.bind(this);
        
        // Setup listeners
        //------------------------------------------------------------------------------
        // Drag crop box
        this.cropBoxEl.addEventListener('mousedown', this._onMouseDown);
        // Resize handles
        this.cropBoxEl.querySelectorAll('.resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', this._onHandleMouseDown);
        });
        // Mouse move and up on document
        document.addEventListener('mousemove', this._onMouseMove);
        // Mouse up
        document.addEventListener('mouseup', this._onMouseUp);
        
        // Load image/video event
        //------------------------------------------------------------------------------
        this.imgEl.onload = this._onImgLoad; 
        if (this.imgEl.complete && this.imgEl.naturalWidth) {
            this._onImgLoad();
        }
        // Window resize
        window.addEventListener('resize', this._onImgLoad);
        // Check size changes to image element
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => this._onImgLoad());
            this.resizeObserver.observe(this.imgEl);
        }
    }/*
    _____________________________________________________________________________________
                                    EVENT HANDLERS
    _____________________________________________________________________________________*/

    //------------------------------------------------------------------------------------
    // Mouse down on crop box (start drag)    
    _onMouseDown(e) {
        if (e.target.classList.contains('resize-handle')) return;
        this.isDragging = true; // start dragging
        this.startX     = e.clientX; // mouse start X
        this.startY     = e.clientY; // mouse start Y
        this.startLeft  = parseInt(this.cropBoxEl.style.left, 10); // crop box start left
        this.startTop   = parseInt(this.cropBoxEl.style.top, 10); // crop box start top
        
        e.preventDefault(); // prevent text selection
    }

    //------------------------------------------------------------------------------------
    // Mouse down on resize handle (start resize)   
    _onHandleMouseDown(e) {
        this.isResizing   = true; // start resizing
        this.resizeCorner = e.target.dataset.corner; // which corner
        this.startX       = e.clientX; // mouse start X
        this.startY       = e.clientY; // mouse start Y
        this.startW       = parseInt(this.cropBoxEl.style.width, 10); // crop box start width
        this.startH       = parseInt(this.cropBoxEl.style.height, 10); // crop box start height
        this.startLeft    = parseInt(this.cropBoxEl.style.left, 10); // crop box start left
        this.startTop     = parseInt(this.cropBoxEl.style.top, 10); // crop box start top
        
        e.stopPropagation(); // prevent drag start
        e.preventDefault(); // prevent text selection
    }

    //------------------------------------------------------------------------------------
    // Mouse move (drag or resize)
    _onMouseMove(e) {
        // Get image bounding rect
        const imgRect = this.imgEl.getBoundingClientRect();
        
        // Dragging (dont need to change size of crop box)
        if (this.isDragging) {
            // Calculate change in position
            let dx = e.clientX - this.startX; // delta X
            let dy = e.clientY - this.startY; // delta Y

            // New position
            let newLeft = this.startLeft + dx; // new left (x)
            let newTop  = this.startTop + dy; // new top (y)

            // Constrain within image bounds
            newLeft = Math.max(0, Math.min(newLeft, imgRect.width - parseInt(this.cropBoxEl.style.width, 10)));
            newTop  = Math.max(0, Math.min(newTop, imgRect.height - parseInt(this.cropBoxEl.style.height, 10))); 

            // Apply new position
            this.cropBoxEl.style.left = `${newLeft}px`; // new left in UI
            this.cropBoxEl.style.top  = `${newTop}px`; // new top in UI
        
        // Resizing (adjust position and size)      
        } else if (this.isResizing) {
            let dx     = e.clientX - this.startX; // delta X
            let dy     = e.clientY - this.startY; // delta Y
            let left   = this.startLeft; // initial left
            let top    = this.startTop; // initial top
            let width  = this.startW; // initial width
            let height = this.startH; // initial height
            
            // Adjust based on which corner is being resized    
            // NW: top-left corner
            if (this.resizeCorner === 'nw') {
                left   = this.startLeft + dx; // adjust left
                top    = this.startTop + dy; // adjust top
                width  = this.startW - dx; // adjust width
                height = this.startH - dy; // adjust height            
            // NE: top-right corner
            } else if (this.resizeCorner === 'ne') {
                top    = this.startTop + dy; // adjust top
                width  = this.startW + dx; // adjust width
                height = this.startH - dy; // adjust height            
            // SW: bottom-left corner
            } else if (this.resizeCorner === 'sw') {
                left   = this.startLeft + dx; // adjust left
                width  = this.startW - dx; // adjust width
                height = this.startH + dy; // adjust height            
            // SE: bottom-right corner
            } else if (this.resizeCorner === 'se') {
                width  = this.startW + dx; // adjust width
                height = this.startH + dy; // adjust height
            }

            // Constrain within image bounds and minimum size
            left   = Math.max(0, Math.min(left, imgRect.width - width));
            top    = Math.max(0, Math.min(top, imgRect.height - height));
            width  = Math.max(10, Math.min(width, imgRect.width - left));
            height = Math.max(10, Math.min(height, imgRect.height - top));

            // Apply new position and size
            this.cropBoxEl.style.left   = `${left}px`; // new left
            this.cropBoxEl.style.top    = `${top}px`; // new top
            this.cropBoxEl.style.width  = `${width}px`; // new width
            this.cropBoxEl.style.height = `${height}px`; // new height
        }
    }

    //------------------------------------------------------------------------------------
    // Mouse up (end drag or resize)
    _onMouseUp() {
        this.isDragging   = false; // end dragging
        this.isResizing   = false; // end resizing
        this.resizeCorner = null; // clear resize corner
    }

    //------------------------------------------------------------------------------------
    // Image load (initialize crop box)
    _onImgLoad() {
        this.imgEl.hidden = false; // show image element in UI
        const imgRect = this.imgEl.getBoundingClientRect(); // get image bounding rect
        const parent  = this.imgEl.parentElement; // set parent element
        
        // Set crop box to cover the image
        this.cropBoxEl.style.display  = 'block'; // show crop box
        this.cropBoxEl.style.position = 'absolute'; // absolute position
        this.cropBoxEl.style.left     = '0px'; // new left
        this.cropBoxEl.style.top      = '0px'; // new top
        this.cropBoxEl.style.width    = imgRect.width + 'px'; // new width
        this.cropBoxEl.style.height   = imgRect.height + 'px'; // new height
    
    }/*
    
    _____________________________________________________________________________________
                                    FUNCTIONS
    _____________________________________________________________________________________*/

    //------------------------------------------------------------------------------------
    // Get crop rectangle in natural image/video coordinates
    getCropRect() {
        // Get bounding rects
        const imgRect = this.imgEl.getBoundingClientRect();
        const cropRect = this.cropBoxEl.getBoundingClientRect();
        
        // Determine if imgEl is video or image
        const isVideo = this.imgEl instanceof HTMLVideoElement;
        
        // Calculate scale factors from displayed to natural size
        const scaleX = isVideo 
            ? this.imgEl.videoWidth / imgRect.width // scale X for video
            : this.imgEl.naturalWidth / imgRect.width; // scale X for image
        const scaleY = isVideo 
            ? this.imgEl.videoHeight / imgRect.height // scale Y for video
            : this.imgEl.naturalHeight / imgRect.height; // scale Y for image
        
        // Return crop rectangle in natural coordinates 
        return {
            x: Math.round((cropRect.left - imgRect.left) * scaleX),
            y: Math.round((cropRect.top - imgRect.top) * scaleY),
            width: Math.round(cropRect.width * scaleX),
            height: Math.round(cropRect.height * scaleY)
        };
    }

    //------------------------------------------------------------------------------------
    // Get cropped image as a canvas element
    cropImage() {
        const cropRect    = this.getCropRect(); // crop rectangle in natural coords
        const cropCanvas  = document.createElement('canvas'); // canvas for cropped image
        cropCanvas.width  = cropRect.width; // set canvas width
        cropCanvas.height = cropRect.height; // set canvas height
        const ctx         = cropCanvas.getContext('2d'); // context for cropped canvas
        
        // Draw cropped area to canvas using drawImage from 
        ctx.drawImage(
            this.imgEl, // source image element
            cropRect.x, // source rectangle left 
            cropRect.y, // source rectangle top 
            cropRect.width, // source recttangle width 
            cropRect.height, // source rectangle height
            0, 0, // destination rectangle left, top
            cropRect.width, // destination rectangle width
            cropRect.height // destination rectangle height
        );
        return cropCanvas;
    }

    //------------------------------------------------------------------------------------
    // Destroy crop box and remove event listeners
    destroy() {
        this.cropBoxEl.removeEventListener('mousedown', this._onMouseDown);
        this.cropBoxEl.querySelectorAll('.resize-handle').forEach(handle => {
            handle.removeEventListener('mousedown', this._onHandleMouseDown);
        });
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        this.imgEl.onload = null;
        window.removeEventListener('resize', this._onImgLoad);
        if (this.resizeObserver) this.resizeObserver.disconnect();
    }
}

/*_________________________________________________________________________________

DIAGRAM OF CROP BOX RELATIVE TO IMAGE ELEMENT

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
__________________________________________________________________________________*/