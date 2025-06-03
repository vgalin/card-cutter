// js/ui.js

let firstImageForPreview = null; // Store the first loaded image for live preview

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
function toggleCardSizingInputs() { toggleInputs('cardSizingInputsContainer', getElementValue('enableCardSizingForPrint', 'checked')); }

function toggleAutoDPI() {
    const autoEnabled = getElementValue('useAutoDPI', 'checked');
    const bleedDPIInput = document.getElementById('bleedDPI');
    if (bleedDPIInput) bleedDPIInput.disabled = autoEnabled;
}

function togglePrintSheetInputs() {
    const enabled = getElementValue('enablePrintSheet', 'checked');
    toggleInputs('printSheetInputsContainer', enabled);
    document.getElementById('generatePrintSheetButton').style.display = (enabled && window.processedFilesData && window.processedFilesData.length > 0) ? 'inline-block' : 'none';
    
    const targetCardDimensionsSection = document.getElementById('targetCardDimensionsSection');
    if (targetCardDimensionsSection) {
        targetCardDimensionsSection.style.display = enabled ? 'block' : 'none';
    }
    if (enabled) { // If print sheet is enabled, sync its sub-toggle
        toggleCardSizingInputs(); // This reads the 'enableCardSizingForPrint' checkbox
    }
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
    if (files.length > 0) {
        fileInput.files = files; // Ensure the input element itself has the files reference
        try {
            firstImageForPreview = await loadImageFromFile(files[0]);
            document.getElementById('liveCropPreviewSection').style.display = 'block';
            updateLiveCropPreview();
        } catch (error) {
            console.error("Error loading first image for preview:", error);
            alert("Could not load first image for preview. Check console.");
            firstImageForPreview = null;
            document.getElementById('liveCropPreviewSection').style.display = 'none';
        }
    } else {
        firstImageForPreview = null;
        document.getElementById('liveCropPreviewSection').style.display = 'none';
    }
}

/**
 * Updates the live crop preview canvas.
 */
function updateLiveCropPreview() {
    const previewCanvas = document.getElementById('liveCropPreviewCanvas');
    const liveCropPreviewSection = document.getElementById('liveCropPreviewSection');
    
    if (!previewCanvas || !liveCropPreviewSection) return;
    const ctx = previewCanvas.getContext('2d');
    const enableCrop = getElementValue('enableCrop', 'checked');

    if (!firstImageForPreview || liveCropPreviewSection.style.display === 'none') {
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
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
    }
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
    if (fileInput) fileInput.addEventListener('change', e => handleFiles(e.target.files));
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
        'enableCardSizingForPrint': toggleCardSizingInputs,
        'enablePrintSheet': togglePrintSheetInputs,
        'useAutoDPI': toggleAutoDPI,
    };
    for (const id in toggleMap) {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.addEventListener('change', toggleMap[id]);
    }
    
    // Crop value inputs for live preview
    ['cropLeft', 'cropRight', 'cropTop', 'cropBottom'].forEach(id => {
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
}

// Expose functions that might be called from presets.js or other modules if needed
window.updateLiveCropPreview = updateLiveCropPreview;