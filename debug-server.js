// Simple debug server to test CORS and basic connectivity
import express from 'express';
import cors from 'cors';

const app = express();

// Very permissive CORS for debugging
const corsOptions = {
  origin: true, // Allow all origins for debugging
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested from:', req.headers.origin || 'no origin');
  console.log('Request headers:', req.headers);
  res.status(200).json({ 
    status: 'OK', 
    message: 'Debug server is running',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin
  });
});

// Auth test endpoint
app.post('/auth/test', (req, res) => {
  console.log('Auth test requested from:', req.headers.origin || 'no origin');
  console.log('Request body:', req.body);
  res.status(200).json({ 
    message: 'Auth endpoint working',
    receivedData: req.body 
  });
});

// Catch all endpoint
app.use('*', (req, res) => {
  console.log(`Request to ${req.method} ${req.originalUrl} from:`, req.headers.origin || 'no origin');
  res.status(200).json({ 
    message: 'Debug server caught request',
    method: req.method,
    url: req.originalUrl,
    headers: req.headers
  });
});

const port = 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Debug server running on port ${port}`);
  console.log('This server allows all CORS origins for debugging');
}); 