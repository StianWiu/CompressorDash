const express = require('express');
const app = express();

const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');


app.use(cors());
app.use(bodyParser.json());

// Serve the web app
app.use(express.static(path.join(__dirname, '../web/dist')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/dist/index.html'));
});

let currentPath = '/mnt/media/';
// let currentPath = 'C:/Users/pignu/Desktop/ASMR Videos/test';
let finishedVideosPath = "/mnt/storage/compressedVideos.json";
// let finishedVideosPath = "C:/Users/pignu/Desktop/ASMR Videos/test/test/compressedVideos.json";

// Make sure compressedVideos.json exists
if (!fs.existsSync(finishedVideosPath)) {
  fs.ensureFileSync(finishedVideosPath);
  fs.writeJsonSync(finishedVideosPath, []);
}



const finishedVideo = (videoPath) => {
  let tempArray = fs.readJsonSync(finishedVideosPath);
  tempArray.push(videoPath);
  fs.writeJsonSync(finishedVideosPath, tempArray);
}

let queue = [];
let stop = false;
let started = false;

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

app.get('/api/queue', (req, res) => {
  res.send({
    queue: queue,
    active: started
  });
});

app.post('/api/ffmpeg/start', async (req, res) => {
  if (started) {
    res.send('Already processing videos');
    return;
  }
  started = true;
  stop = false;
  const ffmpegOptions = req.body.ffmpegOptions;
  await createQueue();
  res.send('Started processing videos');
  // Loop through queue, compressing videos, then update queue with new sizes and the progress while compressing.
  for (let i = 0; i < queue.length; i++) {
    if (stop) {
      break;
    }
    const video = queue[i];
    try {
      const newPath = await compressFile(video.path, ffmpegOptions);
      if (stop) {
        // Delete the compressed file if the process was stopped
        await fs.unlink(newPath);
        break;
      }
      video.newSize = fs.statSync(newPath).size / 1024 / 1024;
      console.log('Compressed file:', video.path);

      // If the compressed file is larger than the original file, delete the compressed file
      if (video.newSize > video.size) {
        await fs.unlink(newPath);
        console.log('Compressed file is larger than original file, deleting compressed file');
        continue;
      }

      // Remove original file
      await fs.unlink(video.path);
      // Move compressed file to original file path
      await fs.move(newPath, video.path);
      // Add video to finished videos
      finishedVideo(video.path);
    } catch (error) {
      console.error('Error compressing file:', error);
      if (stop) {
        // Delete the compressed file if the process was stopped
        await fs.unlink(video.path.replace('.mp4', '-compressed.mp4'));
      }
      // Continue to next file
      continue;
    }
  }
  console.log('Finished processing videos');
  stop = false;
});

app.post('/api/ffmpeg/stop', (req, res) => {
  stop = true;
  started = false;
  res.send('Stopping processing videos');
});

// Recursively get all videos in a directory, then sort alphabetically

const getVideos = async (dir) => {
  // Check if the directory exists
  if (!fs.existsSync(dir)) {
    return [];
  }
  const files = await fs.readdir(dir);
  const videos = await Promise.all(files.map(async (file) => {
    const filePath = path.join(dir, file);
    try {

      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        return getVideos(filePath);
      } else {
        // Check if the file is a video, not only mp4
        if (file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.webm') || file.endsWith('.avi') || file.endsWith('.mov') || file.endsWith('.flv') || file.endsWith('.wmv') || file.endsWith('.m4v') || file.endsWith('.mpg') || file.endsWith('.mpeg') || file.endsWith('.m2v') || file.endsWith('.m4v') || file.endsWith('.ts') || file.endsWith('.flv')) {
          return filePath;
        }
      }
    } catch (error) {
      console.error('Error getting videos:', error);
    }
  }));
  return videos.flat().filter((video) => video);
};

// Get videos, then sort them alphabetically, then get their filesize, then add them to queue.
const createQueue = async () => {
  let videos = await getVideos(currentPath);
  videos.sort();
  // Make sure not to queue a video that is already compressed
  const compressedVideos = fs.readJsonSync(finishedVideosPath);
  videos = videos.filter((video) => !compressedVideos.includes(video));
  const videosWithSize = await Promise.all(videos.map(async (video) => {
    try {
      const stat = await fs.stat(video);
      return {
        path: video,
        size: stat.size / 1024 / 1024,
        newSize: null,
        progress: 0
      };
    } catch (error) {
      console.error('Error getting file size:', error);
      return;
    }
  }));
  queue = videosWithSize;
}

const compressFile = async (filePath, ffmpegOptions) => {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    const outputPath = filePath.replace('.mp4', '-compressed.mp4');
    let ffmpegProcess = ffmpeg(filePath)
      .addOptions(ffmpegOptions)
      .output(outputPath)
      .on('end', () => {
        // Set progress to 100% when finished
        const queueIndex = queue.findIndex(item => item.path === filePath);
        if (queueIndex !== -1) {
          queue[queueIndex].progress = 100;
        }
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(err);
      }).on('progress', (progress) => {
        // Update progress in queue
        const queueIndex = queue.findIndex(item => item.path === filePath);
        if (queueIndex !== -1) {
          queue[queueIndex].progress = progress.percent;
        }
        if (stop) {
          // Set progress to 0% when stopped
          const queueIndex = queue.findIndex(item => item.path === filePath);
          if (queueIndex !== -1) {
            queue[queueIndex].progress = 0;
          }
          ffmpegProcess.kill('SIGKILL');
          ffmpegProcess.on('exit', async () => {
            try {
              reject('Stopped processing');
            } catch (err) {
              reject(err);
            }
          });
        }
      })
      .save(outputPath);
  });
};


app.listen(3000, () => {
  console.log(`Server is running on port 3000`);
});