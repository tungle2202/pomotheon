import type { Settings, TimerMode, TimerStatus } from './types';
import { playFocusCompleteSound, playBreakCompleteSound } from './sound';

export interface TimerListenerState {
  mode: TimerMode;
  status: TimerStatus;
  remainingSeconds: number;
  totalDurationSeconds: number;
  completedFocusSessions: number;
  sessionsBeforeLongBreak: number;
  percentage: number;
  formattedTime: string;
}

export type TimerCallback = (state: TimerListenerState) => void;
export type FocusCompletedCallback = (completedMinutes: number) => Promise<void>;
export type BreakCompletedCallback = (mode: TimerMode) => void;

export class PomodoroTimer {
  private mode: TimerMode = 'focus';
  private status: TimerStatus = 'idle';
  private remainingSeconds: number = 25 * 60;
  private totalDurationSeconds: number = 25 * 60;
  private targetEndTime: number | null = null;
  private completedFocusSessions: number = 0;
  private timerInterval: number | null = null;

  private settings: Settings;
  private onTickCallback: TimerCallback | null = null;
  private onFocusCompleted: FocusCompletedCallback | null = null;
  private onBreakCompleted: BreakCompletedCallback | null = null;

  constructor(settings: Settings) {
    this.settings = settings;
    this.setMode('focus', false);
    this.requestNotificationPermission();
  }

  public updateSettings(settings: Settings): void {
    const oldMode = this.mode;
    this.settings = settings;

    // If timer is not currently running, update the current mode duration
    if (this.status === 'idle') {
      this.setMode(oldMode, false);
    }
    this.notify();
  }

  public subscribe(
    onTick: TimerCallback,
    onFocusCompleted: FocusCompletedCallback,
    onBreakCompleted: BreakCompletedCallback
  ): void {
    this.onTickCallback = onTick;
    this.onFocusCompleted = onFocusCompleted;
    this.onBreakCompleted = onBreakCompleted;
    this.notify();
  }

  public getState(): TimerListenerState {
    const elapsed = this.totalDurationSeconds - this.remainingSeconds;
    const percentage = this.totalDurationSeconds > 0
      ? Math.min(100, Math.max(0, (elapsed / this.totalDurationSeconds) * 100))
      : 0;

    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    const formattedTime = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    return {
      mode: this.mode,
      status: this.status,
      remainingSeconds: this.remainingSeconds,
      totalDurationSeconds: this.totalDurationSeconds,
      completedFocusSessions: this.completedFocusSessions,
      sessionsBeforeLongBreak: this.settings.sessions_before_long_break,
      percentage,
      formattedTime,
    };
  }

  public start(): void {
    if (this.status === 'running') return;

    this.targetEndTime = Date.now() + this.remainingSeconds * 1000;
    this.status = 'running';

    this.startInterval();
    this.notify();
  }

  public pause(): void {
    if (this.status !== 'running') return;

    if (this.targetEndTime) {
      this.remainingSeconds = Math.max(
        0,
        Math.round((this.targetEndTime - Date.now()) / 1000)
      );
    }
    this.targetEndTime = null;
    this.status = 'paused';

    this.stopInterval();
    this.notify();
  }

  public reset(): void {
    this.stopInterval();
    this.status = 'idle';
    this.targetEndTime = null;
    this.remainingSeconds = this.totalDurationSeconds;
    this.notify();
  }

  public skip(): void {
    this.stopInterval();
    this.status = 'idle';
    this.targetEndTime = null;

    if (this.mode === 'focus') {
      this.completedFocusSessions++;
      const isLongBreak =
        this.completedFocusSessions % this.settings.sessions_before_long_break === 0;
      this.setMode(isLongBreak ? 'long_break' : 'short_break', false);
    } else {
      this.setMode('focus', false);
    }

    this.notify();
  }

  public setMode(mode: TimerMode, startNow: boolean = false): void {
    this.stopInterval();
    this.mode = mode;
    this.status = 'idle';
    this.targetEndTime = null;

    let minutes = this.settings.focus_duration_minutes;
    if (mode === 'short_break') {
      minutes = this.settings.short_break_duration_minutes;
    } else if (mode === 'long_break') {
      minutes = this.settings.long_break_duration_minutes;
    }

    this.totalDurationSeconds = minutes * 60;
    this.remainingSeconds = this.totalDurationSeconds;

    if (startNow) {
      this.start();
    } else {
      this.notify();
    }
  }

  private startInterval(): void {
    this.stopInterval();
    // Run interval frequently (200ms) to guarantee exact responsiveness and minimization recovery
    this.timerInterval = window.setInterval(() => {
      this.tick();
    }, 200);
  }

  private stopInterval(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.status !== 'running' || !this.targetEndTime) return;

    const now = Date.now();
    const remaining = Math.max(0, Math.round((this.targetEndTime - now) / 1000));
    this.remainingSeconds = remaining;

    if (remaining <= 0) {
      await this.handleSessionFinished();
    } else {
      this.notify();
    }
  }

  private async handleSessionFinished(): Promise<void> {
    this.stopInterval();
    this.status = 'idle';
    this.targetEndTime = null;

    if (this.mode === 'focus') {
      const minutesCompleted = this.settings.focus_duration_minutes;
      playFocusCompleteSound();
      this.showNotification(
        'Focus Session Completed!',
        `Great work! You finished ${minutesCompleted} minutes and earned credit points.`
      );

      if (this.onFocusCompleted) {
        await this.onFocusCompleted(minutesCompleted);
      }

      this.completedFocusSessions++;
      const isLongBreak =
        this.completedFocusSessions % this.settings.sessions_before_long_break === 0;
      this.setMode(isLongBreak ? 'long_break' : 'short_break', false);
    } else {
      playBreakCompleteSound();
      this.showNotification(
        'Break Ended!',
        'Time to return to your focus session.'
      );

      if (this.onBreakCompleted) {
        this.onBreakCompleted(this.mode);
      }

      this.setMode('focus', false);
    }

    this.notify();
  }

  private notify(): void {
    if (this.onTickCallback) {
      this.onTickCallback(this.getState());
    }
  }

  private requestNotificationPermission(): void {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  }

  private showNotification(title: string, body: string): void {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(title, { body });
      } catch (e) {
        console.warn('Could not display desktop notification:', e);
      }
    }
  }
}
