"use client";

import { useState } from "react";
import { CldUploadWidget } from "next-cloudinary";
import { Button } from "@/components/ui/button";
import { ImagePlus, X, Loader2 } from "lucide-react";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
  label?: string;
  /** Compact mode for inline use (e.g., candidate rows) */
  compact?: boolean;
}

export function ImageUpload({ value, onChange, onRemove, label, compact }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    return (
      <div className="text-xs text-muted-foreground italic border rounded-md p-2">
        Image upload not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {value ? (
          <div className="relative group">
            <img
              src={value}
              alt={label || "Uploaded"}
              className="h-10 w-10 rounded-md object-cover border"
            />
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <CldUploadWidget
            uploadPreset={uploadPreset}
            options={{
              maxFiles: 1,
              resourceType: "image",
              sources: ["local", "camera"],
              maxFileSize: 5000000,
              clientAllowedFormats: ["jpg", "jpeg", "png", "webp"],
            }}
            onOpen={() => setUploading(true)}
            onClose={() => setUploading(false)}
            onSuccess={(result) => {
              const info = result?.info as { secure_url?: string };
              if (info?.secure_url) onChange(info.secure_url);
              setUploading(false);
            }}
            onQueuesEnd={(_result, { widget }) => widget.close()}
          >
            {({ open }) => (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => open()}
                disabled={uploading}
                className="h-10 w-10 p-0"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
              </Button>
            )}
          </CldUploadWidget>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}

      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt={label || "Uploaded image"}
            className="h-32 w-32 rounded-lg object-cover border"
          />
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center shadow-md hover:bg-destructive/90 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <CldUploadWidget
          uploadPreset={uploadPreset}
          options={{
            maxFiles: 1,
            resourceType: "image",
            sources: ["local", "camera"],
            maxFileSize: 5000000,
            clientAllowedFormats: ["jpg", "jpeg", "png", "webp"],
          }}
          onOpen={() => setUploading(true)}
          onClose={() => setUploading(false)}
          onSuccess={(result) => {
            const info = result?.info as { secure_url?: string };
            if (info?.secure_url) onChange(info.secure_url);
            setUploading(false);
          }}
          onQueuesEnd={(_result, { widget }) => widget.close()}
        >
          {({ open }) => (
            <Button
              type="button"
              variant="outline"
              onClick={() => open()}
              disabled={uploading}
              className="h-32 w-32 flex flex-col items-center justify-center gap-2 border-dashed"
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Upload</span>
                </>
              )}
            </Button>
          )}
        </CldUploadWidget>
      )}
    </div>
  );
}
