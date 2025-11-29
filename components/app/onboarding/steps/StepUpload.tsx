"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";
import { Upload, X, File } from "lucide-react";

export interface StepUploadProps {
  data: { files: File[]; notes: string } | null;
  onComplete: (data: { files: File[]; notes: string }) => void;
}

export const StepUpload: React.FC<StepUploadProps> = ({ data, onComplete }) => {
  const [files, setFiles] = React.useState<File[]>(data?.files || []);
  const [notes, setNotes] = React.useState(data?.notes || "");
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (selectedFiles) {
      const newFiles = Array.from(selectedFiles).filter(
        (file) => file.type.startsWith("image/") || file.type === "application/pdf"
      );
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({ files, notes });
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 5 — Upload plans & photos**

Upload anything you have: floor plans, sketches, photos of the current state. We'll use this as the base for your 3D model and cost estimate.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Upload Area */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all",
                isDragging
                  ? "border-[#3B82F6] bg-[rgba(59,130,246,0.10)]"
                  : "border-[rgba(255,255,255,0.15)] hover:border-[rgba(255,255,255,0.25)]"
              )}
            >
              <Upload className="w-8 h-8 mx-auto mb-3 text-[rgba(255,255,255,0.60)]" />
              <p className="text-[14px] text-white mb-1">
                Drop files here or click to browse
              </p>
              <p className="text-[12px] text-[rgba(255,255,255,0.50)]">
                Supports: JPG, PNG, PDF
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)]"
                  >
                    <File className="w-4 h-4 text-[rgba(255,255,255,0.60)] flex-shrink-0" />
                    <span className="flex-1 text-[13px] text-[rgba(255,255,255,0.85)] truncate">
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="p-1 rounded hover:bg-[rgba(255,255,255,0.10)] transition-colors"
                    >
                      <X className="w-4 h-4 text-[rgba(255,255,255,0.60)]" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-[13px] font-medium text-[rgba(255,255,255,0.70)] mb-2">
                Anything special you want me to focus on?
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={3}
                className={cn(
                  "w-full px-3 py-2 rounded-lg",
                  "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)]",
                  "text-[14px] text-white placeholder-[rgba(255,255,255,0.40)]",
                  "focus:outline-none focus:border-[rgba(59,130,246,0.40)]",
                  "transition-colors resize-none"
                )}
              />
            </div>

            <Button
              type="submit"
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
                "transition-all duration-200"
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


