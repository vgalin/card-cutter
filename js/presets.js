// js/presets.js

const CROP_PRESET_STORAGE_KEY = 'imageProcessorCropPresets_v2';
const BLEED_PRESET_STORAGE_KEY = 'imageProcessorBleedPresets_v2';

const defaultCropPresets = {
    "Pokemon Card (Default)": { left: 1012, right: 1012, top: 650, bottom: 650 },
    "None (No Crop)": { left: 0, right: 0, top: 0, bottom: 0 }
};

const defaultBleedPresets = {
    "Standard 1mm Bleed (300DPI)": { mm: 1.0, dpi: 300, cutMarks: true, cutLength: 1.0, cutThickness: 1 },
    "No Bleed/Marks": { mm: 0, dpi: 300, cutMarks: false, cutLength: 0, cutThickness: 0 }
};

function getCurrentCropSettings() {
    return {
        left: getElementValue('cropLeft', 'integer'),
        right: getElementValue('cropRight', 'integer'),
        top: getElementValue('cropTop', 'integer'),
        bottom: getElementValue('cropBottom', 'integer')
    };
}

function setCropSettings(settings) {
    setElementValue('cropLeft', settings.left);
    setElementValue('cropRight', settings.right);
    setElementValue('cropTop', settings.top);
    setElementValue('cropBottom', settings.bottom);
    // updateLiveCropPreview() will be called by the input's event listener or manually after this
}

function getCurrentBleedSettings() {
    return {
        mm: getElementValue('bleedMM', 'number'),
        dpi: getElementValue('bleedDPI', 'integer'),
        cutMarks: getElementValue('addCutMarks', 'checked'),
        cutLength: getElementValue('cutLengthMM', 'number'),
        cutThickness: getElementValue('cutThicknessPX', 'integer')
    };
}

function setBleedSettings(settings) {
    setElementValue('bleedMM', settings.mm);
    setElementValue('bleedDPI', settings.dpi);
    setElementValue('addCutMarks', settings.cutMarks, 'checked');
    setElementValue('cutLengthMM', settings.cutLength);
    setElementValue('cutThicknessPX', settings.cutThickness);
}

function populatePresets(selectId, storageKey, defaultPresets = {}) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '';
    const presets = { ...defaultPresets, ...(JSON.parse(localStorage.getItem(storageKey)) || {}) };
    for (const name in presets) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    }
    if (select.options.length > 0) {
        select.selectedIndex = 0;
    }
}

function savePreset(storageKey, presetNameInputId, currentSettingsGetter, selectId, defaultPresets) {
    const presetName = getElementValue(presetNameInputId).trim();
    if (!presetName) {
        alert('Please enter a name for the preset.');
        return;
    }
    const storedPresets = JSON.parse(localStorage.getItem(storageKey)) || {};
    storedPresets[presetName] = currentSettingsGetter();
    localStorage.setItem(storageKey, JSON.stringify(storedPresets));
    populatePresets(selectId, storageKey, defaultPresets);
    setElementValue(selectId, presetName);
    setElementValue(presetNameInputId, '');
    alert(`Preset "${presetName}" saved.`);
}

function loadPresetFromSelect(selectId, storageKey, settingsSetter, defaultPresets, eventTriggered = true) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const presetName = select.value;
    if (!presetName) {
        if (eventTriggered) alert('No preset selected.');
        return;
    }
    const allAvailableSettings = { ...defaultPresets, ...(JSON.parse(localStorage.getItem(storageKey)) || {}) };
    if (allAvailableSettings[presetName]) {
        settingsSetter(allAvailableSettings[presetName]);
        if (eventTriggered) alert(`Preset "${presetName}" loaded.`);
        
        // Manually trigger update for live preview if it's crop settings
        if (selectId === 'cropPreset' && typeof window.updateLiveCropPreview === 'function') {
            window.updateLiveCropPreview();
        }

    } else {
        if (eventTriggered) alert(`Preset "${presetName}" could not be found.`);
    }
}

function deletePreset(selectId, storageKey, settingsSetter, defaultPresets) {
    const select = document.getElementById(selectId);
     if (!select) return;
    const presetName = select.value;
    if (!presetName) {
        alert('No preset selected to delete.');
        return;
    }

    const isDefault = !!defaultPresets[presetName];
    const storedPresets = JSON.parse(localStorage.getItem(storageKey)) || {};

    if (isDefault && !storedPresets[presetName]) { // It's a default preset not overridden by a user save
        alert(`Preset "${presetName}" is a default and cannot be deleted directly. You can save a new preset with the same name to override it, then delete that version.`);
        return;
    }

    if (!confirm(`Are you sure you want to delete your saved preset "${presetName}"? This action cannot be undone.`)) return;

    if (storedPresets[presetName]) {
        delete storedPresets[presetName];
        localStorage.setItem(storageKey, JSON.stringify(storedPresets));
        alert(`Stored preset "${presetName}" deleted.`);
    } else if (isDefault) {
         alert(`Preset "${presetName}" is a default preset. It cannot be deleted, only overridden. No user-saved version found to delete.`);
         return;
    } else {
        alert(`No stored preset named "${presetName}" to delete.`);
    }
    
    populatePresets(selectId, storageKey, defaultPresets);
    
    // Try to select the first available preset and load it
    if (select.options.length > 0) {
        select.value = select.options[0].value;
        loadPresetFromSelect(selectId, storageKey, settingsSetter, defaultPresets, false);
    } else {
        // If no presets left, clear settings or set to a very basic default
        if (selectId === 'cropPreset') {
            settingsSetter({ left: 0, right: 0, top: 0, bottom: 0 });
        } else if (selectId === 'bleedPreset') {
            settingsSetter({ mm: 0, dpi: 300, cutMarks: false, cutLength: 0, cutThickness: 0 });
        }
        if (typeof window.updateLiveCropPreview === 'function') {
            window.updateLiveCropPreview();
        }
    }
}

// Specific handlers
function saveCropPreset() { savePreset(CROP_PRESET_STORAGE_KEY, 'newCropPresetName', getCurrentCropSettings, 'cropPreset', defaultCropPresets); }
function loadSelectedCropPreset(eventTriggered = true) { loadPresetFromSelect('cropPreset', CROP_PRESET_STORAGE_KEY, setCropSettings, defaultCropPresets, eventTriggered); }
function deleteCropPreset() { deletePreset('cropPreset', CROP_PRESET_STORAGE_KEY, setCropSettings, defaultCropPresets); }

function saveBleedPreset() { savePreset(BLEED_PRESET_STORAGE_KEY, 'newBleedPresetName', getCurrentBleedSettings, 'bleedPreset', defaultBleedPresets); }
function loadSelectedBleedPreset(eventTriggered = true) { loadPresetFromSelect('bleedPreset', BLEED_PRESET_STORAGE_KEY, setBleedSettings, defaultBleedPresets, eventTriggered); }
function deleteBleedPreset() { deletePreset('bleedPreset', BLEED_PRESET_STORAGE_KEY, setBleedSettings, defaultBleedPresets); }