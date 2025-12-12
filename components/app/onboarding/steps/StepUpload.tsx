"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";
import { Upload, X, File } from "lucide-react";

export interface StepUploadProps {
  data: { floorplanImage?: File | null; roomPhotos: File[]; sketches?: File[]; googleMapsScreenshot?: File | null } | null;
  onComplete: (data: { floorplanImage?: File | null; roomPhotos: File[]; sketches?: File[]; googleMapsScreenshot?: File | null }) => void;
}

export const StepUpload: React.FC<StepUploadProps> = ({ data, onComplete }) => {
  const [floorplanImage, setFloorplanImage] = React.useState<File | null>(data?.floorplanImage || null);
  const [roomPhotos, setRoomPhotos] = React.useState<File[]>(data?.roomPhotos || []);
  const [sketches, setSketches] = React.useState<File[]>(data?.sketches || []);
  const [googleMapsScreenshot, setGoogleMapsScreenshot] = React.useState<File | null>(data?.googleMapsScreenshot || null);

  const handleFileSelect = (files: FileList | null, type: "floorplan" | "roomPhotos" | "sketches" | "maps") => {
    if (!files) return;
    const fileArray = Array.from(files);
    
    if (type === "floorplan") {
      setFloorplanImage(fileArray[0] || null);
    } else if (type === "roomPhotos") {
      setRoomPhotos((prev) => [...prev, ...fileArray]);
    } else if (type === "sketches") {
      setSketches((prev) => [...prev, ...fileArray]);
    } else if (type === "maps") {
      setGoogleMapsScreenshot(fileArray[0] || null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({ floorplanImage, roomPhotos, sketches, googleMapsScreenshot });
  };

  const FileUploadSection = ({ 
    title, 
    description, 
    files, 
    onSelect, 
    onRemove, 
    accept = "image/*,.pdf",
    multiple = false 
  }: {
    title: string;
    description: string;
    files: File | File[] | null;
    onSelect: (files: FileList | null) => void;
    onRemove: () => void;
    accept?: string;
    multiple?: boolean;
  }) => {
    const fileArray = Array.isArray(files) ? files : files ? [files] : [];
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-1">
              {title}
            </label>
            <p className="text-[12px] text-[rgba(255,255,255,0.50)]">{description}</p>
          </div>
        </div>
        <div
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all",
            "border-[rgba(255,255,255,0.15)] hover:border-[rgba(255,255,255,0.25)]"
          )}
        >
          <Upload className="w-5 h-5 mx-auto mb-2 text-[rgba(255,255,255,0.60)]" />
          <p className="text-[12px] text-[rgba(255,255,255,0.70)]">
            Click to upload {multiple ? "files" : "file"}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple={multiple}
            accept={accept}
            onChange={(e) => onSelect(e.target.files)}
            className="hidden"
          />
        </div>
        {fileArray.length > 0 && (
          <div className="space-y-1">
            {fileArray.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 rounded bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)]"
              >
                <File className="w-3 h-3 text-[rgba(255,255,255,0.60)] flex-shrink-0" />
                <span className="flex-1 text-[12px] text-[rgba(255,255,255,0.85)] truncate">
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={onRemove}
                  className="p-1 rounded hover:bg-[rgba(255,255,255,0.10)] transition-colors"
                >
                  <X className="w-3 h-3 text-[rgba(255,255,255,0.60)]" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 6 — Upload Plans & Photos**

Upload any files you have to help us understand your project better.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <FileUploadSection
              title="Floorplan image"
              description="Upload your floor plan (required)"
              files={floorplanImage}
              onSelect={(files) => handleFileSelect(files, "floorplan")}
              onRemove={() => setFloorplanImage(null)}
              accept="image/*,.pdf"
            />

            <FileUploadSection
              title="Room photos"
              description="Upload photos of rooms (optional)"
              files={roomPhotos}
              onSelect={(files) => handleFileSelect(files, "roomPhotos")}
              onRemove={() => setRoomPhotos([])}
              multiple
            />

            <FileUploadSection
              title="Sketches"
              description="Upload any sketches or drawings (optional)"
              files={sketches}
              onSelect={(files) => handleFileSelect(files, "sketches")}
              onRemove={() => setSketches([])}
              multiple
            />

            <FileUploadSection
              title="Google Maps screenshot"
              description="Screenshot of location (optional)"
              files={googleMapsScreenshot}
              onSelect={(files) => handleFileSelect(files, "maps")}
              onRemove={() => setGoogleMapsScreenshot(null)}
              accept="image/*"
            />

            <Button
              type="submit"
              disabled={!floorplanImage}
              className={cn(
                "w-full bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
                "text-white border-0",
                "shadow-[0_4px_16px_rgba(59,130,246,0.25)]",
                "hover:from-[#2563EB] hover:to-[#1D4ED8]",
                "hover:shadow-[0_4px_16px_rgba(59,130,246,0.30)]",
                "hover:scale-[1.01]",
                "active:from-[#1D4ED8] active:to-[#1D4ED8]",
                "active:scale-[0.99]",
                "h-[44px] text-[14px] font-medium",
                "rounded-[12px]",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Continue
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
