"use client";

import * as React from "react";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadRoomPhotoFile } from "@/lib/uploads/client";
import { removeRoomPhoto } from "@/lib/uploads/actions";
import { clientFileError } from "@/lib/uploads/schema";

export interface Step2PhotoUploadProps {
  projectId: string;
  persistedPreviewUrl?: string | null;
  persistedFilename?: string | null;
  onPersistedChange?: (next: { previewUrl: string | null; filename: string | null }) => void;
  onContinue: () => void;
}

export const Step2PhotoUpload: React.FC<Step2PhotoUploadProps> = ({
  projectId,
  persistedPreviewUrl = null,
  persistedFilename = null,
  onPersistedChange,
  onContinue,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const localPreviewRef = React.useRef<string | null>(null);
  const [localPreview, setLocalPreview] = React.useState<string | null>(null);
  const [filename, setFilename] = React.useState<string | null>(persistedFilename);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(persistedPreviewUrl);
  const [status, setStatus] = React.useState<
    "empty" | "selected" | "uploading" | "validating" | "uploaded" | "error"
  >(persistedPreviewUrl ? "uploaded" : "empty");
  const [error, setError] = React.useState<string | null>(null);
  const busy = status === "uploading" || status === "validating";

  React.useEffect(() => {
    setPreviewUrl(persistedPreviewUrl);
    setFilename(persistedFilename);
    if (persistedPreviewUrl) setStatus("uploaded");
  }, [persistedPreviewUrl, persistedFilename]);

  React.useEffect(() => {
    return () => {
      if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    };
  }, []);

  const showUrl = localPreview ?? previewUrl;

  const startUpload = async (file: File) => {
    const validation = clientFileError(file);
    if (validation) {
      setError(validation);
      setStatus("error");
      return;
    }
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    const objectUrl = URL.createObjectURL(file);
    localPreviewRef.current = objectUrl;
    setLocalPreview(objectUrl);
    setFilename(file.name);
    setError(null);
    setStatus("uploading");
    const result = await uploadRoomPhotoFile(projectId, file);
    if (!result.ok) {
      setError(result.message);
      setStatus("error");
      return;
    }
    setStatus("validating");
    setPreviewUrl(result.previewUrl);
    setFilename(result.filename);
    setLocalPreview(null);
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
    setStatus("uploaded");
    onPersistedChange?.({ previewUrl: result.previewUrl, filename: result.filename });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void startUpload(file);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void startUpload(file);
  };

  const handleRemove = async () => {
    if (busy) return;
    setStatus("uploading");
    setError(null);
    const result = await removeRoomPhoto({ projectId });
    if (!result.ok) {
      setError(result.message);
      setStatus("error");
      return;
    }
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
    setLocalPreview(null);
    setPreviewUrl(null);
    setFilename(null);
    setStatus("empty");
    onPersistedChange?.({ previewUrl: null, filename: null });
  };

  return (
    <div className="space-y-6">
      <div
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
        className={cn(
          "relative",
          "border-2 border-dashed rounded-[16px]",
          "p-8 md:p-12",
          "text-center",
          "transition-colors",
          busy
            ? "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.01)]"
            : "border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.25)] hover:bg-[rgba(255,255,255,0.03)] cursor-pointer"
        )}
        onClick={() => !busy && !showUrl && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={handleFileSelect}
          className="hidden"
        />

        {!showUrl ? (
          <>
            <Upload className="w-12 h-12 mx-auto mb-4 text-[rgba(255,255,255,0.40)]" />
            <div className="text-[16px] font-medium text-white mb-2">
              Drop a room photo here or click to upload
            </div>
            <div className="text-[14px] text-[rgba(255,255,255,0.50)]">
              JPEG, PNG, or WebP · up to 6 MB
            </div>
          </>
        ) : (
          <div className="text-[14px] text-[rgba(255,255,255,0.50)]">
            {status === "uploading" && "Uploading…"}
            {status === "validating" && "Validating…"}
            {status === "uploaded" && (filename ?? "Room photo uploaded")}
            {status === "error" && "Upload failed"}
            {status === "selected" && "Selected"}
          </div>
        )}
      </div>

      {error ? (
        <p className="text-[13px] text-[#E5484D]" role="alert">
          {error}
        </p>
      ) : null}

      {showUrl ? (
        <div className="relative group max-w-md">
          <img
            src={showUrl}
            alt="Room photo"
            className="w-full h-48 object-cover rounded-lg"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRemove()}
            className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          >
            <X className="w-4 h-4 text-white" />
            <span className="sr-only">Remove photo</span>
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {showUrl ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="text-[14px] text-[rgba(255,255,255,0.70)] hover:text-white disabled:opacity-50"
          >
            Replace photo
          </button>
        ) : null}
        {status === "uploaded" ? (
          <button
            type="button"
            onClick={onContinue}
            className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)]"
          >
            Continue
          </button>
        ) : null}
      </div>
    </div>
  );
};
