const express = require('express');
const path = require('path');
const app = express();
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const cors = require('cors');
const bodyParser = require('body-parser');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../web/dist')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/dist/index.html'));
});

let currentPath = '/mnt/media/';  // Default path
const dbFilePath = '/mnt/storage/compressedVideos.json';

let currentFFmpegProcess = null;
let shouldStop = false;
let totalFiles = 0;
let processedFiles = 0;
let currentFile = null;
let currentProgress = 0;
let compressedVideos = [];
let isProcessing = false;
let queue = [];

// Load compressed videos database
if (fs.existsSync(dbFilePath)) {
  compressedVideos = JSON.parse(fs.readFileSync(dbFilePath));
} else {
  fs.ensureFileSync(dbFilePath);
  fs.writeJsonSync(dbFilePath, []);
}

app.post('/api/ffmpeg', async (req, res) => {
  const type = req.body.type;
  const ffmpegOptions = req.body.options || [];
  const dir = currentPath;  // Use a local copy of currentPath

  if (type === 'start') {
    if (isProcessing) {
      return res.status(400).send('A processing task is already running.');
    }
    isProcessing = true;
    totalFiles = await countVideoFiles(dir);
    processedFiles = 0;
    shouldStop = false;
    currentFile = null;
    currentProgress = 0;
    processVideos(dir, ffmpegOptions).then(() => {
      console.log('Finished processing videos');
      isProcessing = false;
      shouldStop = false;
    }).catch((error) => {
      console.error('Error processing videos:', error);
      isProcessing = false;
    });
    res.send('Started processing videos');
  } else if (type === 'stop') {
    shouldStop = true;
    if (currentFFmpegProcess) {
      currentFFmpegProcess.kill('SIGKILL');
    }
    resetState();
    res.send('Stopping processing videos');
  } else {
    res.status(400).send('Invalid type');
  }
});

app.get('/api/ffmpeg/progress', (req, res) => {
  res.json({
    totalFiles,
    processedFiles,
    currentFile,
    currentProgress
  });
});

app.get('/api/ffmpeg/queue', (req, res) => {
  res.json(queue);
});

function resetState() {
  currentFFmpegProcess = null;
  currentFile = null;
  currentProgress = 0;
  isProcessing = false;
}

async function countVideoFiles(dir) {
  queue = [];  // Reset queue
  const files = await fs.readdir(dir);
  let count = 0;
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      count += await countVideoFiles(filePath);
    } else {
      const isVideo = await isVideoFile(filePath);
      if (isVideo && !compressedVideos.includes(filePath)) count++;
      queue.push({
        path: filePath,
        size: stat.size / 1024 / 1024,  // Convert to MB
        newSize: null,  // New size will be updated after compression
        progress: 0,
        finished: false,
        active: false
      });
    }
  }
  return count;
}

async function processVideos(dir, ffmpegOptions) {
  const files = await fs.readdir(dir);
  for (const file of files) {
    if (shouldStop) break;

    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      await processVideos(filePath, ffmpegOptions);
    } else {
      const isVideo = await isVideoFile(filePath);
      if (isVideo && !compressedVideos.includes(filePath)) {
        try {
          if (shouldStop) break;
          currentFile = filePath;
          const queueIndex = queue.findIndex(item => item.path === filePath);
          if (queueIndex !== -1) {
            queue[queueIndex].active = true;
          }
          await compressVideo(filePath, ffmpegOptions);
          processedFiles++;
          currentFile = null;
          currentProgress = 0;
          if (queueIndex !== -1) {
            const newSize = (await fs.stat(filePath)).size / 1024 / 1024;  // Convert to MB
            queue[queueIndex].finished = true;
            queue[queueIndex].active = false;
            queue[queueIndex].progress = 100;
            queue[queueIndex].newSize = newSize;
          }
        } catch (error) {
          console.error(`Failed to process ${filePath}: ${error.message}`);
        }
      }
    }
  }
}

async function isVideoFile(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata || !metadata.format) {
        resolve(false);
      } else {
        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        resolve(!!videoStream);
      }
    });
  });
}

function parseTimemark(timemark) {
  const parts = timemark.split(':');
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
}

async function compressVideo(filePath, ffmpegOptions) {
  return new Promise((resolve, reject) => {
    if (shouldStop) {
      resolve(); // Skip compression if stopping
      return;
    }

    const compressedPath = filePath.replace(/\.mp4$/, '.compress.mp4');
    let fileDuration = 0;

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (metadata && metadata.format && metadata.format.duration) {
        fileDuration = metadata.format.duration;
      }
    });

    currentFFmpegProcess = ffmpeg(filePath)
      .output(compressedPath)
      .addOptions(ffmpegOptions)
      .on('progress', (progress) => {
        if (fileDuration > 0 && progress.timemark) {
          currentProgress = (parseTimemark(progress.timemark) / fileDuration) * 100;
          const queueIndex = queue.findIndex(item => item.path === filePath);
          if (queueIndex !== -1) {
            queue[queueIndex].progress = currentProgress;
          }
        }
      })
      .on('end', async () => {
        if (shouldStop) {
          resolve(); // Resolve if stopping
          return;
        }
        try {
          const isValid = await validateVideo(compressedPath);
          if (isValid) {
            // Check if the new file is smaller than the original
            const originalSize = (await fs.stat(filePath)).size;
            const compressedSize = (await fs.stat(compressedPath)).size;
            fs.writeJsonSync(dbFilePath, compressedVideos);
            if (compressedSize >= originalSize) {
              await fs.remove(compressedPath);
              resolve();
              return;
            }
            await fs.remove(filePath);
            await fs.rename(compressedPath, filePath);
            compressedVideos.push(filePath);
          } else {
            await fs.remove(compressedPath);
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      })
      .on('error', async (err) => {
        await fs.remove(compressedPath);
        reject(err);
      })
      .run();
  });
}

async function validateVideo(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

app.post('/api/browse', (req, res) => {
  if (req.body.type === 'read') {
    fs.readdir(currentPath, (err, files) => {
      if (err) {
        res.status(500).send(err);
        return;
      } else {
        res.send({
          path: currentPath,
          files: files
        });
      }
    });
  } else if (req.body.type === 'move') {
    if (req.body.dir === '..') {
      if (currentPath === '/mnt/media/') {
        res.status(200).send(currentPath);
      } else {
        currentPath = path.join(currentPath, '..');
        res.status(200).send(currentPath);
      }
    } else {
      currentPath = path.join(currentPath, req.body.dir);
      res.status(200).send("OK");
    }
  }
});

const PORT = process.env.SERVER_PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
