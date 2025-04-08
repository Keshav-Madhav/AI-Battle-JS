/**
 * Resizes all canvas elements in the canvasArray to maintain the specified aspect ratio.
 * @param {Object} options - The options for resizing the canvas.
 * @param {HTMLCanvasElement[]} options.canvasArray - An array of canvas elements to resize.
 * @param {number} [options.ratio] - The target aspect ratio for the canvas elements. Defaults to fullscreen if not specified.
 */
export function resizeCanvas({ canvasArray, ratio }) {
  // Get the target aspect ratio or default to fullscreen
  const targetRatio = ratio || window.innerWidth / window.innerHeight;
  const windowRatio = window.innerWidth / window.innerHeight;
  
  // Determine the width and height of the canvas
  let width, height;
  if (windowRatio > targetRatio) {
    // Fit to height
    height = window.innerHeight;
    width = height * targetRatio;
  } else {
    // Fit to width
    width = window.innerWidth;
    height = width / targetRatio;
  }

  // Resize each canvas element
  canvasArray.forEach(canvas => {
    canvas.width = width;
    canvas.height = height;
  });
}