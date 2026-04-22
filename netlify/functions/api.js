import serverless from 'serverless-http';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = express();
app.use(cors());
app.use(express.json());

// Set up serverless-friendly tmp directory for uploads
const uploadDir = os.tmpdir();
const upload = multer({ dest: uploadDir });

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Upload to tmpfiles.org
    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const response = await axios.post('https://tmpfiles.org/api/v1/upload', formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    // Clean up local temp file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (response.data && response.data.data && response.data.data.url) {
      // tmpfiles.org returns https://tmpfiles.org/123/file.mp4
      // We must modify the URL to access it directly: https://tmpfiles.org/dl/123/file.mp4
      let url = response.data.data.url;
      url = url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      // Force HTTPS if it returned HTTP
      url = url.replace(/^http:\/\//i, 'https://');
      console.log('Generated tmpfiles URL:', url);
      return res.json({ url });
    }

    res.status(500).json({ error: 'Failed to upload to tmpfiles.' });
  } catch (error) {
    console.error('Upload Error:', error.message);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/generate/:model', async (req, res) => {
  const { model } = req.params; // 'pro' or 'std'
  const apiKey = req.headers['x-freepik-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API Key missing' });
  }

  const endpoint = model === 'pro' 
    ? 'https://api.freepik.com/v1/ai/video/kling-v3-motion-control-pro'
    : 'https://api.freepik.com/v1/ai/video/kling-v3-motion-control-std';

  try {
    console.log(`Sending payload to Freepik (${model}):`, req.body);
    const response = await axios.post(endpoint, req.body, {
      headers: {
        'x-freepik-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Generate Error:', error.response?.data || error.message);
    
    // Extract Freepik detailed problem if exists
    let errorMsg = 'Failed to start generation';
    let details = '';

    if (error.response?.data) {
      if (error.response.data.problem) {
        errorMsg = error.response.data.problem.message;
        if (error.response.data.problem.invalid_params) {
          details = error.response.data.problem.invalid_params
            .map(p => `${p.name}: ${p.reason}`)
            .join(' | ');
        }
      } else if (error.response.data.message) {
        errorMsg = error.response.data.message;
      }
    }

    if (errorMsg) {
      errorMsg = errorMsg.replace(/https:\/\/www\.freepik\.com[^\s]*/gi, '');
      errorMsg = errorMsg.replace(/freepik/gi, 'TEXA');
    }
    if (details) {
      details = details.replace(/https:\/\/www\.freepik\.com[^\s]*/gi, '');
      details = details.replace(/freepik/gi, 'TEXA');
    }

    res.status(error.response?.status || 500).json({ error: errorMsg, details });
  }
});

app.get('/api/status/:model/:taskId', async (req, res) => {
  const { model, taskId } = req.params;
  const apiKey = req.headers['x-freepik-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API Key missing' });
  }

  const endpoint = model === 'pro' 
    ? `https://api.freepik.com/v1/ai/video/kling-v3-motion-control-pro/${taskId}`
    : `https://api.freepik.com/v1/ai/video/kling-v3-motion-control-std/${taskId}`;

  try {
    const response = await axios.get(endpoint, {
      headers: {
        'x-freepik-api-key': apiKey
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Status Error:', error.response?.data || error.message);
    let respData = error.response?.data || { error: 'Failed to fetch status' };
    let respString = JSON.stringify(respData);
    respString = respString.replace(/https:\/\/www\.freepik\.com[^\s\\]*/gi, '');
    respString = respString.replace(/freepik/gi, 'TEXA');
    res.status(error.response?.status || 500).json(JSON.parse(respString));
  }
});

// IMPORTANT: Instead of app.listen, we wrap the app with serverless-http
export const handler = serverless(app);
