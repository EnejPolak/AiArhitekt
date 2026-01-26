"use client";

import * as React from "react";

export interface Step9bProductSourcingProps {
  roomType: string;
  selectedDesign: string | null;
  preferences: any;
  budgetPlan: {
    caps: Record<string, { max: number; qty: number }>;
    reservedBufferRatio: number;
    totalBudget: number;
  };
  localStores: Array<{
    name: string;
    address: string;
    website: string | null;
    placeId: string;
    categoriesHint: string[];
  }>;
  onProductsFound: (candidates: Record<string, Array<{
    name: string;
    price: number;
    url: string;
    imageUrl: string | null;
    store: string;
  }>>) => void;
}

export const Step9bProductSourcing: React.FC<Step9bProductSourcingProps> = ({
  roomType,
  selectedDesign,
  preferences,
  budgetPlan,
  localStores,
  onProductsFound,
}) => {
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const lastRunKeyRef = React.useRef<string>("");

  React.useEffect(() => {
    const runKey = `${roomType}|${JSON.stringify(budgetPlan.caps)}|${localStores.length}`;
    if (lastRunKeyRef.current === runKey) return;
    lastRunKeyRef.current = runKey;

    const sourceProducts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/search-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomType,
            selectedDesign,
            preferences,
            budgetPlan,
            localStores,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to source products");
        }

        const data = await response.json();
        onProductsFound(data.candidatesByCategory || {});
      } catch (err: any) {
        console.error("Error sourcing products:", err);
        setError(err.message || "Failed to source products");
        // Continue with empty object
        onProductsFound({});
      } finally {
        setIsLoading(false);
      }
    };

    sourceProducts();
  }, [roomType, selectedDesign, preferences, budgetPlan, localStores, onProductsFound]);

  if (isLoading) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            Pulling real products (price + link + image) from local stores, staying within your category caps…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
