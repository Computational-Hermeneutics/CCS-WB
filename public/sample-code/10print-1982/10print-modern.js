// 10 PRINT in Modern JavaScript
// ==============================

// Direct translation - uses process.stdout for terminal output
function tenPrintDirect() {
  while (true) {
    process.stdout.write(Math.random() < 0.5 ? '╱' : '╲');
  }
}

// Browser-friendly version - writes to DOM
function tenPrintBrowser(elementId) {
  const output = document.getElementById(elementId);
  setInterval(() => {
    output.textContent += Math.random() < 0.5 ? '╱' : '╲';
  }, 10);
}

// Canvas version - visual rendering
function tenPrintCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const size = 20;
  let x = 0, y = 0;

  setInterval(() => {
    ctx.beginPath();
    if (Math.random() < 0.5) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + size, y + size);
    } else {
      ctx.moveTo(x + size, y);
      ctx.lineTo(x, y + size);
    }
    ctx.stroke();

    x += size;
    if (x >= canvas.width) {
      x = 0;
      y += size;
      if (y >= canvas.height) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        y = 0;
      }
    }
  }, 50);
}

// Functional/immutable approach
const tenPrintFunctional = () => {
  const char = () => Math.random() < 0.5 ? '╱' : '╲';
  const line = (n) => Array(n).fill(null).map(char).join('');
  const maze = (lines) => Array(lines).fill(null).map(() => line(40)).join('\n');
  console.log(maze(20));
};

// Generator-based (modern ES6)
function* tenPrintGenerator() {
  while (true) {
    yield Math.random() < 0.5 ? '╱' : '╲';
  }
}

// Usage: for (const char of tenPrintGenerator()) { ... }

// Async/await version (for rate-limiting)
async function tenPrintAsync(delay = 10) {
  while (true) {
    process.stdout.write(Math.random() < 0.5 ? '╱' : '╲');
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// What's revealed by translation:
// - The C64 version runs "instantly" - no delay
// - Modern versions need rate limiting (setInterval/setTimeout)
// - The original's GOTO is now while(true) - stigma vs. necessity
// - Unicode provides the actual diagonal characters
// - Platform differences: terminal vs. browser vs. canvas
// - Type differences: the original mixed math (205.5) with output
