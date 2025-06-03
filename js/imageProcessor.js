// js/imageProcessor.js

/**
 * Crops an image.
 * @param {HTMLImageElement|HTMLCanvasElement} imgObj - The image or canvas to crop.
 * @param {number} left - Pixels to crop from the left.
 * @param {number} right - Pixels to crop from the right.
 * @param {number} top - Pixels to crop from the top.
 * @param {number} bottom - Pixels to crop from the bottom.
 * @returns {HTMLCanvasElement} The cropped image as a canvas.
 */
function cropImage(imgObj, left, right, top, bottom) {
    const w = imgObj.naturalWidth || imgObj.width;
    const h = imgObj.naturalHeight || imgObj.height;
    const cropBoxWidth = w - left - right;
    const cropBoxHeight = h - top - bottom;

    if (cropBoxWidth <= 0 || cropBoxHeight <= 0) {
        throw new Error(`Crop results in non-positive dimensions: W=${cropBoxWidth}, H=${cropBoxHeight}. Original: ${w}x${h}, Crop LTRB: ${left},${right},${top},${bottom}`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = cropBoxWidth;
    canvas.height = cropBoxHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgObj, left, top, cropBoxWidth, cropBoxHeight, 0, 0, cropBoxWidth, cropBoxHeight);
    return canvas;
}

/**
 * Applies a sharpen filter to a canvas.
 * @param {HTMLCanvasElement} sourceCanvas - The canvas to sharpen.
 * @param {number} intensity - Strength of the sharpening effect.
 * @returns {HTMLCanvasElement} The sharpened canvas.
 */
function applySharpen(sourceCanvas, intensity) {
    if (intensity === 0) return sourceCanvas;
    const ctx = sourceCanvas.getContext('2d');
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const outputData = new Uint8ClampedArray(data.length);

    // Sharpening kernel
    const kernel = [
        [0, -intensity, 0],
        [-intensity, 1 + 4 * intensity, -intensity],
        [0, -intensity, 0]
    ];

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let r = 0, g = 0, b = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const sy = clamp(y + ky, 0, h - 1); // Use clamp from utils.js
                    const sx = clamp(x + kx, 0, w - 1); // Use clamp from utils.js
                    const kVal = kernel[ky + 1][kx + 1];
                    if (kVal === 0) continue;
                    const idx_src = (sy * w + sx) * 4;
                    r += data[idx_src] * kVal;
                    g += data[idx_src + 1] * kVal;
                    b += data[idx_src + 2] * kVal;
                }
            }
            const idx_dst = (y * w + x) * 4;
            outputData[idx_dst] = clamp(r, 0, 255);
            outputData[idx_dst + 1] = clamp(g, 0, 255);
            outputData[idx_dst + 2] = clamp(b, 0, 255);
            outputData[idx_dst + 3] = data[idx_dst + 3]; // Alpha
        }
    }
    ctx.putImageData(new ImageData(outputData, w, h), 0, 0);
    return sourceCanvas;
}

/**
 * Adds bleed to a canvas by extending edge pixels.
 * @param {HTMLCanvasElement} sourceCanvas - The original content canvas.
 * @param {number} bleedPx - The bleed size in pixels.
 * @returns {HTMLCanvasElement} A new canvas with bleed added.
 */
function addBleed(sourceCanvas, bleedPx) {
    if (bleedPx <= 0) return sourceCanvas;

    const origW = sourceCanvas.width;
    const origH = sourceCanvas.height;
    const newW = origW + 2 * bleedPx;
    const newH = origH + 2 * bleedPx;

    const bleedCanvas = document.createElement('canvas');
    bleedCanvas.width = newW;
    bleedCanvas.height = newH;
    const ctx = bleedCanvas.getContext('2d');
    const origCtx = sourceCanvas.getContext('2d', { willReadFrequently: true }); // Hint for performance

    // Draw original image in the center
    ctx.drawImage(sourceCanvas, bleedPx, bleedPx);

    // Top bleed
    ctx.drawImage(sourceCanvas, 0, 0, origW, 1, bleedPx, 0, origW, bleedPx);
    // Bottom bleed
    ctx.drawImage(sourceCanvas, 0, origH - 1, origW, 1, bleedPx, origH + bleedPx, origW, bleedPx);
    // Left bleed
    ctx.drawImage(sourceCanvas, 0, 0, 1, origH, 0, bleedPx, bleedPx, origH);
    // Right bleed
    ctx.drawImage(sourceCanvas, origW - 1, 0, 1, origH, origW + bleedPx, bleedPx, bleedPx, origH);

    // Corner fills
    // Top-left
    ctx.drawImage(sourceCanvas, 0, 0, 1, 1, 0, 0, bleedPx, bleedPx);
    // Top-right
    ctx.drawImage(sourceCanvas, origW - 1, 0, 1, 1, origW + bleedPx, 0, bleedPx, bleedPx);
    // Bottom-left
    ctx.drawImage(sourceCanvas, 0, origH - 1, 1, 1, 0, origH + bleedPx, bleedPx, bleedPx);
    // Bottom-right
    ctx.drawImage(sourceCanvas, origW - 1, origH - 1, 1, 1, origW + bleedPx, origH + bleedPx, bleedPx, bleedPx);
    
    return bleedCanvas;
}


/**
 * Adds L-shaped cut marks to a canvas (typically one with bleed).
 * @param {HTMLCanvasElement} canvas - The canvas to add cut marks to.
 * @param {number} bleedPx - The size of the bleed in pixels (marks are drawn at this offset).
 * @param {number} cutLengthPx - The length of each arm of the L-mark in pixels.
 * @param {number} thicknessPx - The thickness of the cut mark lines in pixels.
 * @returns {HTMLCanvasElement} The canvas with cut marks.
 */
function addCutMarks(canvas, bleedPx, cutLengthPx, thicknessPx) {
    if (cutLengthPx <= 0 || bleedPx <= 0 || thicknessPx <= 0) return canvas;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.strokeStyle = 'black'; // Consider making this configurable
    ctx.lineWidth = thicknessPx;
    const lineOffset = thicknessPx / 2; // Align to pixel grid so 1px stays 1px and keep mark inside

    // Points for corners of the content area (inside bleed)
    const contentX0 = bleedPx;
    const contentY0 = bleedPx;
    const contentX1 = w - bleedPx;
    const contentY1 = h - bleedPx;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(contentX0 - cutLengthPx + lineOffset, contentY0 - lineOffset); // Horizontal line starts outside, ends at corner
    ctx.lineTo(contentX0 - lineOffset, contentY0 - lineOffset);
    ctx.moveTo(contentX0 - lineOffset, contentY0 - cutLengthPx + lineOffset); // Vertical line starts outside, ends at corner
    ctx.lineTo(contentX0 - lineOffset, contentY0 - lineOffset);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(contentX1 + cutLengthPx - lineOffset, contentY0 - lineOffset);
    ctx.lineTo(contentX1 + lineOffset, contentY0 - lineOffset);
    ctx.moveTo(contentX1 + lineOffset, contentY0 - cutLengthPx + lineOffset);
    ctx.lineTo(contentX1 + lineOffset, contentY0 - lineOffset);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(contentX0 - cutLengthPx + lineOffset, contentY1 + lineOffset);
    ctx.lineTo(contentX0 - lineOffset, contentY1 + lineOffset);
    ctx.moveTo(contentX0 - lineOffset, contentY1 + cutLengthPx - lineOffset);
    ctx.lineTo(contentX0 - lineOffset, contentY1 + lineOffset);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(contentX1 + cutLengthPx - lineOffset, contentY1 + lineOffset);
    ctx.lineTo(contentX1 + lineOffset, contentY1 + lineOffset);
    ctx.moveTo(contentX1 + lineOffset, contentY1 + cutLengthPx - lineOffset);
    ctx.lineTo(contentX1 + lineOffset, contentY1 + lineOffset);
    ctx.stroke();

    return canvas;
}

/**
 * Applies brightness, contrast, and gamma adjustments to a canvas.
 * @param {HTMLCanvasElement} canvas - The canvas to adjust.
 * @param {number} brightness - Brightness adjustment (-100 to 100).
 * @param {number} contrast - Contrast adjustment (-100 to 100).
 * @param {number} gamma - Gamma adjustment (0.1 to 3.0).
 * @returns {HTMLCanvasElement} The adjusted canvas.
 */
function applyImageAdjustments(canvas, brightness, contrast, gamma) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const contrastFactor = (100.0 + contrast) / 100.0;

    // Precompute gamma table for efficiency
    const gammaTable = [];
    for (let i = 0; i < 256; i++) {
        gammaTable[i] = Math.pow(i / 255.0, gamma) * 255.0;
    }

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i + 1], b = data[i + 2];

        // Brightness
        r = clamp(r + brightness, 0, 255);
        g = clamp(g + brightness, 0, 255);
        b = clamp(b + brightness, 0, 255);

        // Contrast
        r = clamp((r - 128) * contrastFactor + 128, 0, 255);
        g = clamp((g - 128) * contrastFactor + 128, 0, 255);
        b = clamp((b - 128) * contrastFactor + 128, 0, 255);

        // Gamma
        r = gammaTable[r | 0]; // Use bitwise OR 0 to floor quickly
        g = gammaTable[g | 0];
        b = gammaTable[b | 0];

        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

/**
 * Resizes an image canvas.
 * @param {HTMLCanvasElement} sourceCanvas - The canvas to resize.
 * @param {number} targetWidth - The target width in pixels. 0 or negative to auto-calculate from height.
 * @param {number} targetHeight - The target height in pixels. 0 or negative to auto-calculate from width.
 * @param {boolean} maintainAspectRatio - Whether to maintain the original aspect ratio.
 * @returns {HTMLCanvasElement} The resized canvas.
 */
function resizeImage(sourceCanvas, targetWidth, targetHeight, maintainAspectRatio) {
    const origW = sourceCanvas.width;
    const origH = sourceCanvas.height;

    if (origW <= 0 || origH <= 0) throw new Error("Source canvas for resize has non-positive dimensions.");
    
    let newW = targetWidth > 0 ? targetWidth : 0;
    let newH = targetHeight > 0 ? targetHeight : 0;

    if (newW <= 0 && newH <= 0) return sourceCanvas; // No resize requested or invalid target

    if (maintainAspectRatio) {
        const origAspect = origW / origH;
        if (newW > 0 && newH > 0) { // Both specified, fit within (letterbox/pillarbox not handled, it scales to fit)
            if (newW / newH > origAspect) { // Target aspect is wider than source
                newW = newH * origAspect;
            } else { // Target aspect is narrower or same
                newH = newW / origAspect;
            }
        } else if (newW > 0) { // Only width specified
            newH = newW / origAspect;
        } else if (newH > 0) { // Only height specified
            newW = newH * origAspect;
        }
    } else { // Not maintaining aspect ratio, use specified dimensions or original if one is 0
        if (newW <= 0) newW = origW;
        if (newH <= 0) newH = origH;
    }
    
    newW = Math.round(newW);
    newH = Math.round(newH);

    if (newW <= 0 || newH <= 0) throw new Error(`Resize results in non-positive dimensions: W=${newW}, H=${newH}`);
    if (newW === origW && newH === origH) return sourceCanvas; // No change in size

    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = newW;
    resizedCanvas.height = newH;
    const ctx = resizedCanvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high'; // Prefer quality
    ctx.drawImage(sourceCanvas, 0, 0, origW, origH, 0, 0, newW, newH);
    return resizedCanvas;
}

/**
 * Applies rounded corners to a canvas.
 * @param {HTMLCanvasElement} canvas - The canvas to apply rounded corners to.
 * @param {number} radiusPx - The corner radius in pixels.
 * @returns {HTMLCanvasElement} A new canvas with rounded corners. Output is always PNG.
 */
function applyRoundedCorners(canvas, radiusPx) {
    if (radiusPx <= 0) return canvas;

    const w = canvas.width;
    const h = canvas.height;
    const roundedCanvas = document.createElement('canvas');
    roundedCanvas.width = w;
    roundedCanvas.height = h;
    const ctx = roundedCanvas.getContext('2d');

    // Path for rounded rectangle
    ctx.beginPath();
    ctx.moveTo(radiusPx, 0);
    ctx.lineTo(w - radiusPx, 0); ctx.arcTo(w, 0, w, radiusPx, radiusPx);
    ctx.lineTo(w, h - radiusPx); ctx.arcTo(w, h, w - radiusPx, h, radiusPx);
    ctx.lineTo(radiusPx, h); ctx.arcTo(0, h, 0, h - radiusPx, radiusPx);
    ctx.lineTo(0, radiusPx); ctx.arcTo(0, 0, radiusPx, 0, radiusPx);
    ctx.closePath();
    ctx.clip(); // Clip to the rounded rectangle path
    ctx.drawImage(canvas, 0, 0); // Draw the original image, clipped

    return roundedCanvas;
}