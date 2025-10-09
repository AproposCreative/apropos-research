import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  deleteDoc,
  updateDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';

// Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ArticleDraft {
  id: string;
  userId: string;
  title: string;
  chatTitle: string;
  messages: ChatMessage[];
  articleData: any;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  lastModified: Date;
}

export interface ExportedArticle {
  id: string;
  userId: string;
  title: string;
  category: string;
  subtitle?: string;
  content: string;
  format: 'html' | 'markdown' | 'pdf' | 'docx';
  createdAt: Date;
  exportedAt: Date;
}

// Training Samples
export interface TrainingSample {
  id: string;
  userId: string;
  authorName?: string;
  authorTOV?: string;
  articleData: any;
  messages: ChatMessage[];
  notes?: string;
  published?: boolean;
  createdAt: Date;
}

// Draft Management Functions
export const saveDraft = async (userId: string, draftData: Partial<ArticleDraft>) => {
  try {
    const draftId = draftData.id || `draft_${Date.now()}`;
    const draftRef = doc(db, 'drafts', draftId);
    
    // Clean the data to remove undefined values
    const cleanDraftData = JSON.parse(JSON.stringify(draftData));
    
    const draft: Partial<ArticleDraft> = {
      ...cleanDraftData,
      id: draftId,
      userId,
      updatedAt: new Date(),
      lastModified: new Date(),
    };

    if (!draftData.createdAt) {
      draft.createdAt = new Date();
    }

    await setDoc(draftRef, draft, { merge: true });
    return draftId;
  } catch (error) {
    console.error('Error saving draft:', error);
    throw error;
  }
};

export const getDraft = async (draftId: string) => {
  try {
    const draftRef = doc(db, 'drafts', draftId);
    const draftSnap = await getDoc(draftRef);
    
    if (draftSnap.exists()) {
      const data = draftSnap.data();
      // Convert Firestore Timestamps to Date objects
      return {
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
        lastModified: data.lastModified?.toDate ? data.lastModified.toDate() : new Date(),
        messages: data.messages?.map((msg: any) => ({
          ...msg,
          timestamp: msg.timestamp instanceof Date ? msg.timestamp : 
                     msg.timestamp?.toDate ? msg.timestamp.toDate() : 
                     new Date(msg.timestamp || Date.now())
        }))
      } as ArticleDraft;
    }
    return null;
  } catch (error) {
    console.error('Error getting draft:', error);
    throw error;
  }
};

export const getUserDrafts = async (userId: string) => {
  try {
    const draftsRef = collection(db, 'drafts');
    const q = query(
      draftsRef, 
      where('userId', '==', userId)
    );
    
    const querySnapshot = await getDocs(q);
    const drafts: ArticleDraft[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      drafts.push({
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
        lastModified: data.lastModified?.toDate ? data.lastModified.toDate() : new Date(),
        messages: data.messages?.map((msg: any) => ({
          ...msg,
          timestamp: msg.timestamp instanceof Date ? msg.timestamp : 
                     msg.timestamp?.toDate ? msg.timestamp.toDate() : 
                     new Date(msg.timestamp || Date.now())
        }))
      } as ArticleDraft);
    });
    
    // Sort in JavaScript instead of Firestore
    return drafts.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } catch (error) {
    console.error('Error getting user drafts:', error);
    throw error;
  }
};

export const deleteDraft = async (draftId: string) => {
  try {
    const draftRef = doc(db, 'drafts', draftId);
    await deleteDoc(draftRef);
  } catch (error) {
    console.error('Error deleting draft:', error);
    throw error;
  }
};

export const updateDraft = async (draftId: string, updates: Partial<ArticleDraft>) => {
  try {
    const draftRef = doc(db, 'drafts', draftId);
    await updateDoc(draftRef, {
      ...updates,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating draft:', error);
    throw error;
  }
};

// Exported Articles Management
export const saveExportedArticle = async (userId: string, articleData: Partial<ExportedArticle>) => {
  try {
    const articleId = articleData.id || `article_${Date.now()}`;
    const articleRef = doc(db, 'exportedArticles', articleId);
    
    const article: Partial<ExportedArticle> = {
      ...articleData,
      id: articleId,
      userId,
      exportedAt: new Date(),
    };

    if (!articleData.createdAt) {
      article.createdAt = new Date();
    }

    await setDoc(articleRef, article);
    return articleId;
  } catch (error) {
    console.error('Error saving exported article:', error);
    throw error;
  }
};

export const getUserExportedArticles = async (userId: string) => {
  try {
    const articlesRef = collection(db, 'exportedArticles');
    const q = query(
      articlesRef, 
      where('userId', '==', userId),
      orderBy('exportedAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const articles: ExportedArticle[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      articles.push({
        ...data,
        createdAt: data.createdAt?.toDate(),
        exportedAt: data.exportedAt?.toDate(),
      } as ExportedArticle);
    });
    
    return articles;
  } catch (error) {
    console.error('Error getting exported articles:', error);
    throw error;
  }
};

// Chat Session Management
export const saveChatSession = async (userId: string, sessionData: {
  messages: ChatMessage[];
  chatTitle: string;
  notes: string;
  articleData: any;
}) => {
  try {
    const sessionId = `session_${Date.now()}`;
    const sessionRef = doc(db, 'chatSessions', sessionId);
    
    await setDoc(sessionRef, {
      id: sessionId,
      userId,
      ...sessionData,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    return sessionId;
  } catch (error) {
    console.error('Error saving chat session:', error);
    throw error;
  }
};

export const getUserChatSessions = async (userId: string) => {
  try {
    const sessionsRef = collection(db, 'chatSessions');
    const q = query(
      sessionsRef, 
      where('userId', '==', userId)
    );
    
    const querySnapshot = await getDocs(q);
    const sessions: any[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      sessions.push({
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
        messages: data.messages?.map((msg: any) => ({
          ...msg,
          timestamp: msg.timestamp instanceof Date ? msg.timestamp : 
                     msg.timestamp?.toDate ? msg.timestamp.toDate() : 
                     new Date(msg.timestamp || Date.now())
        }))
      });
    });
    
    // Sort in JavaScript instead of Firestore
    return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    throw error;
  }
};

// Save a training sample (opt-in)
export const saveTrainingSample = async (userId: string, sample: Partial<TrainingSample>) => {
  try {
    const id = sample.id || `sample_${Date.now()}`;
    const ref = doc(db, 'trainingSamples', id);
    const clean = JSON.parse(JSON.stringify(sample));
    const payload: Partial<TrainingSample> = {
      ...clean,
      id,
      userId,
      createdAt: new Date(),
    };
    await setDoc(ref, payload, { merge: true });
    return id;
  } catch (error) {
    console.error('Error saving training sample:', error);
    throw error;
  }
};

export const getTrainingSamples = async (limitCount = 100) => {
  try {
    const colRef = collection(db, 'trainingSamples');
    const snap = await getDocs(colRef);
    const out: TrainingSample[] = [];
    snap.forEach(d => {
      const data = d.data() as any;
      out.push({
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date()
      });
    });
    // Limit client-side for simplicity
    return out.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).slice(0, limitCount);
  } catch (e) {
    console.error('Error reading training samples:', e);
    return [];
  }
};

