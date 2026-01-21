"use client";

import * as React from "react";
import { Upload, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step3FloorPlanUploadProps {
  floorPlans: File[];
  photos: File[];
  onFloorPlansChange: (files: File[]) => void;
  onPhotosChange: (files: File[]) => void;
  onContinue: () => void;
}

export const Step3FloorPlanUpload: React.FC<Step3FloorPlanUploadProps> = ({
  floorPlans,
  photos,
  onFloorPlansChange,
  onPhotosChange,
  onContinue,
}) => {
  const floorPlanInputRef = React.useRef<HTMLInputElement>(null);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  const handleFloorPlanSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") ||
        file.type === "application/pdf"
    );
    onFloorPlansChange([...floorPlans, ...validFiles]);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    onPhotosChange([...photos, ...imageFiles].slice(0, 5));
  };

  const removeFloorPlan = (index: number) => {
    onFloorPlansChange(floorPlans.filter((_, i) => i !== index));
  };

  const removePhoto = (index: number) => {
    onPhotosChange(photos.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent, type: "floorplan" | "photo") => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (type === "floorplan") {
      const validFiles = files.filter(
        (file) =>
          file.type.startsWith("image/") || file.type === "application/pdf"
      );
      onFloorPlansChange([...floorPlans, ...validFiles]);
    } else {
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      onPhotosChange([...photos, ...imageFiles].slice(0, 5));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const hasAnyUploads = floorPlans.length > 0 || photos.length > 0;

  return (
    <div className="mt-8 space-y-8">
      {/* Floor Plans Section */}
      <div>
        <h3 className="text-[14px] font-medium text-[rgba(255,255,255,0.70)] mb-4">
          Floor Plans (Optional)
        </h3>
        <div
          onDrop={(e) => handleDrop(e, "floorplan")}
          onDragOver={handleDragOver}
          className={cn(
            "relative",
            "border-2 border-dashed rounded-[16px]",
            "p-8",
            "text-center",
            "transition-colors",
            "border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.25)] hover:bg-[rgba(255,255,255,0.03)] cursor-pointer"
          )}
          onClick={() => floorPlanInputRef.current?.click()}
        >
          <input
            ref={floorPlanInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleFloorPlanSelect}
            className="hidden"
          />

          <FileText className="w-10 h-10 mx-auto mb-3 text-[rgba(255,255,255,0.40)]" />
          <div className="text-[15px] font-medium text-white mb-1">
            Drop floor plans here or click to upload
          </div>
          <div className="text-[13px] text-[rgba(255,255,255,0.50)]">
            PDF or image files
          </div>
        </div>

        {floorPlans.length > 0 && (
          <div className="mt-4 space-y-2">
            {floorPlans.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-[rgba(255,255,255,0.02)] rounded-lg border border-[rgba(255,255,255,0.08)]"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-[rgba(255,255,255,0.50)]" />
                  <span className="text-[14px] text-[rgba(255,255,255,0.85)]">
                    {file.name}
                  </span>
                </div>
                <button
                  onClick={() => removeFloorPlan(index)}
                  className="p-1.5 hover:bg-[rgba(255,255,255,0.05)] rounded"
                >
                  <X className="w-4 h-4 text-[rgba(255,255,255,0.50)]" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Photos Section */}
      <div>
        <h3 className="text-[14px] font-medium text-[rgba(255,255,255,0.70)] mb-4">
          Room Photos (1-5 images)
        </h3>
        <div
          onDrop={(e) => handleDrop(e, "photo")}
          onDragOver={handleDragOver}
          className={cn(
            "relative",
            "border-2 border-dashed rounded-[16px]",
            "p-8",
            "text-center",
            "transition-colors",
            photos.length >= 5
              ? "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.01)]"
              : "border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.25)] hover:bg-[rgba(255,255,255,0.03)] cursor-pointer"
          )}
          onClick={() => photos.length < 5 && photoInputRef.current?.click()}
        >
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoSelect}
            className="hidden"
          />

          {photos.length === 0 ? (
            <>
              <Upload className="w-10 h-10 mx-auto mb-3 text-[rgba(255,255,255,0.40)]" />
              <div className="text-[15px] font-medium text-white mb-1">
                Drop photos here or click to upload
              </div>
              <div className="text-[13px] text-[rgba(255,255,255,0.50)]">
                You can upload up to 5 photos
              </div>
            </>
          ) : (
            <div className="text-[14px] text-[rgba(255,255,255,0.50)]">
              {photos.length} of 5 photos uploaded
              {photos.length < 5 && " • Click to add more"}
            </div>
          )}
        </div>

        {photos.length > 0 && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((photo, index) => (
              <div key={index} className="relative group">
                <img
                  src={URL.createObjectURL(photo)}
                  alt={`Upload ${index + 1}`}
                  className="w-full h-32 object-cover rounded-lg"
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

      {/* Continue / Skip Button */}
      <div className="flex justify-start mt-6">
        <button
          onClick={onContinue}
          className="px-6 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium hover:bg-[#2563EB] transition-colors"
        >
          {hasAnyUploads ? "Continue" : "Skip for now"}
        </button>
      </div>
    </div>
  );
};
