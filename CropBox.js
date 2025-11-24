export class CropBox {
    constructor(imgEl, cropBoxEl) {
        this.imgEl = imgEl;
        this.cropBoxEl = cropBoxEl;

        // State
        this.isDragging = false;
        this.isResizing = false;
        this.resizeCorner = null;

        // Start positions
        this.startX = 0;
        this.startY = 0;
        this.startLeft = 0;
        this.startTop = 0;
        this.startW = 0;
        this.startH = 0;

        // Bind event handlers
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onHandleMouseDown = this._onHandleMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onImgLoad = this._onImgLoad.bind(this);

        // Setup listeners
        this.cropBoxEl.addEventListener('mousedown', this._onMouseDown);
        this.cropBoxEl.querySelectorAll('.resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', this._onHandleMouseDown);
        });
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
        this.imgEl.onload = this._onImgLoad;

        // Optionally, initialize crop box if image is already loaded
        if (this.imgEl.complete && this.imgEl.naturalWidth) {
            this._onImgLoad();
        }

        window.addEventListener('resize', this._onImgLoad);

        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => this._onImgLoad());
            this.resizeObserver.observe(this.imgEl);
        }
    }

    _onMouseDown(e) {
        if (e.target.classList.contains('resize-handle')) return;
        this.isDragging = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startLeft = parseInt(this.cropBoxEl.style.left, 10);
        this.startTop = parseInt(this.cropBoxEl.style.top, 10);
        e.preventDefault();
    }

    _onHandleMouseDown(e) {
        this.isResizing = true;
        this.resizeCorner = e.target.dataset.corner;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startW = parseInt(this.cropBoxEl.style.width, 10);
        this.startH = parseInt(this.cropBoxEl.style.height, 10);
        this.startLeft = parseInt(this.cropBoxEl.style.left, 10);
        this.startTop = parseInt(this.cropBoxEl.style.top, 10);
        e.stopPropagation();
        e.preventDefault();
    }

    _onMouseMove(e) {
        const imgRect = this.imgEl.getBoundingClientRect();
        if (this.isDragging) {
            let dx = e.clientX - this.startX;
            let dy = e.clientY - this.startY;
            let newLeft = this.startLeft + dx;
            let newTop = this.startTop + dy;
            newLeft = Math.max(0, Math.min(newLeft, imgRect.width - parseInt(this.cropBoxEl.style.width, 10)));
            newTop = Math.max(0, Math.min(newTop, imgRect.height - parseInt(this.cropBoxEl.style.height, 10)));
            this.cropBoxEl.style.left = `${newLeft}px`;
            this.cropBoxEl.style.top = `${newTop}px`;
        } else if (this.isResizing) {
            let dx = e.clientX - this.startX;
            let dy = e.clientY - this.startY;
            let left = this.startLeft;
            let top = this.startTop;
            let width = this.startW;
            let height = this.startH;
            if (this.resizeCorner === 'nw') {
                left = this.startLeft + dx;
                top = this.startTop + dy;
                width = this.startW - dx;
                height = this.startH - dy;
            } else if (this.resizeCorner === 'ne') {
                top = this.startTop + dy;
                width = this.startW + dx;
                height = this.startH - dy;
            } else if (this.resizeCorner === 'sw') {
                left = this.startLeft + dx;
                width = this.startW - dx;
                height = this.startH + dy;
            } else if (this.resizeCorner === 'se') {
                width = this.startW + dx;
                height = this.startH + dy;
            }
            left = Math.max(0, Math.min(left, imgRect.width - width));
            top = Math.max(0, Math.min(top, imgRect.height - height));
            width = Math.max(10, Math.min(width, imgRect.width - left));
            height = Math.max(10, Math.min(height, imgRect.height - top));
            this.cropBoxEl.style.left = `${left}px`;
            this.cropBoxEl.style.top = `${top}px`;
            this.cropBoxEl.style.width = `${width}px`;
            this.cropBoxEl.style.height = `${height}px`;
        }
    }

    _onMouseUp() {
        this.isDragging = false;
        this.isResizing = false;
        this.resizeCorner = null;
    }

    _onImgLoad() {
        this.imgEl.hidden = false;
        // Get the rendered size of the image
        const imgRect = this.imgEl.getBoundingClientRect();
        // Optionally, set parent size to match image
        const parent = this.imgEl.parentElement;
        // Set crop box to cover the image
        this.cropBoxEl.style.display = 'block';
        this.cropBoxEl.style.position = 'absolute';
        this.cropBoxEl.style.left = '0px';
        this.cropBoxEl.style.top = '0px';
        this.cropBoxEl.style.width = imgRect.width + 'px';
        this.cropBoxEl.style.height = imgRect.height + 'px';
    }

    // Utility: get crop rectangle in natural image coordinates
    getCropRect() {
        const imgRect = this.imgEl.getBoundingClientRect();
        const cropRect = this.cropBoxEl.getBoundingClientRect();
        const scaleX = this.imgEl.naturalWidth / imgRect.width;
        const scaleY = this.imgEl.naturalHeight / imgRect.height;
        return {
            x: Math.round((cropRect.left - imgRect.left) * scaleX),
            y: Math.round((cropRect.top - imgRect.top) * scaleY),
            width: Math.round(cropRect.width * scaleX),
            height: Math.round(cropRect.height * scaleY)
        };
    }

    // Utility: crop image and return a canvas
    cropImage() {
        const cropRect = this.getCropRect();
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropRect.width;
        cropCanvas.height = cropRect.height;
        const ctx = cropCanvas.getContext('2d');
        ctx.drawImage(
            this.imgEl,
            cropRect.x, cropRect.y, cropRect.width, cropRect.height,
            0, 0, cropRect.width, cropRect.height
        );
        return cropCanvas;
    }

    // Optional: cleanup listeners if needed
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