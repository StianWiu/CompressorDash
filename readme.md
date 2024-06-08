# Compressor Dash

Compressor Dash is a web application that allows users to browse and compress media files stored on their computer or server using a Vue.js front-end and an Express.js back-end. It leverages `ffmpeg` for media compression.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Features

- Browse media files through a user-friendly web interface
- Compress media files to save storage space
- View and manage compressed media files

## Installation

To install and run Compressor Dash locally, follow these steps:

### Prerequisites

- Docker

### Pull the Docker Image

You can pull the Docker image from Docker Hub using the following command:

```sh
docker pull stianwiu/compressor-dash:latest
```

### Run the Docker Container

Run the Docker container with the appropriate volume and port bindings:

```sh
docker run -p 3000:[your_port] -v [local_directory]:/mnt/media stianwiu/compressor-dash
```

Replace `[your_port]` with the port number you want to bind to port 3000 inside the container, and `[local_directory]` with the path to the local directory you want to bind to `/mnt/media` inside the container.

### Example Command

```sh
docker run -p 3000:3000 -v /path/to/local/directory:/mnt/media stianwiu/compressor-dash
```

## Usage

Once the application is running, you can access it at `http://localhost:3000`.

### Browse and Compress Media

1. Select the folder containing your media files.
2. Select the speed, higher means lower compression.
3. Press start.

## Contributing

Contributions are welcome. If you have any ideas, suggestions, or bug reports, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
