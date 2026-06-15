import { CommandLog } from '../db/models.js';
import { clientManager } from './clientManager.js';
import { MessageType, type WSMessage, type CommandRequestPayload } from '@monitor/shared';
import { v4 as uuidv4 } from 'uuid';

export async function executeCommand(
  clientId: string,
  dbClientId: string,
  command: string,
  timeout: number,
  executedBy: string,
  taskId?: string
): Promise<{ id: string; sent: boolean }> {
  const ws = clientManager.getAgentWs(clientId);
  if (!ws) {
    return { id: '', sent: false };
  }

  const msgId = uuidv4();
  const message: WSMessage<CommandRequestPayload> = {
    id: msgId,
    type: MessageType.COMMAND_REQUEST,
    timestamp: Date.now(),
    payload: { command, timeout },
  };

  ws.send(JSON.stringify(message));

  await CommandLog.create({
    clientId: dbClientId,
    taskId: taskId ?? null,
    command,
    executedBy,
    executedAt: new Date(),
  });

  return { id: msgId, sent: true };
}

export async function updateCommandResult(
  dbClientId: string,
  command: string,
  exitCode: number,
  stdout: string,
  stderr: string,
  durationMs: number
) {
  const log = await CommandLog.findOne({
    where: { clientId: dbClientId, command },
    order: [['executedAt', 'DESC']],
  });
  if (log) {
    await log.update({ exitCode, stdout, stderr, durationMs });
  }
}
