"use client";

import * as React from "react";
import { RoomRenovationData } from "../RoomRenovationFlow";

export interface Step10FinalReportProps {
  projectId: string;
  data: RoomRenovationData;
  onStartAnother: () => void;
}

export const Step10FinalReport: React.FC<Step10FinalReportProps> = ({
  projectId,
  data,
  onStartAnother,
}) => {
  const handleDownloadReport = () => {
    // TODO: Generate and download PDF report
    console.log("Downloading report for project:", projectId);
  };

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex flex-col md:flex-row gap-4 mt-8">
        <button
          onClick={handleDownloadReport}
          className="px-6 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium hover:bg-[#2563EB] transition-colors"
        >
          Download Project Report
        </button>
        <button
          onClick={onStartAnother}
          className="px-6 py-3 rounded-lg border border-[rgba(255,255,255,0.15)] text-white text-[14px] font-medium hover:bg-[rgba(255,255,255,0.05)] transition-colors"
        >
          Start another project
        </button>
      </div>
    </div>
  );
};
