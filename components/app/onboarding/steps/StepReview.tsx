"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "../ChatMessage";
import { ProjectData } from "../OnboardingFlow";
import { Edit2 } from "lucide-react";

export interface StepReviewProps {
  projectData: ProjectData;
  onComplete: () => void;
  onEdit: (step: number) => void;
}

const ReviewItem = ({ label, value, step, onEdit }: { label: string; value: string | React.ReactNode; step: number; onEdit: (step: number) => void }) => (
  <div className="flex items-start justify-between pb-3 border-b border-[rgba(255,255,255,0.08)]">
    <div>
      <div className="text-[12px] font-medium text-[rgba(255,255,255,0.50)] mb-1">{label}</div>
      <div className="text-[14px] text-white">{value}</div>
    </div>
    <button
      type="button"
      onClick={() => onEdit(step)}
      className="flex items-center gap-1 text-[12px] text-[#3B82F6] hover:text-[#2563EB] transition-colors"
    >
      <Edit2 className="w-3 h-3" />
      Edit
    </button>
  </div>
);

export const StepReview: React.FC<StepReviewProps> = ({ projectData, onComplete, onEdit }) => {
  const typeLabels: Record<string, string> = {
    "new-construction": "New Construction",
    renovation: "Renovation",
    extension: "Extension",
  };

  const renovationConditionLabels: Record<string, string> = {
    poor: "Poor (full reconstruction)",
    medium: "Medium (partial renovation)",
    good: "Good (cosmetic changes)",
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <ChatMessage
        type="ai"
        content={`**Step 14 — Review your project inputs**

If everything looks correct, I'll generate your 3D concept, cost range, and a basic permit guidance overview.`}
      />
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[16px] px-5 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="space-y-4">
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {projectData.location && (
                <ReviewItem
                  label="Location"
                  value={
                    <>
                      {projectData.location.address}
                      {projectData.location.useGeolocation && " (auto-detected)"}
                      <span className="text-[rgba(255,255,255,0.60)]"> • {projectData.location.radius} km radius</span>
                    </>
                  }
                  step={1}
                  onEdit={onEdit}
                />
              )}

              {projectData.projectType && (
                <ReviewItem
                  label="Project Type"
                  value={
                    <>
                      {typeLabels[projectData.projectType.type || ""] || projectData.projectType.type}
                      {projectData.projectType.renovationCondition && (
                        <span className="text-[rgba(255,255,255,0.60)]">
                          {" • "}
                          {renovationConditionLabels[projectData.projectType.renovationCondition]}
                        </span>
                      )}
                    </>
                  }
                  step={2}
                  onEdit={onEdit}
                />
              )}

              {projectData.plotSize && (
                <ReviewItem
                  label="Plot Size"
                  value={
                    <>
                      {projectData.plotSize.size}m²
                      {projectData.plotSize.buildingFootprint && ` • Building footprint: ${projectData.plotSize.buildingFootprint}m²`}
                      {projectData.plotSize.terrainType && (
                        <span className="text-[rgba(255,255,255,0.60)]"> • {projectData.plotSize.terrainType}</span>
                      )}
                    </>
                  }
                  step={3}
                  onEdit={onEdit}
                />
              )}

              {projectData.projectSize && (
                <ReviewItem
                  label="Project Size"
                  value={
                    <>
                      {projectData.projectSize.size}m² • {projectData.projectSize.rooms} rooms
                      {projectData.projectSize.ceilingHeight && (
                        <span className="text-[rgba(255,255,255,0.60)]"> • {projectData.projectSize.ceilingHeight} ceiling</span>
                      )}
                    </>
                  }
                  step={4}
                  onEdit={onEdit}
                />
              )}

              {projectData.documents && (
                <ReviewItem
                  label="Documents"
                  value={[
                    projectData.documents.hasNoDocuments && "No documents",
                    projectData.documents.hasFloorPlan && "Floor plan",
                    projectData.documents.hasMeasurements && "Measurements",
                    projectData.documents.hasPhotos && "Photos",
                    projectData.documents.needsPermitHelp && "Needs permit help",
                  ]
                    .filter(Boolean)
                    .join(", ") || "None"}
                  step={5}
                  onEdit={onEdit}
                />
              )}

              {projectData.uploads && (
                <ReviewItem
                  label="Uploaded Files"
                  value={
                    <>
                      {projectData.uploads.floorplanImage && "Floorplan, "}
                      {projectData.uploads.roomPhotos.length > 0 && `${projectData.uploads.roomPhotos.length} room photo(s), `}
                      {projectData.uploads.sketches && projectData.uploads.sketches.length > 0 && `${projectData.uploads.sketches.length} sketch(es), `}
                      {projectData.uploads.googleMapsScreenshot && "Google Maps screenshot"}
                    </>
                  }
                  step={6}
                  onEdit={onEdit}
                />
              )}

              {projectData.interiorStyle && (
                <ReviewItem label="Interior Style" value={projectData.interiorStyle} step={7} onEdit={onEdit} />
              )}

              {projectData.materialGrade && (
                <ReviewItem label="Material Grade" value={projectData.materialGrade} step={8} onEdit={onEdit} />
              )}

              {projectData.furnitureStyle && (
                <ReviewItem label="Furniture Style" value={projectData.furnitureStyle} step={9} onEdit={onEdit} />
              )}

              {projectData.shoppingPreferences && (
                <ReviewItem
                  label="Shopping Preferences"
                  value={
                    <div className="space-y-1 text-[13px]">
                      <div>Flooring: {projectData.shoppingPreferences.flooring}</div>
                      <div>Paint: {projectData.shoppingPreferences.paint}</div>
                      <div>Lighting: {projectData.shoppingPreferences.lighting}</div>
                      <div>Kitchen: {projectData.shoppingPreferences.kitchen}</div>
                      <div>Bathroom: {projectData.shoppingPreferences.bathroom}</div>
                      <div>Furniture: {projectData.shoppingPreferences.furniture}</div>
                      <div>Decor: {projectData.shoppingPreferences.decor}</div>
                    </div>
                  }
                  step={10}
                  onEdit={onEdit}
                />
              )}

              {projectData.renderAngle && (
                <ReviewItem label="Render Angle" value={projectData.renderAngle} step={11} onEdit={onEdit} />
              )}

              {projectData.budgetRange && (
                <ReviewItem
                  label="Budget Range"
                  value={
                    <>
                      {formatCurrency(projectData.budgetRange.min)} - {formatCurrency(projectData.budgetRange.max)}
                      {projectData.budgetRange.strictness && (
                        <span className="text-[rgba(255,255,255,0.60)]"> • {projectData.budgetRange.strictness}</span>
                      )}
                    </>
                  }
                  step={12}
                  onEdit={onEdit}
                />
              )}

              {projectData.specialRequirements && (
                <ReviewItem
                  label="Special Requirements"
                  value={
                    <div className="space-y-1 text-[13px]">
                      {projectData.specialRequirements.heating && <div>Heating: {projectData.specialRequirements.heating}</div>}
                      {projectData.specialRequirements.flooring && <div>Flooring: {projectData.specialRequirements.flooring}</div>}
                      {projectData.specialRequirements.colors && <div>Colors: {projectData.specialRequirements.colors}</div>}
                      {projectData.specialRequirements.furnitureMustHave && (
                        <div>Furniture: {projectData.specialRequirements.furnitureMustHave}</div>
                      )}
                      {projectData.specialRequirements.kitchenBathroomNeeds && (
                        <div>Kitchen/Bathroom: {projectData.specialRequirements.kitchenBathroomNeeds}</div>
                      )}
                      {!projectData.specialRequirements.heating &&
                        !projectData.specialRequirements.flooring &&
                        !projectData.specialRequirements.colors &&
                        !projectData.specialRequirements.furnitureMustHave &&
                        !projectData.specialRequirements.kitchenBathroomNeeds && <div className="text-[rgba(255,255,255,0.50)]">None</div>}
                    </div>
                  }
                  step={13}
                  onEdit={onEdit}
                />
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                onClick={() => onEdit(1)}
                className={cn(
                  "flex-1 border border-[rgba(255,255,255,0.18)] bg-transparent",
                  "text-[rgba(255,255,255,0.80)] hover:bg-[rgba(255,255,255,0.08)]",
                  "h-[44px] text-[14px] font-medium rounded-[12px]",
                  "transition-all duration-200"
                )}
              >
                Back to edit
              </Button>
              <Button
                type="button"
                onClick={onComplete}
                className={cn(
                  "flex-1 bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
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
                Looks good — generate 3D
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
