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

  /** 立即执行一次任务(供「立即执行」按钮调用),返回实际下发的在线节点数。 */
  async runNow(task: ScheduledTask): Promise<number> {
    return this.executeTask(task);
  }

  /** 解析任务目标:合并 targetGroups 命中的节点与 targetClients 指定的节点并去重。 */
  private async resolveTargets(task: ScheduledTask): Promise<Client[]> {
    const hasGroups = task.targetGroups && task.targetGroups.length > 0;
    const hasClients = task.targetClients && task.targetClients.length > 0;

    // 两者皆空 = 全部节点
    if (!hasGroups && !hasClients) {
      return Client.findAll();
    }

    const or: Record<string, unknown>[] = [];
    if (hasGroups) or.push({ groupName: { [Op.in]: task.targetGroups } });
    if (hasClients) or.push({ id: { [Op.in]: task.targetClients } });

    // Op.or 查询天然按行去重(同一节点即使同时命中分组与显式选择也只返回一条)
    return Client.findAll({ where: { [Op.or]: or } });
  }

  private async executeTask(task: ScheduledTask): Promise<number> {
    const targetClients = await this.resolveTargets(task);

    let sent = 0;
    for (const client of targetClients) {
      const state = clientManager.getClientState(client.id);
      if (state?.status === 'online') {
        await executeCommand(client.id, client.id, task.command, 60000, 'cron', task.id);
        sent++;
      }
    }

    await task.update({ lastRunAt: new Date() });
    return sent;
  }
}

export const cronService = new CronService();
