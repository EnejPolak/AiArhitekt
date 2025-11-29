"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Send } from "lucide-react";

export interface ChatInputProps {
  onSubmit: (message: string) => void;
  className?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  className,
}) => {
  const [message, setMessage] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSubmit(message);
      setMessage("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn("relative", className)}>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask anything about your project..."
        className={cn(
          "w-full h-[48px] pl-4 pr-12 rounded-[12px]",
          "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)]",
          "text-[14px] text-white placeholder-[rgba(255,255,255,0.40)]",
          "focus:outline-none focus:border-[rgba(59,130,246,0.40)]",
          "transition-colors"
        )}
      />
      <button
        type="submit"
        disabled={!message.trim()}
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2",
          "w-8 h-8 rounded-lg flex items-center justify-center",
          "bg-[rgba(59,130,246,0.20)] text-[#3B82F6]",
          "hover:bg-[rgba(59,130,246,0.30)] hover:text-[#2563EB]",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "transition-colors"
        )}
      >
        <Send className="w-4 h-4" />
      </button>
    </form>
  );
};


