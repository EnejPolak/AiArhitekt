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
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("sl-SI", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
    }).format(amount);

  const handleDownloadReport = () => {
    // TODO: Generate and download PDF report
    console.log("Downloading report for project:", projectId);
  };

  return (
    <div className="space-y-6 mt-8">
      {/* Selected Design */}
      {data.selectedDesign && (
        <div className="rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <h3 className="text-[16px] font-medium text-white mb-3">Selected Design</h3>
          <img
            src={data.selectedDesign}
            alt="Selected design"
            className="w-full max-w-[600px] h-auto rounded-lg"
          />
        </div>
      )}

      {/* Cost Estimate */}
      {data.costEstimate && (
        <div className="rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <h3 className="text-[16px] font-medium text-white mb-4">Cost Estimate</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-[14px]">
              <span className="text-[rgba(255,255,255,0.70)]">Materials:</span>
              <span className="text-white">
                {formatCurrency(data.costEstimate.materials.min)} - {formatCurrency(data.costEstimate.materials.max)}
              </span>
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="text-[rgba(255,255,255,0.70)]">Furniture:</span>
              <span className="text-white">
                {formatCurrency(data.costEstimate.furniture.min)} - {formatCurrency(data.costEstimate.furniture.max)}
              </span>
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="text-[rgba(255,255,255,0.70)]">Labor:</span>
              <span className="text-white">
                {formatCurrency(data.costEstimate.labor.min)} - {formatCurrency(data.costEstimate.labor.max)}
              </span>
            </div>
            <div className="flex justify-between text-[16px] font-medium pt-2 border-t border-[rgba(255,255,255,0.1)]">
              <span className="text-white">Total:</span>
              <span className="text-white">
                {formatCurrency(data.costEstimate.total.min)} - {formatCurrency(data.costEstimate.total.max)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Budget Plan */}
      {data.budgetPlan && (
        <div className="rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <h3 className="text-[16px] font-medium text-white mb-4">Budget Allocation</h3>
          <div className="space-y-2">
            {Object.entries(data.budgetPlan.caps).map(([category, cap]) => (
              <div key={category} className="flex justify-between text-[14px]">
                <span className="text-[rgba(255,255,255,0.85)]">{category}:</span>
                <span className="text-white">
                  {formatCurrency(cap.max)} (qty: {cap.qty})
                </span>
              </div>
            ))}
            <div className="flex justify-between text-[16px] font-medium pt-2 border-t border-[rgba(255,255,255,0.1)]">
              <span className="text-white">Total Budget:</span>
              <span className="text-white">{formatCurrency(data.budgetPlan.totalBudget)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Shopping List */}
      {data.shoppingList && data.shoppingList.length > 0 && (
        <div className="rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <h3 className="text-[16px] font-medium text-white mb-4">Shopping List</h3>
          <div className="space-y-3">
            {data.shoppingList.map((item, idx) => (
              <div key={idx} className="border border-[rgba(255,255,255,0.10)] rounded-lg p-3">
                <div className="flex items-start gap-3">
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-16 h-16 object-cover rounded"
                    />
                  )}
                  <div className="flex-1">
                    <div className="text-[14px] font-medium text-white">{item.name}</div>
                    <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1">
                      {item.store} · {item.category}
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[14px] text-white font-medium">
                        {formatCurrency(item.price)}
                      </span>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-[#3B82F6] hover:underline"
                      >
                        View product →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="pt-3 border-t border-[rgba(255,255,255,0.1)] mt-3">
              <div className="flex justify-between text-[16px] font-medium">
                <span className="text-white">Total:</span>
                <span className="text-white">
                  {formatCurrency(data.shoppingList.reduce((sum, item) => sum + item.price * item.qty, 0))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contractors */}
      {data.contractors && Object.keys(data.contractors).length > 0 && (
        <div className="rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <h3 className="text-[16px] font-medium text-white mb-4">Local Contractors</h3>
          <div className="space-y-4">
            {Object.entries(data.contractors).map(([trade, contractors]) => (
              <div key={trade}>
                <h4 className="text-[14px] font-medium text-white mb-2 capitalize">{trade}</h4>
                <div className="space-y-2">
                  {contractors.map((contractor, idx) => (
                    <div key={idx} className="border border-[rgba(255,255,255,0.10)] rounded-lg p-3">
                      <div className="text-[14px] font-medium text-white">{contractor.name}</div>
                      <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1">
                        {contractor.address}
                      </div>
                      {contractor.rating && (
                        <div className="text-[12px] text-[rgba(255,255,255,0.60)] mt-1">
                          ⭐ {contractor.rating.toFixed(1)}
                          {contractor.reviewsCount && ` (${contractor.reviewsCount} reviews)`}
                        </div>
                      )}
                      <div className="flex gap-3 mt-2">
                        {contractor.phone && (
                          <a
                            href={`tel:${contractor.phone}`}
                            className="text-[12px] text-[#3B82F6] hover:underline"
                          >
                            📞 {contractor.phone}
                          </a>
                        )}
                        {contractor.website && (
                          <a
                            href={contractor.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[12px] text-[#3B82F6] hover:underline"
                          >
                            Website →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
