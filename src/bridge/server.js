import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../core/logger.js';

/**
 * ReaBridgeServer - IPC Bridge for Browser Extension & Desktop UI
 */
export class ReaBridgeServer {
  /**
   * @param {import('../core/queue-manager.js').QueueManager} queueManager
   * @param {Object} [options={}]
   * @param {number} [options.port=41719]
   */
  constructor(queueManager, options = {}) {
    this.queueManager = queueManager;
    this.port = options.port || 41719;
    this.wss = null;
    this.clients = new Set();
  }

  /**
   * Starts WebSocket server
   */
  start() {
    this.wss = new WebSocketServer({
      port: this.port,
      host: '127.0.0.1' // Restrict to localhost only
    });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      logger.info('BRIDGE', 'WebExtension client connected to NIKA bridge');

      // Send initial task state
      ws.send(JSON.stringify({
        type: 'initial_state',
        payload: {
          tasks: this.queueManager.getAllTasks()
        }
      }));

      ws.on('message', async (messageData) => {
        try {
          const message = JSON.parse(messageData.toString());
          await this._handleMessage(ws, message);
        } catch (err) {
          logger.warn('BRIDGE', `Error handling bridge message: ${err.message}`);
          ws.send(JSON.stringify({
            type: 'error',
            payload: { message: err.message }
          }));
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.debug('BRIDGE', 'WebExtension client disconnected from bridge');
      });
    });

    this._setupQueueEvents();
  }

  /**
   * Subscribes to QueueManager events and broadcasts them
   * @private
   */
  _setupQueueEvents() {
    this.queueManager.on('task-added', (task) => {
      this.broadcast({ type: 'task_added', payload: task });
    });

    this.queueManager.on('task-updated', (task) => {
      this.broadcast({ type: 'task_updated', payload: task });
    });

    this.queueManager.on('task-progress', (progress) => {
      this.broadcast({ type: 'task_progress', payload: progress });
    });

    this.queueManager.on('task-completed', (task) => {
      this.broadcast({ type: 'task_completed', payload: task });
    });

    this.queueManager.on('task-error', (errData) => {
      this.broadcast({ type: 'task_error', payload: errData });
    });

    this.queueManager.on('task-removed', (info) => {
      this.broadcast({ type: 'task_removed', payload: info });
    });
  }

  /**
   * Handles incoming client messages
   * @private
   */
  async _handleMessage(ws, message) {
    const { type, payload = {} } = message;

    switch (type) {
      case 'add_download': {
        const task = await this.queueManager.addTask(payload);
        ws.send(JSON.stringify({ type: 'download_added', payload: task }));
        break;
      }
      case 'pause_download': {
        await this.queueManager.pauseTask(payload.id);
        break;
      }
      case 'resume_download': {
        await this.queueManager.resumeTask(payload.id);
        break;
      }
      case 'remove_download': {
        await this.queueManager.removeTask(payload.id, payload.deleteFile);
        break;
      }
      case 'pause_all': {
        await this.queueManager.pauseAll();
        break;
      }
      case 'resume_all': {
        await this.queueManager.resumeAll();
        break;
      }
      case 'set_speed_limit': {
        this.queueManager.setSpeedLimit(payload.bytesPerSec || 0);
        ws.send(JSON.stringify({ type: 'speed_limit_updated', payload: { bytesPerSec: payload.bytesPerSec || 0 } }));
        break;
      }
      case 'get_tasks': {
        ws.send(JSON.stringify({
          type: 'tasks_list',
          payload: this.queueManager.getAllTasks()
        }));
        break;
      }
      case 'save_blob_media': {
        try {
          const { base64Data, filename, sourceUrl } = payload;
          if (base64Data && filename) {
            const buffer = Buffer.from(base64Data, 'base64');
            const defaultDir = this.queueManager.defaultDownloadDir || path.join(os.homedir(), 'Downloads');
            const targetPath = path.join(defaultDir, filename);
            await fs.promises.writeFile(targetPath, buffer);

            const task = {
              id: `blob_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              url: sourceUrl || 'blob:whatsapp-media',
              filename,
              destinationDir: defaultDir,
              targetFilePath: targetPath,
              totalBytes: buffer.length,
              downloadedBytes: buffer.length,
              percent: 100,
              status: 'completed',
              speed: 0,
              supportsRange: false,
              connections: 1,
              category: 'Videos',
              createdAt: Date.now(),
              completedAt: Date.now()
            };
            this.queueManager.tasks.unshift(task);
            await this.queueManager.stateStore.save(this.queueManager.tasks);
            this.queueManager.emit('task-added', task);
            this.queueManager.emit('task-completed', task);
            logger.info('BRIDGE', `Saved blob media "${filename}" (${buffer.length} bytes) to ${targetPath}`);
            ws.send(JSON.stringify({ type: 'blob_saved', payload: { success: true, filename, targetPath } }));
          }
        } catch (err) {
          logger.error('BRIDGE', `Failed to save blob media: ${err.message}`);
          ws.send(JSON.stringify({ type: 'blob_saved', payload: { success: false, error: err.message } }));
        }
        break;
      }
      default:
        console.warn(`[ReaBridge] Unknown message type: ${type}`);
    }
  }

  /**
   * Broadcasts message to all active WebSocket clients
   * @param {Object} message
   */
  broadcast(message) {
    const serialized = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }

  /**
   * Stops the server
   */
  stop() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
