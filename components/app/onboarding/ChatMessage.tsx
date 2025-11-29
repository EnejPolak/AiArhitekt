"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChatMessageProps {
  type: "ai" | "user";
  content: string;
  className?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  type,
  content,
  className,
}) => {
  if (type === "user") {
    return (
      <div className={cn("flex justify-end", className)}>
        <div className="max-w-[80%] rounded-[16px] px-4 py-3 bg-[rgba(59,130,246,0.15)] border border-[rgba(59,130,246,0.25)]">
          <p className="text-[14px] text-white leading-relaxed">{content}</p>
        </div>
      </div>
    );
  }

  // Simple markdown parsing for bold
  const formatContent = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className={cn("flex justify-start", className)}>
      <div className="max-w-[85%] rounded-[16px] px-5 py-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
        <div className="text-[14px] text-[rgba(255,255,255,0.85)] leading-relaxed whitespace-pre-wrap">
          {formatContent(content)}
        </div>
      </div>
    </div>
  );
};

