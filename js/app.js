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
    const roundedCornerRadiusMM = doRoundedCorners ? getElementValue('roundedCornerRadiusMM', 'number') : 0;

    const doBleed = getElementValue('enableBleed', 'checked');
    const bleedSettings = doBleed ? getCurrentBleedSettings() : { mm: 0, dpi: 300, cutMarks: false, cutLength: 0, cutThickness: 0 }; // from presets.js
    const useAutoDPI = getElementValue('useAutoDPI', 'checked');

    const showPreviews = getElementValue('enableImagePreview', 'checked');

    const isPrintSheetEnabled = getElementValue('enablePrintSheet', 'checked');
    const printSheetDPI = isPrintSheetEnabled ? getElementValue('printSheetDPI', 'integer') : 300;
    
    const isCardSizingForPrintEnabled = isPrintSheetEnabled;

    let referenceCardWidthMM = 0;
    let referenceCardHeightMM = 0;
    if (useAutoDPI || isCardSizingForPrintEnabled) {
        const units = getElementValue('referenceCardUnits');
        const multiplier = units === 'inches' ? 25.4 : 1;
        referenceCardWidthMM = (getElementValue('referenceCardWidth', 'number') * multiplier) || 63;
        referenceCardHeightMM = (getElementValue('referenceCardHeight', 'number') * multiplier) || 88;
    }
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

            let autoDPI = bleedSettings.dpi;
            if (useAutoDPI) {
                if (referenceCardWidthMM > 0 && referenceCardHeightMM > 0) {
                    const dpiFromWidth = contentCanvas.width / (referenceCardWidthMM / 25.4);
                    const dpiFromHeight = contentCanvas.height / (referenceCardHeightMM / 25.4);
                    autoDPI = (dpiFromWidth + dpiFromHeight) / 2;
                } else {
                    console.warn('Auto-DPI enabled, but reference card dimensions are zero. Falling back to bleed DPI setting.');
                }
            }
            const baseDPI = useAutoDPI ? autoDPI : bleedSettings.dpi;
            const dpiForMmConversion = isPrintSheetEnabled ? printSheetDPI : baseDPI;

            if (doRoundedCorners && roundedCornerRadiusMM > 0) {
                const roundedCornerRadiusPx = mmToPixels(roundedCornerRadiusMM, dpiForMmConversion); // from utils.js
                contentCanvas = applyRoundedCorners(contentCanvas, roundedCornerRadiusPx);
                currentMimeType = 'image/png'; // Rounded corners need transparency
            }

            // Specific sizing for print sheet (applied to contentCanvas)
            if (isCardSizingForPrintEnabled) {
                const targetContentPxW = mmToPixels(referenceCardWidthMM, dpiForMmConversion);
                const targetContentPxH = mmToPixels(referenceCardHeightMM, dpiForMmConversion);

                // Resize the image to match the target content size
                const sizedCanvas = document.createElement('canvas');
                sizedCanvas.width = targetContentPxW;
                sizedCanvas.height = targetContentPxH;
                const sizedCtx = sizedCanvas.getContext('2d');
                sizedCtx.drawImage(contentCanvas, 0, 0, targetContentPxW, targetContentPxH);
                contentCanvas = sizedCanvas;
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
    if (typeof JSZip === 'undefined') {
        alert('Error: JSZip library is not loaded. Cannot create ZIP file.');
        return;
    }
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
 * Generates a multi-page PDF print sheet from processed images.
 */
function generatePrintSheet() {
    if (!window.processedFilesData || window.processedFilesData.length === 0) {
        alert("No images processed yet. Process images first.");
        return;
    }

    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
        alert("Error: jsPDF library is not loaded. Cannot create PDF file.");
        return;
    }

    const outputArea = document.getElementById('outputArea');
    let printSheetContainer = document.getElementById('printSheetContainer');
    if (!printSheetContainer) {
        printSheetContainer = document.createElement('div');
        printSheetContainer.id = 'printSheetContainer';
        outputArea.appendChild(printSheetContainer);
    }
    printSheetContainer.innerHTML = '<p>Generating PDF print sheet...</p>';

    // --- Get Settings ---
    let pageWidthMM = getElementValue('printSheetPageWidthMM', 'number');
    let pageHeightMM = getElementValue('printSheetPageHeightMM', 'number');
    const pageSizeType = getElementValue('printSheetPageSize');
    if (pageSizeType === 'A4') { pageWidthMM = 210; pageHeightMM = 297; }
    else if (pageSizeType === 'Letter') { pageWidthMM = 215.9; pageHeightMM = 279.4; }

    const orientation = getElementValue('printSheetOrientation');
    const isLandscape = orientation === 'landscape';
    if (isLandscape) {
        [pageWidthMM, pageHeightMM] = [pageHeightMM, pageWidthMM];
    }

    const marginMM = getElementValue('printSheetMarginMM', 'number');
    const cardSpacingMM = getElementValue('printSheetCardSpacingMM', 'number');

    const usableWidthMM = pageWidthMM - (2 * marginMM);
    const usableHeightMM = pageHeightMM - (2 * marginMM);

    const isPrintSheetEnabled = getElementValue('enablePrintSheet', 'checked');
    const printSheetDPI = getElementValue('printSheetDPI', 'integer');

    // --- PDF Initialization ---
    const doc = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: [pageWidthMM, pageHeightMM]
    });

    let currentX = marginMM;
    let currentY = marginMM;
    let maxRowHeightMM = 0;
    let cardsOnSheet = 0;
    let pageCount = 1;

    const cardQuantity = getElementValue('cardQuantity', 'integer');
    const allCardsToPrint = [];
    for (let i = 0; i < cardQuantity; i++) {
        allCardsToPrint.push(...window.processedFilesData);
    }

    // --- Card Processing Loop ---
    for (let i = 0; i < allCardsToPrint.length; i++) {
        const cardData = allCardsToPrint[i];
        if (!cardData.canvasElement || !(cardData.canvasElement instanceof HTMLCanvasElement)) {
            console.warn(`Skipping card "${cardData.name}" due to invalid canvas element.`);
            continue;
        }

        let cardWidthMM, cardHeightMM;

        if (isPrintSheetEnabled) {
            let targetCardW_mm = getElementValue('referenceCardWidth', 'number');
            let targetCardH_mm = getElementValue('referenceCardHeight', 'number');
            const units = getElementValue('referenceCardUnits');
            if (units === 'inches') {
                targetCardW_mm *= 25.4;
                targetCardH_mm *= 25.4;
            }
            cardWidthMM = targetCardW_mm;
            cardHeightMM = targetCardH_mm;
        } else {
            // Use the canvas dimensions and DPI to calculate the size in mm
            const dpi = useAutoDPI ? autoDPI : getElementValue('bleedDPI', 'integer');
            cardWidthMM = (cardData.widthNoBleed / dpi) * 25.4;
            cardHeightMM = (cardData.heightNoBleed / dpi) * 25.4;
        }

        const bleedMM = getElementValue('enableBleed', 'checked') ? getElementValue('bleedMM', 'number') : 0;
        const cardTotalWidthMM = cardWidthMM + (2 * bleedMM);
        const cardTotalHeightMM = cardHeightMM + (2 * bleedMM);

        if (currentX + cardTotalWidthMM > usableWidthMM + marginMM - 0.001) {
            currentX = marginMM;
            currentY += maxRowHeightMM + cardSpacingMM;
            maxRowHeightMM = 0;
        }

        if (currentY + cardTotalHeightMM > usableHeightMM + marginMM - 0.001) {
            doc.addPage();
            pageCount++;
            currentX = marginMM;
            currentY = marginMM;
            maxRowHeightMM = 0;
        }

        doc.addImage(cardData.canvasElement, 'PNG', currentX, currentY, cardTotalWidthMM, cardTotalHeightMM);
        cardsOnSheet++;

        currentX += cardTotalWidthMM + cardSpacingMM;
        if (cardTotalHeightMM > maxRowHeightMM) {
            maxRowHeightMM = cardTotalHeightMM;
        }
    }

    // --- Finalize PDF ---
    if (cardsOnSheet === 0) {
        printSheetContainer.innerHTML = '<p>Print sheet generated, but no cards could fit. Try different settings.</p>';
        return;
    }

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);

    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = 'print_sheet.pdf';
    link.textContent = `Download Print Sheet PDF (${pageCount} page(s))`;
    link.classList.add('file-download-link');

    printSheetContainer.innerHTML = ''; // Clear the "generating" message
    printSheetContainer.appendChild(link);
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