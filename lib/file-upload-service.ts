import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: Date;
}

export const uploadFile = async (
  file: File, 
  userId: string, 
  chatId?: string
): Promise<UploadedFile> => {
  try {
    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // For small files (< 1MB), use localStorage for speed
    if (file.size < 1024 * 1024) {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      return {
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        url: dataUrl, // Use data URL for small files
        uploadedAt: new Date()
      };
    }
    
    // For larger files, use Firebase Storage
    const fileName = `${userId}/${chatId || 'general'}/${fileId}_${file.name}`;
    const storageRef = ref(storage, fileName);
    
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return {
      id: fileId,
      name: file.name,
      type: file.type,
      size: file.size,
      url: downloadURL,
      uploadedAt: new Date()
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

export const deleteFile = async (fileName: string): Promise<void> => {
  try {
    const fileRef = ref(storage, fileName);
    await deleteObject(fileRef);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

export const getFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};

export const isTextFile = (file: File): boolean => {
  const textTypes = [
    'text/plain',
    'text/html',
    'text/css',
    'text/javascript',
    'application/json',
    'application/xml',
    'text/xml',
    'application/pdf'
  ];
  return textTypes.includes(file.type);
};

export const readTextFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target?.result as string);
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};
