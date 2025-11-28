"use client";

import { AIFeaturesHero } from "@/components/pages/ai-features/AIFeaturesHero";
import { FeatureBlock } from "@/components/pages/ai-features/FeatureBlock";
import { FeaturesCTA } from "@/components/pages/ai-features/FeaturesCTA";
import { Footer } from "@/components/layout/Footer";

const FEATURES = [
  {
    id: 1,
    title: "AI Floor Plan Reader",
    description:
      "Upload any floor plan—sketch, scan, or PDF—and our AI instantly recognizes walls, windows, doors, and room dimensions. Converts everything into a clean, editable vector model.",
    bullets: [
      "Detects walls, windows and room sizes",
      "Works with sketches, scans, PDFs",
      "Converts everything into a clean vector model",
      "Highlights errors or inconsistencies",
    ],
    imagePosition: "right" as const,
  },
  {
    id: 2,
    title: "AI 3D Space Builder",
    description:
      "Transforms your 2D floor plan into a photorealistic 3D model. Automatically adds realistic lighting, materials, and furniture placement based on architectural best practices.",
    bullets: [
      "Generates realistic 3D models from 2D plans",
      "Automatic lighting and material application",
      "Smart furniture placement suggestions",
      "Export to common 3D formats",
    ],
    imagePosition: "left" as const,
  },
  {
    id: 3,
    title: "Material Intelligence Engine",
    description:
      "AI analyzes your design and recommends optimal materials, finishes, and construction methods. Considers durability, cost, sustainability, and local availability.",
    bullets: [
      "Material recommendations based on design",
      "Cost and sustainability analysis",
      "Local availability matching",
      "Durability and maintenance insights",
    ],
    imagePosition: "right" as const,
  },
  {
    id: 4,
    title: "Smart Cost Estimator",
    description:
      "Get accurate project cost estimates broken down by materials, labor, and permits. AI factors in regional pricing, project complexity, and current market rates.",
    bullets: [
      "Accurate cost breakdown by category",
      "Regional pricing adjustments",
      "Labor and material cost estimates",
      "Budget timeline projections",
    ],
    imagePosition: "left" as const,
  },
  {
    id: 5,
    title: "Permit & Legal Guide",
    description:
      "Understand exactly what permits and approvals you need for your project. AI identifies requirements based on your location, project type, and local regulations.",
    bullets: [
      "Permit requirement identification",
      "Local regulation compliance check",
      "Application timeline guidance",
      "Documentation checklist",
    ],
    imagePosition: "right" as const,
  },
  {
    id: 6,
    title: "Project Report Export",
    description:
      "Generate comprehensive project reports with 3D visualizations, cost breakdowns, material lists, and permit requirements. Export to PDF, Word, or share via link.",
    bullets: [
      "Comprehensive project documentation",
      "Multiple export formats (PDF, Word, etc.)",
      "Shareable project links",
      "Printable construction-ready reports",
    ],
    imagePosition: "left" as const,
  },
];

export default function AIFeaturesPage() {
  return (
    <main className="min-h-screen bg-[#0A0F14]">
      <AIFeaturesHero />
      {FEATURES.map((feature, index) => (
        <FeatureBlock
          key={feature.id}
          title={feature.title}
          description={feature.description}
          bullets={feature.bullets}
          imagePosition={feature.imagePosition}
          isFirst={index === 0}
        />
      ))}
      <FeaturesCTA />
      <Footer />
    </main>
  );
}

