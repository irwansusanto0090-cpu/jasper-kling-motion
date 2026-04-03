import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Scissors, Loader } from 'lucide-react';
import { getVideoDuration, cutVideo } from '../utils/ffmpeg-utils';

function MediaUploader({ type, onUploadComplete }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [needsTrimming, setNeedsTrimming] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  
  // Trimming State
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(30);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (type === 'image') {
      if (!selectedFile.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      onUploadComplete(selectedFile);
    } else if (type === 'video') {
      if (!selectedFile.type.startsWith('video/')) {
        alert('Please select a video file.');
        return;
      }
      setIsProcessing(true);
      const duration = await getVideoDuration(selectedFile);
      setIsProcessing(false);

      if (duration > 30) {
        setFile(selectedFile);
        setVideoDuration(duration);
        setNeedsTrimming(true);
        setEndTime(30);
        setPreview(URL.createObjectURL(selectedFile));
      } else {
        setFile(selectedFile);
        setPreview(URL.createObjectURL(selectedFile));
        onUploadComplete(selectedFile);
      }
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setNeedsTrimming(false);
    onUploadComplete(null);
  };

  const handleTrim = async () => {
    if (endTime - startTime > 30) {
      alert("Trim duration cannot exceed 30 seconds.");
      return;
    }
    if (startTime >= endTime) {
      alert("Start time must be less than end time.");
      return;
    }

    setIsProcessing(true);
    try {
      const cutFile = await cutVideo(file, startTime, endTime);
      setFile(cutFile);
      setPreview(URL.createObjectURL(cutFile));
      setNeedsTrimming(false);
      onUploadComplete(cutFile);
    } catch (err) {
      console.error(err);
      alert("Failed to trim video.");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (videoRef.current && needsTrimming) {
      videoRef.current.currentTime = startTime;
    }
  }, [startTime, needsTrimming]);

  return (
    <div className="uploader-container">
      <div className="uploader-header">
        <h3>{type === 'image' ? 'Character Reference (Image)' : 'Motion Source (Video)'}</h3>
        {file && !needsTrimming && <button className="clear-btn" onClick={clearFile}><X size={16} /></button>}
      </div>

      {!file && !needsTrimming && (
        <div 
          className="drop-zone" 
          onClick={() => fileInputRef.current.click()}
        >
          {isProcessing ? <Loader className="spin" /> : <Upload size={32} />}
          <p>Click to upload {type}</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept={type === 'image' ? "image/*" : "video/*"} 
            className="hidden" 
          />
        </div>
      )}

      {/* Preview Section */}
      {file && !needsTrimming && (
         <div className="preview-container">
           {type === 'image' ? (
             <img src={preview} alt="Upload preview" className="preview-media" />
           ) : (
             <video src={preview} className="preview-media" controls muted />
           )}
         </div>
      )}

      {/* Trimming Section */}
      {needsTrimming && (
        <div className="trimmer-container">
          <p className="warning-text">Video is &gt;30s ({Math.round(videoDuration)}s). Please trim it.</p>
          <video ref={videoRef} src={preview} className="trim-preview" muted />
          
          <div className="trim-controls">
            <div className="trim-inputs">
              <label>
                Start (s): 
                <input 
                  type="number" 
                  value={startTime} 
                  min="0" 
                  max={videoDuration - 1} 
                  onChange={(e) => setStartTime(Number(e.target.value))} 
                />
              </label>
              <label>
                End (s): 
                <input 
                  type="number" 
                  value={endTime} 
                  min={startTime + 1} 
                  max={Math.min(videoDuration, startTime + 30)} 
                  onChange={(e) => setEndTime(Number(e.target.value))} 
                />
              </label>
            </div>
            
            <div className="duration-indicator">
              Selected Duration: {endTime - startTime}s (Max 30s)
            </div>

            <div className="trim-actions">
              <button className="btn-secondary" onClick={clearFile} disabled={isProcessing}>Cancel</button>
              <button className="btn-primary" onClick={handleTrim} disabled={isProcessing}>
                {isProcessing ? <Loader className="spin" size={16}/> : <Scissors size={16}/>}
                <span>Crop Video</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MediaUploader;
