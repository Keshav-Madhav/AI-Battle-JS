let fps = 60;
let fpsInterval = 1000 / fps;
let lastFrameTime = Date.now();
let frameTimes = [];
let currentFps = 0;
let avgFps = 0;
let onePercentLowFps = 0;

/**
 * Draw FPS on canvas
 * @param {number} width - Width of canvas
 * @param {number} height - Height of canvas
 * @param {CanvasRenderingContext2D} context - 2D rendering context for the canvas
 */
const drawFPS = (width, height, context) => {
  let now = Date.now();
  let frameTime = now - lastFrameTime;
  lastFrameTime = now;

  // Update current FPS
  currentFps = Math.round(1000 / frameTime);

  // Store frame time for average and 1% low calculations
  frameTimes.push(frameTime);
  if (frameTimes.length > fps) {
    frameTimes.shift(); // Keep only the last second's worth of frames
  }

  // Calculate average FPS over the last second
  const totalFrameTime = frameTimes.reduce((a, b) => a + b, 0);
  avgFps = Math.round(1000 / (totalFrameTime / frameTimes.length));

  // Calculate 1% low FPS
  const sortedFrameTimes = [...frameTimes].sort((a, b) => b - a);
  const onePercentLowIndex = Math.ceil(sortedFrameTimes.length * 0.01);
  const onePercentLowTime = sortedFrameTimes.slice(0, onePercentLowIndex).reduce((a, b) => a + b, 0) / onePercentLowIndex;
  onePercentLowFps = Math.round(1000 / onePercentLowTime);

  // Position and dimensions for the FPS display
  const rectWidth = 80;
  const rectHeight = 40;
  const rectX = width - rectWidth - 10; // 10px from right edge
  const rectY = 10;
  const textX = rectX + 5; // 5px padding from left edge of rectangle
  const lineHeight = 12;
  const firstLineY = rectY + lineHeight;

  // Draw background rectangle
  context.fillStyle = 'rgba(255, 255, 255, 0.5)';
  context.fillRect(rectX, rectY, rectWidth, rectHeight);

  // Draw FPS metrics (left-aligned within rectangle)
  context.fillStyle = 'black';
  context.font = '11px sans-serif';
  context.textAlign = 'left';
  
  context.fillText(`FPS: ${currentFps}`, textX, firstLineY);
  context.fillText(`Avg: ${avgFps}`, textX, firstLineY + lineHeight);
  context.fillText(`1% Low: ${onePercentLowFps}`, textX, firstLineY + (lineHeight * 2));

  return {
    currentFps,
    avgFps,
    onePercentLowFps,
  };
}

export { drawFPS };