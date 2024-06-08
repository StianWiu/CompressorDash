<template>
  <div id="main">
    <h1>Compressor</h1>
    <select class="custom-select" name="files" id="folderSelector">
      <option v-if="this.refresh" selected disabled>{{ this.path }}</option>
      <option
        v-for="(file, index) in files"
        :key="index"
        @click="this.move(file)"
      >
        {{ file }}
      </option>
    </select>
    <h3>Speed</h3>
    <select v-model="speed">
      <option>ultrafast</option>
      <option>superfast</option>
      <option>veryfast</option>
      <option>faster</option>
      <option>fast</option>
      <option>medium</option>
      <option>slow</option>
      <option>slower</option>
      <option>veryslow</option>
    </select>
    <div v-if="!this.active">
      <button
        v-if="this.speed !== undefined"
        class="startStop"
        @click="this.start()"
      >
        Start
      </button>
      <button
        v-else
        class="startStop"
        style="cursor: not-allowed; background-color: #999ca1"
      >
        Start
      </button>
    </div>
    <div v-else>
      <button class="startStop" @click="this.stop()">Stop</button>
    </div>
    <div id="queue">
      <div class="video" v-for="(video, index) in queue" :key="index">
        <div
          v-if="video.progress === 0"
          class="colorBlock"
          style="background-color: #e36f7b"
        >
          {{
            video.progress
              .toString()
              .slice(0, video.progress.toString().lastIndexOf(".") + 2)
          }}%
        </div>
        <div
          v-else-if="!video.progress.toString().startsWith(100)"
          class="colorBlock"
          style="background-color: #db966e"
        >
          {{
            video.progress
              .toString()
              .slice(0, video.progress.toString().lastIndexOf(".") + 2)
          }}%
        </div>
        <div v-else class="colorBlock" style="background-color: #6fe377">
          100%
        </div>
        <div class="videoInfo">
          <p>
            {{
              video.path.slice(
                video.path.lastIndexOf("/") + 1,
                video.path.length
              )
            }}
          </p>
        </div>
        <div v-if="video.newSize" class="videoInfoSize">
          <p>{{ video.size }}</p>
          <br />
          <!-- Calculate % difference -->
          <span v-if="video.difference > 100" style="color: #e36f7b">
            +{{ video.difference - 100 }}%
          </span>
          <span v-else-if="video.difference < 100" style="color: #6fe377">
            -{{ video.difference - 100 }}%
          </span>
          <br />
          <p class="newSize">{{ video.newSize }}</p>
        </div>
        <div v-else class="videoInfoSize">
          <p>{{ video.size }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
const axios = require("axios");

// Get IP and Port from url
const url = window.location.href;
const ip = url.slice(0, url.lastIndexOf(":") + 3);
const port = url.slice(url.lastIndexOf(":") + 3, url.lastIndexOf("/"));

const apiUrl = `${ip}${port}/api`;

export default {
  name: "App",
  data() {
    return {
      files: [],
      path: "",
      active: false,
      refresh: true,
      queue: [],
      speed: undefined,
    };
  },
  mounted() {
    this.readDir();
    setInterval(() => {
      this.progress();
    }, 1000);
  },
  methods: {
    async readDir() {
      await axios({
        method: "post",
        url: apiUrl + "/browse",
        data: {
          type: "read",
        },
      })
        .then((response) => {
          // Remove all files from list
          let tempList = [".."];
          for (let i = 0; response.data.files.length > i; i++) {
            if (
              response.data.files[i].indexOf(".") < 0 ||
              response.data.files[i].startsWith(".")
            ) {
              tempList.push(response.data.files[i]);
            }
          }
          this.files = tempList;
          this.path = response.data.path;
        })
        .catch(async () => {
          await axios({
            method: "post",
            url: apiUrl + "/browse",
            data: {
              type: "move",
              dir: "..",
            },
          });
        });
    },
    async move(file) {
      this.refresh = false;
      await axios({
        method: "post",
        url: apiUrl + "/browse",
        data: {
          type: "move",
          dir: file,
        },
      }).then((response) => {
        this.path = response.data;
        this.readDir();
        this.refresh = true;
      });
    },
    async progress() {
      await axios({
        method: "get",
        url: apiUrl + "/queue",
      }).then((response) => {
        let tempQueue = [];
        // if filesize is above 1gb, convert to gb, it is already converted to mb
        for (let i = 0; i < response.data.queue.length; i++) {
          let size = response.data.queue[i].size;
          let newSize = response.data.queue[i].newSize;
          let difference = (newSize / size) * 100;
          if (size > 1000) {
            size = (size / 1000).toFixed(2) + " GB";
          } else {
            size = size.toFixed(2) + " MB";
          }

          if (newSize === null) {
            newSize = 0;
          } else if (newSize > 1000) {
            // Difference in %
            newSize = (newSize / 1000).toFixed(2) + " GB";
          } else {
            newSize = newSize.toFixed(2) + " MB";
          }

          tempQueue.push({
            path: response.data.queue[i].path,
            size: size,
            newSize: newSize,
            difference: difference.toFixed(2),
            progress: response.data.queue[i].progress,
          });
        }

        // Check if not all files are done

        this.active = response.data.active;
        this.queue = tempQueue;
      });
    },
    start() {
      axios({
        method: "post",
        url: apiUrl + "/ffmpeg/start",
        data: {
          ffmpegOptions: ["-c:v libx264", "-crf 22", "-preset " + this.speed],
        },
      });
    },
    stop() {
      axios({
        method: "post",
        url: apiUrl + "/ffmpeg/stop",
      });
    },
  },
};
</script>

<style lang="scss">
// Save colors
$background: #1c1b22;
$accent: #2b2a33;
$highlight: #42414d;

body,
html,
#app {
  margin: 0;
  padding: 0;
  height: 100%;
  background-color: $background;
}

#main {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #fff;
  margin-top: 60px;
}

.custom-select {
  min-width: 350px;
  position: relative;
}

select {
  appearance: none;
  /*  safari  */
  -webkit-appearance: none;
  /*  other styles for aesthetics */
  width: auto;
  font-size: 1.15rem;
  padding: 0.675em 6em 0.675em 1em;
  background-color: $accent;
  border: 1px solid $highlight;
  border-radius: 0.25rem;
  color: #fff;
  cursor: pointer;
}

.custom-select::before,
.custom-select::after {
  --size: 0.3rem;
  content: "";
  position: absolute;
  right: 1rem;
  pointer-events: none;
}

.custom-select::before {
  border-left: var(--size) solid transparent;
  border-right: var(--size) solid transparent;
  border-bottom: var(--size) solid black;
  top: 40%;
}

.custom-select::after {
  border-left: var(--size) solid transparent;
  border-right: var(--size) solid transparent;
  border-top: var(--size) solid black;
  top: 55%;
}

#queue {
  display: flex;
  flex-direction: column;
  background-color: $accent;
  width: 75%;
  margin-top: 20px;

  .video {
    margin: 10px;
    border-radius: 20px;
    // Make border radius affect children
    overflow: hidden;
    background-color: $highlight;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: space-between;
    align-items: stretch;
    align-content: stretch;

    min-height: 100px;

    .videoInfo {
      max-width: 90%;
    }

    .colorBlock {
      min-width: 10%;
      max-width: 10%;
      height: 100%;
      margin-right: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .videoInfoSize {
      min-width: 10%;
      max-width: 10%;
      height: 100%;
      margin-right: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-direction: column;

      font-size: 15px;

      p {
        margin: 5px;
      }

      .newSize {
        font-size: 14px;
        // Slight transparency
        opacity: 0.4;
      }
    }
  }

  div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    // background-color: $highlight;
  }
}

.startStop {
  margin-top: 20px;
}

/* CSS */
button {
  background-color: #ea4c89;
  border-radius: 8px;
  border-style: none;
  box-sizing: border-box;
  color: #ffffff;
  cursor: pointer;
  display: inline-block;
  font-family: "Haas Grot Text R Web", "Helvetica Neue", Helvetica, Arial,
    sans-serif;
  font-size: 14px;
  font-weight: 500;
  height: 40px;
  line-height: 20px;
  list-style: none;
  margin: 0;
  outline: none;
  padding: 10px 16px;
  position: relative;
  text-align: center;
  text-decoration: none;
  transition: color 100ms;
  vertical-align: baseline;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

button:hover,
button:focus {
  background-color: #f082ac;
}
</style>
