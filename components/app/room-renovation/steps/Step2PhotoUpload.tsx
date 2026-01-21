"use client";

import * as React from "react";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step2PhotoUploadProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  onContinue: () => void;
}

export const Step2PhotoUpload: React.FC<Step2PhotoUploadProps> = ({
  photos,
  onPhotosChange,
  onContinue,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const autoContinueRef = React.useRef(false);

  // Auto-advance as soon as at least one photo exists.
  React.useEffect(() => {
    if (photos.length === 0) {
      autoContinueRef.current = false;
      return;
    }
    if (autoContinueRef.current) return;
    autoContinueRef.current = true;
    const t = setTimeout(() => onContinue(), 150);
    return () => clearTimeout(t);
  }, [photos.length, onContinue]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(
      (file) => file.type.startsWith("image/")
    );
    onPhotosChange([...photos, ...imageFiles].slice(0, 3));
  };

  const removePhoto = (index: number) => {
    onPhotosChange(photos.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    onPhotosChange([...photos, ...imageFiles].slice(0, 3));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={cn(
          "relative",
          "border-2 border-dashed rounded-[16px]",
          "p-8 md:p-12",
          "text-center",
          "transition-colors",
          photos.length >= 3
            ? "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.01)]"
            : "border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.25)] hover:bg-[rgba(255,255,255,0.03)] cursor-pointer"
        )}
        onClick={() => photos.length < 3 && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {photos.length === 0 ? (
          <>
            <Upload className="w-12 h-12 mx-auto mb-4 text-[rgba(255,255,255,0.40)]" />
            <div className="text-[16px] font-medium text-white mb-2">
              Drop photos here or click to upload
            </div>
            <div className="text-[14px] text-[rgba(255,255,255,0.50)]">
              You can upload up to 3 photos
            </div>
          </>
        ) : (
          <div className="text-[14px] text-[rgba(255,255,255,0.50)]">
            {photos.length} of 3 photos uploaded
            {photos.length < 3 && " • Click to add more"}
          </div>
        )}
      </div>

      {/* Photo Thumbnails */}
      {photos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {photos.map((photo, index) => (
            <div key={index} className="relative group">
              <img
                src={URL.createObjectURL(photo)}
                alt={`Upload ${index + 1}`}
                className="w-full h-48 object-cover rounded-lg"
              />
              <button
                onClick={() => removePhoto(index)}
                className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
