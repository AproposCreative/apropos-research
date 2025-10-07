'use client';

import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { uploadFile, isImageFile, isTextFile, readTextFile, getFileSize, type UploadedFile } from '@/lib/file-upload-service';

interface FileDropZoneProps {
  onFileUploaded: (file: UploadedFile, content?: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function FileDropZone({ 
  onFileUploaded, 
  onError, 
  disabled = false,
  className = ''
}: FileDropZoneProps) {
  const { user } = useAuth();
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!user) {
      onError('Du skal være logget ind for at uploade filer');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      onError('Filen er for stor. Maksimal størrelse er 10MB');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      // Simulate progress for small files
      if (file.size < 1024 * 1024) {
        setUploadProgress(50);
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for UX
      }
      
      // Upload file to Firebase Storage or localStorage
      const uploadedFile = await uploadFile(file, user.uid);
      setUploadProgress(100);
      
      // Read text content if it's a text file
      let content: string | undefined;
      if (isTextFile(file)) {
        content = await readTextFile(file);
      }

      onFileUploaded(uploadedFile, content);
    } catch (error) {
      console.error('Error handling file:', error);
      onError('Fejl ved upload af fil. Prøv igen.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [user, onFileUploaded, onError]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]); // Handle first file only
    }
  }, [disabled, handleFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  return (
    <>
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-6 transition-all duration-200
          ${isDragOver 
            ? 'border-blue-400 bg-blue-400/10' 
            : 'border-white/20 hover:border-white/40'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${uploading ? 'pointer-events-none' : ''}
          ${className}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          accept=".txt,.md,.json,.xml,.pdf,image/*"
          disabled={disabled}
        />

        <div className="text-center">
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <div className="w-full">
                <p className="text-white/60 text-sm text-center mb-2">Uploader fil...</p>
                <div className="w-full bg-white/10 rounded-full h-1">
                  <div 
                    className="bg-blue-400 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <svg className="w-12 h-12 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <div>
                <p className="text-white text-sm font-medium">
                  {isDragOver ? 'Slip filen her' : 'Træk filer her eller klik for at vælge'}
                </p>
                <p className="text-white/40 text-xs mt-1">
                  Understøtter: billeder, tekstfiler, PDF (max 10MB)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
