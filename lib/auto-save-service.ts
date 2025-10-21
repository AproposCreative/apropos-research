'use client';

import { ArticleDraft, ChatMessage } from './firebase-service';

export interface AutoSaveData {
  // Chat data
  messages: ChatMessage[];
  chatTitle: string;
  
  // Article data
  articleData: any;
  notes: string;
  
  // UI state
  showWizard: boolean;
  currentDraftId: string | null;
  
  // Preflight data
  preflightWarnings: string[];
  preflightModeration: any | null;
  preflightCriticTips: string;
  preflightFactResults: any[] | null;
  
  // Timestamps
  lastSaved: string;
  createdAt: string;
}

const STORAGE_KEY = 'ai-writer-autosave';
const SAVE_DEBOUNCE_MS = 1000; // Save 1 second after last change

class AutoSaveService {
  private saveTimeout: NodeJS.Timeout | null = null;
  private isSaving = false;

  // Debounced save to prevent excessive writes
  save(data: Partial<AutoSaveData>): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.performSave(data);
    }, SAVE_DEBOUNCE_MS);
  }

  private performSave(data: Partial<AutoSaveData>): void {
    if (this.isSaving) return;
    
    try {
      this.isSaving = true;
      
      // Get existing data
      const existing = this.load();
      
      // Merge with new data
      const merged: AutoSaveData = {
        ...existing,
        ...data,
        lastSaved: new Date().toISOString()
      };

      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      
      console.log('💾 Auto-saved to localStorage');
    } catch (error) {
      console.error('Failed to auto-save:', error);
    } finally {
      this.isSaving = false;
    }
  }

  load(): AutoSaveData {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        return this.getDefaultData();
      }

      const parsed = JSON.parse(saved);
      
      // Convert timestamp strings back to Date objects for messages
      if (parsed.messages && Array.isArray(parsed.messages)) {
        parsed.messages = parsed.messages.map((msg: any) => ({
          ...msg,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
        }));
      }

      return {
        ...this.getDefaultData(),
        ...parsed
      };
    } catch (error) {
      console.error('Failed to load auto-save data:', error);
      return this.getDefaultData();
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      console.log('🗑️ Cleared auto-save data');
    } catch (error) {
      console.error('Failed to clear auto-save data:', error);
    }
  }

  hasData(): boolean {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved !== null;
    } catch {
      return false;
    }
  }

  private getDefaultData(): AutoSaveData {
    return {
      messages: [],
      chatTitle: 'Ny artikkel',
      articleData: {},
      notes: '',
      showWizard: true,
      currentDraftId: null,
      preflightWarnings: [],
      preflightModeration: null,
      preflightCriticTips: '',
      preflightFactResults: null,
      lastSaved: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
  }

  // Convert auto-save data to Firebase draft format
  toDraftData(userId: string): Partial<ArticleDraft> {
    const data = this.load();
    
    return {
      id: data.currentDraftId || `draft_${Date.now()}`,
      userId,
      messages: data.messages,
      articleData: data.articleData,
      notes: data.notes,
      chatTitle: data.chatTitle,
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: new Date(),
      lastModified: new Date()
    };
  }
}

// Export singleton instance
export const autoSaveService = new AutoSaveService();
