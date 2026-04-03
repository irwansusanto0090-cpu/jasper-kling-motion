import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg = null;

export const initFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;
  
  ffmpeg = new FFmpeg();
  
  // Try to load FFmpeg. Wait until loaded to return it.
  try {
    await ffmpeg.load({
      coreURL: `https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js`,
      wasmURL: `https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm`
    });
    console.log("FFmpeg loaded successfully");
    return ffmpeg;
  } catch (error) {
    console.error("Failed to load FFmpeg:", error);
    throw error;
  }
};

/**
 * Cut video from startTime to endTime
 * @param {File} videoFile 
 * @param {number} startTime (seconds)
 * @param {number} endTime (seconds)
 * @returns {Promise<File>} 
 */
export const cutVideo = async (videoFile, startTime, endTime) => {
  if (!ffmpeg || !ffmpeg.loaded) {
    await initFFmpeg();
  }

  const inputName = 'input.mp4';
  const outputName = 'output.mp4';
  
  // Write file to memory
  const fileData = await fetchFile(videoFile);
  await ffmpeg.writeFile(inputName, fileData);
  
  // Execute FFmpeg command
  // -ss: start time
  // -to: end time
  // -c copy: avoid re-encoding if possible, but for precise cutting we let it encode by dropping -c copy
  const duration = endTime - startTime;
  
  console.log(`Starting to cut video from ${startTime}s with duration ${duration}s`);
  // Note: -ss before -i is faster.
  await ffmpeg.exec([
    '-ss', startTime.toString(),
    '-i', inputName,
    '-t', duration.toString(),
    '-c:v', 'libx264', '-crf', '23', '-preset', 'ultrafast',
    '-c:a', 'aac',
    outputName
  ]);

  // Read the output
  const outputData = await ffmpeg.readFile(outputName);
  
  // Create File from output buffer
  const blob = new Blob([outputData.buffer], { type: 'video/mp4' });
  const newFile = new File([blob], `cut_${videoFile.name}`, { type: 'video/mp4' });
  
  return newFile;
};

/**
 * Gets video metadata (duration) avoiding full playback overhead
 */
export const getVideoDuration = (file) => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      resolve(video.duration);
      URL.revokeObjectURL(video.src);
    };
    
    video.src = URL.createObjectURL(file);
  });
};
