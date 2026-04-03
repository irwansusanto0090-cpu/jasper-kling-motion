import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Key, Play, Loader, AlertTriangle, CheckCircle2 } from 'lucide-react';
import MediaUploader from './components/MediaUploader';
import './index.css';

const API_BASE_URL = '/api';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [isKeySaved, setIsKeySaved] = useState(false);
  
  // Form State
  const [imageFile, setImageFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('pro');
  const [cfgScale, setCfgScale] = useState(0.5);
  const [orientation, setOrientation] = useState('video');
  
  // Process State
  const [isGenerating, setIsGenerating] = useState(false);
  const [taskStatus, setTaskStatus] = useState(null); // null, 'IN_PROGRESS', 'COMPLETED', 'FAILED'
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const pollingRef = useRef(null);

  // Load API key from local storage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('freepik_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setIsKeySaved(true);
    }
  }, []);

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('freepik_api_key', apiKey.trim());
      setIsKeySaved(true);
    } else {
      localStorage.removeItem('freepik_api_key');
      setIsKeySaved(false);
    }
  };

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API_BASE_URL}/upload`, formData);
      return res.data.url;
    } catch (err) {
      console.error("Upload error:", err.response?.data || err.message);
      throw new Error(`Failed to upload ${file.name}`);
    }
  };

  const checkStatus = async (currentTaskId) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/status/${model}/${currentTaskId}`, {
        headers: {
          'x-freepik-api-key': apiKey
        }
      });
      
      const status = res.data.data.status;
      setTaskStatus(status);

      if (status === 'COMPLETED') {
        const generatedUrl = res.data.data.generated?.[0];
        if (generatedUrl) setGeneratedVideo(generatedUrl);
        setIsGenerating(false);
        if (pollingRef.current) clearInterval(pollingRef.current);
      } else if (status === 'FAILED') {
        setErrorMsg('Task failed during generation on server.');
        setIsGenerating(false);
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    } catch (err) {
      console.error("Status check failed:", err);
      // Keep polling despite network error unless it's repeated or definitive 404
    }
  };

  const handleGenerate = async () => {
    if (!apiKey) {
      setErrorMsg('Please enter your Freepik API Key first.');
      return;
    }
    if (!imageFile || !videoFile) {
      setErrorMsg('Please provide both the character image and the motion video.');
      return;
    }

    setErrorMsg('');
    setIsGenerating(true);
    setTaskStatus('UPLOADING_MEDIA');
    setGeneratedVideo(null);

    try {
      // 1. Upload Media
      const [imageUrl, videoUrl] = await Promise.all([
        uploadFile(imageFile),
        uploadFile(videoFile)
      ]);

      // 2. Submit Task
      setTaskStatus('INITIALIZING');
      const payload = {
        image_url: imageUrl,
        video_url: videoUrl,
        cfg_scale: Number(cfgScale),
        character_orientation: orientation
      };
      
      if (prompt.trim()) {
        payload.prompt = prompt.trim();
      }

      const res = await axios.post(`${API_BASE_URL}/generate/${model}`, payload, {
        headers: {
          'x-freepik-api-key': apiKey
        }
      });

      const newTaskId = res.data.data?.task_id;
      if (!newTaskId) throw new Error("No task ID returned from API");
      
      setTaskId(newTaskId);
      setTaskStatus('IN_PROGRESS');

      // 3. Poll Status
      pollingRef.current = setInterval(() => {
        checkStatus(newTaskId);
      }, 5000); // Poll every 5 seconds

    } catch (err) {
      console.error(err);
      
      let errMsg = 'Generation failed.';
      if (err.response?.data) {
        errMsg = err.response.data.error || err.response.data.message || errMsg;
        if (err.response.data.details) {
            errMsg += ` [Details: ${err.response.data.details}]`;
        }
      } else {
        errMsg = err.message || errMsg;
      }

      setErrorMsg(errMsg);
      setIsGenerating(false);
      setTaskStatus('FAILED');
    }
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return (
    <div className="app-container">
      <header className="header">
        <h1>Kling Motion Control</h1>
        <p>Transfer motion from any video to a character seamlessly</p>
      </header>

      {/* API Key Configuration */}
      <div className="api-key-section">
        <div className="api-input-wrapper">
          <Key size={18} color="var(--text-secondary)" />
          <input 
            type="password" 
            placeholder="Enter Freepik API Key..." 
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setIsKeySaved(false);
            }}
          />
          {isKeySaved ? (
            <CheckCircle2 color="var(--success-color)" size={18} title="Saved to Local Storage" />
          ) : (
            <button className="btn-secondary" onClick={handleSaveKey}>Save Key</button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: 'var(--danger-color)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertTriangle size={20} /> {errorMsg}
        </div>
      )}

      <div className="glass-panel main-grid">
        {/* Left Column: Media */}
        <div className="column">
          <MediaUploader type="image" onUploadComplete={setImageFile} />
          <MediaUploader type="video" onUploadComplete={setVideoFile} />
        </div>

        {/* Right Column: Settings */}
        <div className="column">
          <div className="form-group">
            <label>Model Configuration</label>
            <select 
              className="form-control" 
              value={model} 
              onChange={(e) => setModel(e.target.value)}
              disabled={isGenerating}
            >
              <option value="pro">Kling 3 Pro</option>
              <option value="std">Kling 3 Standard</option>
            </select>
          </div>

          <div className="form-group">
            <label>Text Prompt (Optional)</label>
            <textarea 
              className="form-control" 
              placeholder="Describe the output character style and motion..." 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              maxLength={2500}
            />
          </div>

          <div className="form-group">
            <label>Character Orientation</label>
            <select 
              className="form-control" 
              value={orientation} 
              onChange={(e) => setOrientation(e.target.value)}
              disabled={isGenerating}
            >
              <option value="video">Match Video (Best for complex motion, max 30s)</option>
              <option value="image">Match Image (Best for camera movements, max 10s)</option>
            </select>
          </div>

          <div className="form-group">
            <label>CFG Scale: {cfgScale}</label>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.1" 
              value={cfgScale} 
              onChange={(e) => setCfgScale(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          <button 
            className="btn-primary" 
            onClick={handleGenerate} 
            disabled={isGenerating || !imageFile || !videoFile || !apiKey}
            style={{ marginTop: 'auto' }}
          >
            {isGenerating ? <Loader className="spin" size={20}/> : <Play size={20}/>}
            <span>{isGenerating ? 'Processing...' : 'Transfer Motion'}</span>
          </button>
        </div>
      </div>

      {/* Result Section */}
      {taskStatus && (
        <div className="glass-panel result-section">
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <h3>Task Status</h3>
            <div style={{ margin: '1rem 0' }}>
              <span className={`status-badge status-${taskStatus?.toLowerCase()}`}>
                {taskStatus.replace('_', ' ')}
              </span>
            </div>
            
            {taskId && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'monospace' }}>Task ID: {taskId}</p>}
          </div>

          {(taskStatus === 'IN_PROGRESS' || taskStatus === 'UPLOADING_MEDIA' || taskStatus === 'INITIALIZING') && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Loader className="spin" size={40} color="var(--accent-color)" style={{ margin: '0 auto 1rem' }}/>
              <p color="var(--text-secondary)">This might take a few minutes. Please wait while AI generates your video.</p>
            </div>
          )}

          {taskStatus === 'COMPLETED' && generatedVideo && (
            <div className="generated-video-container">
              <video src={generatedVideo} controls autoPlay loop className="generated-video" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
