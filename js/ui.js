// js/ui.js

let firstImageForPreview = null; // Store the first loaded image for live preview
// Accumulate files across multiple selections/drops
let accumulatedFilesTransfer = new DataTransfer();

/**
 * Toggles the enabled/disabled state and appearance of an input container.
 * @param {string} containerId - The ID of the container element.
 * @param {boolean} isEnabled - True to enable, false to disable.
 * @param {string} [className='disabled-look'] - CSS class for disabled appearance.
 */
function toggleInputs(containerId, isEnabled, className = 'disabled-look') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.style.opacity = isEnabled ? 1 : 0.5;
    if (isEnabled) {
        container.classList.remove(className);
    } else {
        container.classList.add(className);
    }
    container.querySelectorAll('input, select, button').forEach(input => {
        // Don't disable the main enable/disable checkbox itself if it's inside the container
        if (input.id !== `enable${containerId.replace('InputsContainer', '')}`) {
            input.disabled = !isEnabled;
        }
    });
}

// Specific toggle functions
function toggleCropInputs() { toggleInputs('cropInputsContainer', getElementValue('enableCrop', 'checked')); updateLiveCropPreview(); }
function toggleBleedInputs() {
    toggleInputs('bleedInputsContainer', getElementValue('enableBleed', 'checked'));
    toggleAutoDPI();
}
function toggleSharpenInputs() { toggleInputs('sharpenInputsContainer', getElementValue('enableSharpen', 'checked')); }
function toggleAdjustmentInputs() { toggleInputs('adjustmentInputsContainer', getElementValue('enableAdjustments', 'checked')); }
function toggleResizeInputs() { toggleInputs('resizeInputsContainer', getElementValue('enableResize', 'checked')); }
function toggleRoundedCornersInputs() { toggleInputs('roundedCornersInputsContainer', getElementValue('enableRoundedCorners', 'checked')); }

function toggleAutoDPI() {
    const autoEnabled = getElementValue('useAutoDPI', 'checked');
    const bleedDPIInput = document.getElementById('bleedDPI');
    if (bleedDPIInput) bleedDPIInput.disabled = autoEnabled;
}

function togglePrintSheetInputs() {
    const enabled = getElementValue('enablePrintSheet', 'checked');
    toggleInputs('printSheetInputsContainer', enabled);
    document.getElementById('generatePrintSheetButton').style.display = (enabled && window.processedFilesData && window.processedFilesData.length > 0) ? 'inline-block' : 'none';
}

/**
 * Updates the visibility of custom page size inputs based on the selected page size.
 */
function updatePrintSheetCustomSize() {
    const customPageSizeEl = document.getElementById('customPageSizeInputs');
    if (customPageSizeEl) {
        customPageSizeEl.style.display = (getElementValue('printSheetPageSize') === 'Custom') ? 'block' : 'none';
    }
}

/**
 * Handles selected files, loads the first for preview.
 * @param {FileList} files - The files selected by the user.
 */
async function handleFiles(files) {
    const fileInput = document.getElementById('fileInput');
    const clearFilesButton = document.getElementById('clearFilesButton');

    if (files.length > 0) {
        // Add new files while keeping previously selected ones
        for (const file of files) {
            // Avoid exact duplicate entries based on name, size and lastModified
            const exists = Array.from(accumulatedFilesTransfer.files).some(
                f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
            );
            if (!exists) accumulatedFilesTransfer.items.add(file);
        }

        fileInput.files = accumulatedFilesTransfer.files;
        if (clearFilesButton) clearFilesButton.style.display = 'inline-block';


        try {
            firstImageForPreview = await loadImageFromFile(accumulatedFilesTransfer.files[0]);
            document.getElementById('liveCropPreviewSection').style.display = 'block';
            updateLiveCropPreview();
        } catch (error) {
            console.error("Error loading first image for preview:", error);
            alert("Could not load first image for preview. Check console.");
            firstImageForPreview = null;
            document.getElementById('liveCropPreviewSection').style.display = 'none';
        }
    } else if (accumulatedFilesTransfer.files.length === 0) {
        // No files left at all
        firstImageForPreview = null;
        document.getElementById('liveCropPreviewSection').style.display = 'none';
        if (clearFilesButton) clearFilesButton.style.display = 'none';
    }
}

/**
 * Clears the list of selected files.
 */
function clearFileList() {
    const fileInput = document.getElementById('fileInput');
    const clearFilesButton = document.getElementById('clearFilesButton');
    
    accumulatedFilesTransfer = new DataTransfer();
    fileInput.files = accumulatedFilesTransfer.files;
    
    firstImageForPreview = null;
    document.getElementById('liveCropPreviewSection').style.display = 'none';
    if (clearFilesButton) clearFilesButton.style.display = 'none';
    
    // Also clear the output areas
    document.getElementById('outputArea').innerHTML = '';
    document.getElementById('progressArea').innerHTML = '';
    document.getElementById('downloadZipButton').style.display = 'none';
    document.getElementById('generatePrintSheetButton').style.display = 'none';
    window.processedFilesData = [];
    
    updateLiveCropPreview();
}


/**
 * Updates the live crop preview canvas.
 */
function updateLiveCropPreview() {
    const previewCanvas = document.getElementById('liveCropPreviewCanvas');
    const liveCropPreviewSection = document.getElementById('liveCropPreviewSection');
    const zoomTop = document.getElementById('zoomTopPreview');
    const zoomBottom = document.getElementById('zoomBottomPreview');
    const zoomLeft = document.getElementById('zoomLeftPreview');
    const zoomRight = document.getElementById('zoomRightPreview');

    if (!previewCanvas || !liveCropPreviewSection) return;
    const ctx = previewCanvas.getContext('2d');
    const enableCrop = getElementValue('enableCrop', 'checked');

    if (!firstImageForPreview || liveCropPreviewSection.style.display === 'none') {
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        [zoomTop, zoomBottom, zoomLeft, zoomRight].forEach(c => {
            if (c) c.getContext('2d').clearRect(0,0,c.width,c.height);
        });
        return;
    }

    const img = firstImageForPreview;
    const PREVIEW_CONTAINER_MAX_WIDTH = 350; // Max width for the preview canvas
    const PREVIEW_CONTAINER_MAX_HEIGHT = 300; // Max height for the preview canvas

    let drawW = img.naturalWidth;
    let drawH = img.naturalHeight;

    const scale = Math.min(PREVIEW_CONTAINER_MAX_WIDTH / drawW, PREVIEW_CONTAINER_MAX_HEIGHT / drawH, 1); // Don't scale up
    
    drawW *= scale;
    drawH *= scale;

    previewCanvas.width = drawW;
    previewCanvas.height = drawH;
    ctx.drawImage(img, 0, 0, drawW, drawH);

    if (enableCrop) {
        const crop = getCurrentCropSettings(); // from presets.js
        const x0 = crop.left * scale;
        const y0 = crop.top * scale;
        const cropW = (img.naturalWidth - crop.left - crop.right) * scale;
        const cropH = (img.naturalHeight - crop.top - crop.bottom) * scale;

        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        // Fill areas outside the crop box
        ctx.fillRect(0, 0, drawW, y0); // Top bar
        ctx.fillRect(0, y0 + cropH, drawW, drawH - (y0 + cropH)); // Bottom bar
        ctx.fillRect(0, y0, x0, cropH); // Left bar
        ctx.fillRect(x0 + cropW, y0, drawW - (x0 + cropW), cropH); // Right bar

        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x0, y0, cropW, cropH); // Crop box outline

        const patchSize = 40; // area around crop line
        const zoomInput = document.getElementById('zoomFactor');
        const zoomFactor = Math.max(2, parseInt(zoomInput?.value) || 4); // how much to enlarge

        const half = patchSize / 2;
        const midX = Math.floor(img.naturalWidth / 2 - half);
        const midY = Math.floor(img.naturalHeight / 2 - half);

        if (zoomTop) {
            const sx = clamp(midX, 0, img.naturalWidth - patchSize);
            const sy = clamp(crop.top - half, 0, img.naturalHeight - patchSize);
            drawZoom(zoomTop, sx, sy, patchSize, patchSize, 0, (crop.top - sy) * zoomFactor, 'horizontal', zoomFactor);
        }
        if (zoomBottom) {
            const sy = clamp(img.naturalHeight - crop.bottom - half, 0, img.naturalHeight - patchSize);
            const sx = clamp(midX, 0, img.naturalWidth - patchSize);
            drawZoom(zoomBottom, sx, sy, patchSize, patchSize, 0, (img.naturalHeight - crop.bottom - sy) * zoomFactor, 'horizontal', zoomFactor);
        }
        if (zoomLeft) {
            const sx = clamp(crop.left - half, 0, img.naturalWidth - patchSize);
            const sy = clamp(midY, 0, img.naturalHeight - patchSize);
            drawZoom(zoomLeft, sx, sy, patchSize, patchSize, (crop.left - sx) * zoomFactor, 0, 'vertical', zoomFactor);
        }
        if (zoomRight) {
            const sx = clamp(img.naturalWidth - crop.right - half, 0, img.naturalWidth - patchSize);
            const sy = clamp(midY, 0, img.naturalHeight - patchSize);
            drawZoom(zoomRight, sx, sy, patchSize, patchSize, (img.naturalWidth - crop.right - sx) * zoomFactor, 0, 'vertical', zoomFactor);
        }
    }
}

function drawZoom(canvas, sx, sy, sw, sh, lineX, lineY, orientation, zoomFactor) {
    const ctx = canvas.getContext('2d');
    canvas.width = sw * zoomFactor;
    canvas.height = sh * zoomFactor;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(firstImageForPreview, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (orientation === 'horizontal') {
        ctx.moveTo(0, lineY);
        ctx.lineTo(canvas.width, lineY);
    } else {
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, canvas.height);
    }
    ctx.stroke();
}

/**
 * Collects all UI settings into an object.
 * @returns {object} Key-value pairs of UI settings.
 */
function getAllUiSettings() {
    const settings = {};
    const inputs = document.querySelectorAll('.container input, .container select');
    inputs.forEach(input => {
        if (input.id && input.type !== 'file') { // Exclude file inputs
            settings[input.id] = (input.type === 'checkbox' || input.type === 'radio') ? input.checked : input.value;
        }
    });
    // Capture text content of span elements used for range slider values
    document.querySelectorAll('span[id$="Value"]').forEach(span => {
        if (span.id) {
            settings[span.id + '_text'] = span.textContent;
        }
    });
    return settings;
}

/**
 * Applies settings from an object to the UI.
 * @param {object} settings - Key-value pairs of UI settings.
 */
function applyAllUiSettings(settings) {
    for (const id in settings) {
        const el = document.getElementById(id);
        if (el) {
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = settings[id];
            } else {
                el.value = settings[id];
            }
            // Trigger events to update dependent UI parts (like toggles, range value displays)
            if (typeof el.onchange === 'function') el.onchange({ target: el });
            if (typeof el.oninput === 'function') el.oninput({ target: el });

        } else if (id.endsWith('_text')) { // For span text contents
            const spanId = id.replace('_text', '');
            const spanEl = document.getElementById(spanId);
            if (spanEl) {
                spanEl.textContent = settings[id];
            }
        }
    }
    // Refresh all toggleable sections based on new checkbox states
    toggleCropInputs();
    toggleBleedInputs();
    toggleSharpenInputs();
    toggleAdjustmentInputs();
    toggleResizeInputs();
    toggleRoundedCornersInputs();
    togglePrintSheetInputs(); // This will also call toggleCardSizingInputs
    updatePrintSheetCustomSize();
    updateLiveCropPreview(); // Update preview based on new settings

    alert("UI settings imported successfully.");
}

/**
 * Exports current UI settings to a JSON file.
 */
function exportAllUiSettings() {
    const settings = getAllUiSettings();
    const jsonString = JSON.stringify(settings, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'image_processor_settings.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Imports UI settings from a JSON file.
 * @param {Event} event - The file input change event.
 */
function importAllUiSettingsFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const settings = JSON.parse(e.target.result);
            applyAllUiSettings(settings);
        } catch (err) {
            alert('Error parsing settings file: ' + err.message);
            console.error('Error parsing settings file:', err);
        }
    };
    reader.readAsText(file);
    event.target.value = null; // Reset file input
}

/**
 * Initializes all event listeners for UI elements.
 */
function initializeEventListeners() {
    // File Input and Drag & Drop
    const fileInput = document.getElementById('fileInput');
    const fileInputDropArea = document.getElementById('fileInputDropArea');
    const clearFilesButton = document.getElementById('clearFilesButton');

    if (fileInput) fileInput.addEventListener('change', e => handleFiles(e.target.files));
    if (clearFilesButton) clearFilesButton.addEventListener('click', clearFileList);

    if (fileInputDropArea) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            fileInputDropArea.addEventListener(eventName, e => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            fileInputDropArea.addEventListener(eventName, () => fileInputDropArea.classList.add('dragover'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            fileInputDropArea.addEventListener(eventName, () => fileInputDropArea.classList.remove('dragover'), false);
        });
        fileInputDropArea.addEventListener('drop', e => handleFiles(e.dataTransfer.files), false);
    }

    // Settings Import/Export
    const exportBtn = document.getElementById('exportSettingsButton');
    const importFileEl = document.getElementById('importSettingsFile');
    if (exportBtn) exportBtn.addEventListener('click', exportAllUiSettings);
    if (importFileEl) importFileEl.addEventListener('change', importAllUiSettingsFromFile);

    // Toggle Checkboxes
    const toggleMap = {
        'enableCrop': toggleCropInputs,
        'enableSharpen': toggleSharpenInputs,
        'enableAdjustments': toggleAdjustmentInputs,
        'enableResize': toggleResizeInputs,
        'enableBleed': toggleBleedInputs,
        'enableRoundedCorners': toggleRoundedCornersInputs,
        'enablePrintSheet': togglePrintSheetInputs,
        'useAutoDPI': toggleAutoDPI,
    };
    for (const id in toggleMap) {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.addEventListener('change', toggleMap[id]);
    }
    
    // Crop value inputs for live preview
    ['cropLeft', 'cropRight', 'cropTop', 'cropBottom', 'zoomFactor'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.addEventListener('input', updateLiveCropPreview);
    });

    // Preset Buttons
    const presetButtonMap = {
        'saveCropPresetButton': saveCropPreset,
        'loadCropPresetButton': () => loadSelectedCropPreset(true),
        'deleteCropPresetButton': deleteCropPreset,
        'saveBleedPresetButton': saveBleedPreset,
        'loadBleedPresetButton': () => loadSelectedBleedPreset(true),
        'deleteBleedPresetButton': deleteBleedPreset,
    };
    for (const id in presetButtonMap) {
        const button = document.getElementById(id);
        if (button) button.addEventListener('click', presetButtonMap[id]);
    }
    
    // Range Sliders value display
    ['brightness', 'contrast', 'gamma'].forEach(id => {
        const slider = document.getElementById(id);
        const display = document.getElementById(id + 'Value');
        if (slider && display) {
            // Initial display update moved to window.onload or after settings load
            slider.addEventListener('input', (e) => display.textContent = e.target.value);
        }
    });

    // Print Sheet Page Size
    const printSheetPageSizeSelect = document.getElementById('printSheetPageSize');
    if (printSheetPageSizeSelect) printSheetPageSizeSelect.addEventListener('change', updatePrintSheetCustomSize);

    // Main Action Buttons are handled in app.js as they trigger core logic
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', (e) => toggleDarkMode(e.target.checked));
    }
}

/**
 * Initial UI setup on page load.
 */
function initializeUI() {
    // Populate presets
    populatePresets('cropPreset', CROP_PRESET_STORAGE_KEY, defaultCropPresets);
    populatePresets('bleedPreset', BLEED_PRESET_STORAGE_KEY, defaultBleedPresets);
    
    // Load initial preset values (without alert)
    loadSelectedCropPreset(false); 
    loadSelectedBleedPreset(false);

    // Initialize toggle states
    toggleCropInputs();
    toggleBleedInputs();
    toggleSharpenInputs();
    toggleAdjustmentInputs();
    toggleResizeInputs();
    toggleRoundedCornersInputs();
    togglePrintSheetInputs(); // This correctly calls toggleCardSizingInputs and hides section if needed
    
    updatePrintSheetCustomSize();

    // Set initial display for range sliders
    ['brightness', 'contrast', 'gamma'].forEach(id => {
        const slider = document.getElementById(id);
        const display = document.getElementById(id + 'Value');
        if (slider && display) {
            display.textContent = slider.value;
        }
    });

    // Initialize dark mode
    const darkModeToggle = document.getElementById('darkModeToggle');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode === '1' || (savedMode === null && prefersDark)) {
        if (darkModeToggle) darkModeToggle.checked = true;
        toggleDarkMode(true);
    } else {
        if (darkModeToggle) darkModeToggle.checked = false;
        toggleDarkMode(false);
    }
}

// Expose functions that might be called from presets.js or other modules if needed
window.updateLiveCropPreview = updateLiveCropPreview;

function toggleDarkMode(enabled) {
    document.body.classList.toggle('dark-mode', enabled);
    localStorage.setItem('darkMode', enabled ? '1' : '0');
}