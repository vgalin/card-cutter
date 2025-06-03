// js/utils.js

/**
 * Converts millimeters to pixels based on DPI.
 * @param {number} mm - Millimeters.
 * @param {number} dpi - Dots Per Inch.
 * @returns {number} Pixels.
 */
function mmToPixels(mm, dpi) {
    if (dpi <= 0) return Math.round(mm * 3.77952); // Fallback, approx 96 DPI
    return Math.round(mm / 25.4 * dpi);
}

/**
 * Gets the value of an HTML element.
 * @param {string} id - The ID of the element.
 * @param {string} [type='value'] - The type of value to get ('value', 'checked', 'number', 'integer').
 * @returns {any} The value of the element.
 */
function getElementValue(id, type = 'value') {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element with ID '${id}' not found.`);
        return null;
    }
    if (type === 'checked') return el.checked;
    if (type === 'number') return parseFloat(el.value) || 0;
    if (type === 'integer') return parseInt(el.value) || 0;
    return el.value;
}

/**
 * Sets the value of an HTML element.
 * @param {string} id - The ID of the element.
 * @param {any} value - The value to set.
 * @param {string} [type='value'] - The type of value to set ('value', 'checked').
 */
function setElementValue(id, value, type = 'value') {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element with ID '${id}' not found.`);
        return;
    }
    if (type === 'checked') el.checked = !!value;
    else el.value = value;

    // Trigger change/input events if they exist, for UI updates
    if (el.onchange) el.onchange({ target: el }); // For select, checkboxes potentially
    if (el.oninput && (el.type === 'range' || el.type === 'number' || el.type === 'text')) el.oninput({ target: el }); // For range, number, text inputs
}


/**
 * Loads an image from a File object.
 * @param {File|Blob} file - The file object.
 * @returns {Promise<HTMLImageElement>} A promise that resolves with the loaded image element.
 */
function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        if (!(file instanceof Blob) && !(file instanceof File)) {
            const typeError = new TypeError('loadImageFromFile expects a File or Blob.');
            console.error(typeError.message, "Received:", file);
            reject(typeError);
            return;
        }
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => {
            console.error('Error loading image from file:', file.name, e);
            reject(new Error('Image load error: ' + file.name));
        };
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.onerror = (e) => {
            console.error('FileReader error:', file.name, e);
            reject(new Error('FileReader error: ' + file.name));
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Clamps a value between a minimum and maximum.
 * @param {number} val - The value to clamp.
 * @param {number} minv - The minimum value.
 * @param {number} maxv - The maximum value.
 * @returns {number} The clamped value.
 */
function clamp(val, minv, maxv) {
    return Math.max(minv, Math.min(val, maxv));
}