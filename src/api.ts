import { invoke } from '@tauri-apps/api/core';
import type {
  AppStateSummary,
  CreatePersonInput,
  LedgerEntry,
  Person,
  Settings,
  UpdatePersonInput,
} from './types';

// In-memory cache for resolved base64 images to prevent redundant IPC calls
const imageCache = new Map<string, string>();

export async function getAppSummary(): Promise<AppStateSummary> {
  return await invoke<AppStateSummary>('get_app_summary');
}

export async function getPersons(): Promise<Person[]> {
  return await invoke<Person[]>('get_persons');
}

export async function createPerson(input: CreatePersonInput): Promise<Person> {
  const person = await invoke<Person>('create_person', { input });
  if (person.image_path && input.image_base64) {
    imageCache.set(person.image_path, input.image_base64);
  }
  return person;
}

export async function updatePerson(input: UpdatePersonInput): Promise<Person> {
  const person = await invoke<Person>('update_person', { input });
  if (input.remove_image) {
    if (person.image_path) imageCache.delete(person.image_path);
  } else if (person.image_path && input.image_base64) {
    imageCache.set(person.image_path, input.image_base64);
  }
  return person;
}

export async function deletePerson(id: string): Promise<void> {
  return await invoke<void>('delete_person', { id });
}

export async function payRespect(personId: string): Promise<[number, number]> {
  return await invoke<[number, number]>('pay_respect', { personId });
}

export async function earnFocusPoints(completedMinutes: number): Promise<[number, number]> {
  return await invoke<[number, number]>('earn_focus_points', { completedMinutes });
}

export async function getSettings(): Promise<Settings> {
  return await invoke<Settings>('get_settings');
}

export async function updateSettings(settings: Settings): Promise<Settings> {
  return await invoke<Settings>('update_settings', { settings });
}

export async function getLedger(): Promise<LedgerEntry[]> {
  return await invoke<LedgerEntry[]>('get_ledger');
}

export async function getPersonDetail(id: string): Promise<string> {
  return await invoke<string>('get_person_detail', { id });
}

export async function getImageData(relativePath: string): Promise<string> {
  if (imageCache.has(relativePath)) {
    return imageCache.get(relativePath)!;
  }
  try {
    const dataUrl = await invoke<string>('get_image_data', { relativePath });
    imageCache.set(relativePath, dataUrl);
    return dataUrl;
  } catch (err) {
    console.error('Failed to load image:', relativePath, err);
    return '';
  }
}
