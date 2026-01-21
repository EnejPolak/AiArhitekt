"use client";

import * as React from "react";
import { HomeRenovationData } from "../HomeRenovationFlow";

export interface Step11FinalReportProps {
  data: HomeRenovationData;
  onStartAnother: () => void;
}

export const Step11FinalReport: React.FC<Step11FinalReportProps> = ({
  data,
  onStartAnother,
}) => {
  const handleDownloadReport = () => {
    // TODO: Generate and download PDF report
    // This would include:
    // - Home summary
    // - Selected design concept renders
    // - Renovation scope
    // - Cost estimate
    // - Material guidance
    console.log("Download report", data);
    alert("PDF report generation coming soon");
  };

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={handleDownloadReport}
          className="px-6 py-3 rounded-lg bg-[#3B82F6] text-white text-[14px] font-medium hover:bg-[#2563EB] transition-colors"
        >
          Download Renovation Report
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
