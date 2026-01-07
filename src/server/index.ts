import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { config } from './config';

import roomsRouter from './routes/rooms';
import songsRouter from './routes/songs';
import queueRouter from './routes/queue';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/rooms', roomsRouter);
app.use('/api/songs', songsRouter);
app.use('/api/queue', queueRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.server.nodeEnv === 'development' ? err.message : undefined,
  });
});

// Start server - BACKEND ALWAYS USES PORT 3001
const PORT = 3001; // Explicitly set to 3001, ignore env vars to prevent conflicts

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📡 API available at: http://localhost:${PORT}/api`);
  console.log(`\n🌐 Access from other devices:`);
  console.log(`   Find your local IP: ipconfig (Windows) or ifconfig (Mac/Linux)`);
  console.log(`   API: http://YOUR_IP:${PORT}/api`);
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Backend port ${PORT} is already in use!`);
    console.error(`   Attempting to kill process on port ${PORT}...`);
    
    // Try to kill the process automatically
    exec(`powershell -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`, (error: any) => {
      if (error) {
        console.error(`   Run: powershell -ExecutionPolicy Bypass -File ./scripts/kill-port.ps1`);
        console.error(`   Or manually kill the process using: netstat -ano | findstr :${PORT}\n`);
        process.exit(1);
      } else {
        console.log(`   Process killed. Please restart the server.`);
        process.exit(1);
      }
    });
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

// Graceful shutdown handlers (nodemon will send SIGTERM)
const gracefulShutdown = (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force close after 3 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 3000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

