// js/app.js

// Global state for processed files, accessible by other modules if needed via window object
window.processedFilesData = []; // Array to store { name, dataUrl, canvasElement, ... }

/**
 * Main image processing function.
 */
async function processImages() {
    const files = document.getElementById('fileInput').files;
    if (files.length === 0) {
        alert('Please select image files.');
        return;
    }

    const outputArea = document.getElementById('outputArea');
    const progressArea = document.getElementById('progressArea');
    outputArea.innerHTML = '';
    progressArea.innerHTML = `<p>Processing ${files.length} image(s)...</p><progress id="progressBar" value="0" max="${files.length}"></progress>`;
    const progressBar = document.getElementById('progressBar');
    
    window.processedFilesData = []; // Reset global array

    // --- Retrieve all settings once ---
    const doCrop = getElementValue('enableCrop', 'checked');
    const cropSettings = doCrop ? getCurrentCropSettings() : null; // from presets.js

    const doSharpen = getElementValue('enableSharpen', 'checked');
    const sharpenIntensity = doSharpen ? getElementValue('sharpenIntensity', 'number') : 0;

    const doAdjustments = getElementValue('enableAdjustments', 'checked');
    const brightness = doAdjustments ? getElementValue('brightness', 'number') : 0;
    const contrast = doAdjustments ? getElementValue('contrast', 'number') : 0;
    const gamma = doAdjustments ? getElementValue('gamma', 'number') : 1.0;

    const doGeneralResize = getElementValue('enableResize', 'checked');
    const generalResizeWidth = doGeneralResize ? getElementValue('resizeWidth', 'integer') : 0;
    const generalResizeHeight = doGeneralResize ? getElementValue('resizeHeight', 'integer') : 0;
    const generalResizeMaintainAspect = doGeneralResize ? getElementValue('resizeMaintainAspect', 'checked') : true;

    const doRoundedCorners = getElementValue('enableRoundedCorners', 'checked');
    const roundedCornerRadiusMM_input = doRoundedCorners ? getElementValue('roundedCornerRadiusMM', 'number') : 0;

    const doBleed = getElementValue('enableBleed', 'checked');
    const bleedSettings = doBleed ? getCurrentBleedSettings() : { mm: 0, dpi: 300, cutMarks: false, cutLength: 0, cutThickness: 0 }; // from presets.js

    const showPreviews = getElementValue('enableImagePreview', 'checked');

    const isPrintSheetEnabled = getElementValue('enablePrintSheet', 'checked');
    const printSheetDPI = isPrintSheetEnabled ? getElementValue('printSheetDPI', 'integer') : (bleedSettings.dpi || 300) ;
    const dpiForMmConversion = printSheetDPI > 0 ? printSheetDPI : 300; // Ensure valid DPI for conversions

    const isCardSizingForPrintEnabled = isPrintSheetEnabled && getElementValue('enableCardSizingForPrint', 'checked');
    // --- End settings retrieval ---

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const dotIndex = file.name.lastIndexOf('.');
        const baseName = dotIndex === -1 ? file.name : file.name.substring(0, dotIndex);
        let currentMimeType = file.type === "image/jpeg" ? "image/jpeg" : "image/png"; // Default to PNG

        try {
            let originalImage = await loadImageFromFile(file); // from utils.js
            
            let workingCanvas = document.createElement('canvas');
            workingCanvas.width = originalImage.naturalWidth;
            workingCanvas.height = originalImage.naturalHeight;
            let ctx = workingCanvas.getContext('2d');
            ctx.drawImage(originalImage, 0, 0);

            if (doCrop && cropSettings) {
                workingCanvas = cropImage(originalImage, cropSettings.left, cropSettings.right, cropSettings.top, cropSettings.bottom);
            }
            
            if (doSharpen && sharpenIntensity > 0) {
                workingCanvas = applySharpen(workingCanvas, sharpenIntensity);
            }
            
            if (doAdjustments) {
                workingCanvas = applyImageAdjustments(workingCanvas, brightness, contrast, gamma);
            }
            
            if (doGeneralResize && (generalResizeWidth > 0 || generalResizeHeight > 0)) {
                workingCanvas = resizeImage(workingCanvas, generalResizeWidth, generalResizeHeight, generalResizeMaintainAspect);
            }

            let contentCanvas = workingCanvas; // This is the canvas before final print sizing and bleed

            if (doRoundedCorners && roundedCornerRadiusMM_input > 0) {
                const roundedCornerRadiusPx = mmToPixels(roundedCornerRadiusMM_input, dpiForMmConversion); // from utils.js
                contentCanvas = applyRoundedCorners(contentCanvas, roundedCornerRadiusPx);
                currentMimeType = 'image/png'; // Rounded corners need transparency
            }

            // Specific sizing for print sheet (applied to contentCanvas)
            if (isCardSizingForPrintEnabled) {
                let targetCardW_mm = getElementValue('targetCardWidth', 'number');
                let targetCardH_mm = getElementValue('targetCardHeight', 'number');
                const units = getElementValue('targetCardUnits');
                if (units === 'inches') {
                    targetCardW_mm *= 25.4;
                    targetCardH_mm *= 25.4;
                }
                const targetContentPxW = mmToPixels(targetCardW_mm, dpiForMmConversion);
                const targetContentPxH = mmToPixels(targetCardH_mm, dpiForMmConversion);
                contentCanvas = resizeImage(contentCanvas, targetContentPxW, targetContentPxH, true); // Maintain aspect for card content
            }
            
            const widthNoBleed = contentCanvas.width;
            const heightNoBleed = contentCanvas.height;
            let finalCanvas = contentCanvas;

            if (doBleed && bleedSettings.mm > 0) {
                const bleedPx = mmToPixels(bleedSettings.mm, dpiForMmConversion);
                if (bleedPx > 0) {
                    finalCanvas = addBleed(contentCanvas, bleedPx);
                    if (bleedSettings.cutMarks && bleedSettings.cutLength > 0 && bleedSettings.cutThickness > 0) {
                        const cutPx = mmToPixels(bleedSettings.cutLength, dpiForMmConversion);
                        finalCanvas = addCutMarks(finalCanvas, bleedPx, cutPx, bleedSettings.cutThickness);
                    }
                }
            }
            
            const dataUrl = finalCanvas.toDataURL(currentMimeType, currentMimeType === "image/jpeg" ? 0.92 : undefined);
            const finalExtension = currentMimeType === 'image/png' ? '.png' : '.jpg';
            const newFileName = `${baseName}_processed${finalExtension}`;
            
            window.processedFilesData.push({ 
                name: newFileName, 
                dataUrl: dataUrl, 
                canvasElement: finalCanvas, // Store the canvas for print sheet generation
                originalWidth: originalImage.naturalWidth, 
                originalHeight: originalImage.naturalHeight,
                widthNoBleed: widthNoBleed, // Dimensions of content before bleed
                heightNoBleed: heightNoBleed,
                processedWidth: finalCanvas.width, // Full dimensions with bleed
                processedHeight: finalCanvas.height 
            });

            if (showPreviews) {
                const imgPreview = document.createElement('img');
                imgPreview.src = dataUrl;
                imgPreview.alt = `Preview of ${newFileName}`;
                imgPreview.title = `Click to download ${newFileName}`;
                imgPreview.classList.add('preview-thumb');
                imgPreview.onclick = () => {
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = newFileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                };
                outputArea.appendChild(imgPreview);
            } else {
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = newFileName;
                link.textContent = `Download ${newFileName}`;
                link.classList.add('file-download-link');
                outputArea.appendChild(link);
                outputArea.appendChild(document.createElement('br'));
            }
        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            const errorMsg = document.createElement('p');
            errorMsg.textContent = `Error processing ${file.name}: ${error.message}`;
            errorMsg.style.color = 'red';
            outputArea.appendChild(errorMsg);
        }
        progressBar.value = i + 1;
    }

    progressArea.innerHTML += '<p>Processing complete!</p>';
    if (window.processedFilesData.length > 0) {
        document.getElementById('downloadZipButton').style.display = 'inline-block';
        if (isPrintSheetEnabled) {
            document.getElementById('generatePrintSheetButton').style.display = 'inline-block';
        }
    } else {
        document.getElementById('downloadZipButton').style.display = 'none';
        document.getElementById('generatePrintSheetButton').style.display = 'none';
    }
}

/**
 * Downloads all processed images as a ZIP file.
 */
async function downloadAllAsZip() {
    if (window.processedFilesData.length === 0) {
        alert("No files processed to download.");
        return;
    }
    const zip = new JSZip();
    for (const fileData of window.processedFilesData) {
        const base64Data = fileData.dataUrl.split(',')[1];
        zip.file(fileData.name, base64Data, { base64: true });
    }
    try {
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = "processed_images_individual.zip";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } catch (error) {
        console.error("Error generating ZIP:", error);
        alert("Error generating ZIP file. See console for details.");
    }
}

/**
 * Generates a print sheet from processed images.
 */
function generatePrintSheet() {
    if (!window.processedFilesData || window.processedFilesData.length === 0) {
        alert("No images processed yet. Process images first.");
        return;
    }

    const outputArea = document.getElementById('outputArea');
    const progressPara = document.createElement('p');
    progressPara.textContent = 'Generating print sheet... ';
    // Clear previous individual previews/links before adding print sheet link and progress.
    outputArea.querySelectorAll('img.preview-thumb, a.file-download-link:not([download^="print_sheet"]), br, p').forEach(el => el.remove());
    outputArea.appendChild(progressPara);

    let pageWidthMM = getElementValue('printSheetPageWidthMM', 'number');
    let pageHeightMM = getElementValue('printSheetPageHeightMM', 'number');
    const pageSizeType = getElementValue('printSheetPageSize');

    if (pageSizeType === 'A4') { pageWidthMM = 210; pageHeightMM = 297; }
    else if (pageSizeType === 'Letter') { pageWidthMM = 215.9; pageHeightMM = 279.4; }
    
    const orientation = getElementValue('printSheetOrientation');
    if (orientation === 'landscape') {
        [pageWidthMM, pageHeightMM] = [pageHeightMM, pageWidthMM]; // Swap
    }
    
    const printSheetDPI = getElementValue('printSheetDPI', 'integer');
    if (printSheetDPI <= 0) {
        alert("Print Sheet DPI must be a positive number.");
        progressPara.textContent = "Error: Invalid Print Sheet DPI.";
        return;
    }

    const marginMM = getElementValue('printSheetMarginMM', 'number');
    const cardSpacingMM = getElementValue('printSheetCardSpacingMM', 'number');

    const pageWidthPx = mmToPixels(pageWidthMM, printSheetDPI);
    const pageHeightPx = mmToPixels(pageHeightMM, printSheetDPI);
    const marginPx = mmToPixels(marginMM, printSheetDPI);
    const cardSpacingPx = mmToPixels(cardSpacingMM, printSheetDPI);

    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = pageWidthPx;
    sheetCanvas.height = pageHeightPx;
    const sheetCtx = sheetCanvas.getContext('2d');
    sheetCtx.fillStyle = 'white'; // Background color for the sheet
    sheetCtx.fillRect(0, 0, pageWidthPx, pageHeightPx);

    let currentX = marginPx;
    let currentY = marginPx;
    let maxRowHeight = 0;
    let cardsOnSheet = 0;

    for (const cardData of window.processedFilesData) {
        // Ensure cardData.canvasElement is valid (it should be from processImages)
        if (!cardData.canvasElement || !(cardData.canvasElement instanceof HTMLCanvasElement)) {
            console.warn(`Skipping card "${cardData.name}" due to invalid canvas element for print sheet.`);
            continue;
        }
        const cardCanvasToDraw = cardData.canvasElement;
        const cardPrintWidthPx = cardCanvasToDraw.width;  // This is full width WITH bleed
        const cardPrintHeightPx = cardCanvasToDraw.height; // This is full height WITH bleed

        if (currentX + cardPrintWidthPx > pageWidthPx - marginPx + 1 && currentX > marginPx + 1) { // +1 for float issues, check if not first item in row
            currentX = marginPx;
            currentY += maxRowHeight + cardSpacingPx;
            maxRowHeight = 0;
        }
        
        if (currentY + cardPrintHeightPx > pageHeightPx - marginPx + 1) { // +1 for float issues
            console.log(`Not enough space for card "${cardData.name}". CurrentY: ${currentY}, CardH: ${cardPrintHeightPx}, Page usable height: ${pageHeightPx - marginPx}`);
            break; // Stop if card doesn't fit vertically
        }
        
        sheetCtx.drawImage(cardCanvasToDraw, currentX, currentY);
        cardsOnSheet++;
        currentX += cardPrintWidthPx + cardSpacingPx;
        if (cardPrintHeightPx > maxRowHeight) {
            maxRowHeight = cardPrintHeightPx;
        }
    }

    if (cardsOnSheet === 0 && window.processedFilesData.length > 0) {
        progressPara.textContent = 'Print sheet generated, but no cards could fit with current settings. Try adjusting page size, margins, or card dimensions.';
        console.warn("No cards fit on the print sheet.");
        return;
    } else if (cardsOnSheet < window.processedFilesData.length) {
         progressPara.textContent += ` Not all cards fit. ${cardsOnSheet} of ${window.processedFilesData.length} placed.`;
    }

    const sheetDataUrl = sheetCanvas.toDataURL('image/png'); // Print sheets are usually best as PNG
    const link = document.createElement('a');
    link.href = sheetDataUrl;
    link.download = 'print_sheet.png';
    link.textContent = 'Download Print Sheet (PNG)';
    link.classList.add('file-download-link');
    outputArea.appendChild(link);
    progressPara.textContent += ' Print sheet generated.';
}


// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI elements and event listeners from ui.js
    if (typeof initializeEventListeners === 'function') {
        initializeEventListeners();
    }
    if (typeof initializeUI === 'function') {
        initializeUI();
    }

    // Attach main action button listeners
    const processBtn = document.getElementById('processImagesButton');
    const zipBtn = document.getElementById('downloadZipButton');
    const printSheetBtn = document.getElementById('generatePrintSheetButton');

    if (processBtn) processBtn.addEventListener('click', processImages);
    if (zipBtn) zipBtn.addEventListener('click', downloadAllAsZip);
    if (printSheetBtn) printSheetBtn.addEventListener('click', generatePrintSheet);
});