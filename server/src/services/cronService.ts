import cron from 'node-cron';
import { ScheduledTask, Client } from '../db/models.js';
import { clientManager } from './clientManager.js';
import { executeCommand } from './commandService.js';
import { Op } from 'sequelize';

interface RunningTask {
  id: string;
  job: cron.ScheduledTask;
}

class CronService {
  private tasks: RunningTask[] = [];

  async start() {
    const dbTasks = await ScheduledTask.findAll({ where: { enabled: true } });
    for (const task of dbTasks) {
      this.schedule(task);
    }
  }

  stop() {
    for (const t of this.tasks) {
      t.job.stop();
    }
    this.tasks = [];
  }

  schedule(task: ScheduledTask) {
    if (!cron.validate(task.cronExpression)) {
      console.error(`Invalid cron expression for task ${task.id}: ${task.cronExpression}`);
      return;
    }

    const job = cron.schedule(task.cronExpression, async () => {
      await this.executeTask(task);
    });

    this.tasks.push({ id: task.id, job });
  }

  unschedule(taskId: string) {
    const idx = this.tasks.findIndex(t => t.id === taskId);
    if (idx >= 0) {
      this.tasks[idx].job.stop();
      this.tasks.splice(idx, 1);
    }
  }

  reschedule(task: ScheduledTask) {
    this.unschedule(task.id);
    if (task.enabled) {
      this.schedule(task);
    }
  }

  private async executeTask(task: ScheduledTask) {
    let targetClients: Client[];

    if (task.targetGroups && task.targetGroups.length > 0) {
      targetClients = await Client.findAll({
        where: { groupName: { [Op.in]: task.targetGroups } },
      });
    } else {
      targetClients = await Client.findAll();
    }

    for (const client of targetClients) {
      const state = clientManager.getClientState(client.id);
      if (state?.status === 'online') {
        await executeCommand(client.id, client.id, task.command, 60000, 'cron');
      }
    }

    await task.update({ lastRunAt: new Date() });
  }
}

export const cronService = new CronService();
