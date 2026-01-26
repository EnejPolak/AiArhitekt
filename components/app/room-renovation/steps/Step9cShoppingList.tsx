"use client";

import * as React from "react";

export interface Step9cShoppingListProps {
  productCandidates: Record<string, Array<{
    name: string;
    price: number;
    url: string;
    imageUrl: string | null;
    store: string;
  }>>;
  budgetPlan: {
    caps: Record<string, { max: number; qty: number }>;
    reservedBufferRatio: number;
    totalBudget: number;
  };
  onShoppingListComplete: (shoppingList: Array<{
    name: string;
    price: number;
    url: string;
    imageUrl: string | null;
    store: string;
    category: string;
    qty: number;
  }>) => void;
}

export const Step9cShoppingList: React.FC<Step9cShoppingListProps> = ({
  productCandidates,
  budgetPlan,
  onShoppingListComplete,
}) => {
  const [isLoading, setIsLoading] = React.useState(true);
  const [shoppingList, setShoppingList] = React.useState<Array<{
    name: string;
    price: number;
    url: string;
    imageUrl: string | null;
    store: string;
    category: string;
    qty: number;
  }>>([]);
  const lastRunKeyRef = React.useRef<string>("");

  React.useEffect(() => {
    const runKey = JSON.stringify({ productCandidates, budgetPlan });
    if (lastRunKeyRef.current === runKey) return;
    lastRunKeyRef.current = runKey;

    // Build final shopping list
    const buildShoppingList = () => {
      const list: Array<{
        name: string;
        price: number;
        url: string;
        imageUrl: string | null;
        store: string;
        category: string;
        qty: number;
      }> = [];

      // For each category, select products within budget
      Object.entries(budgetPlan.caps).forEach(([category, cap]) => {
        const candidates = productCandidates[category] || [];
        
        // Filter by price and select up to qty
        const affordable = candidates
          .filter((p) => p.price <= cap.max)
          .slice(0, cap.qty);

        affordable.forEach((product) => {
          list.push({
            ...product,
            category,
            qty: 1, // Default qty, can be adjusted
          });
        });
      });

      // Check if total exceeds budget
      const total = list.reduce((sum, item) => sum + item.price * item.qty, 0);
      
      if (total > budgetPlan.totalBudget) {
        // Sort by price (descending) and remove expensive items first
        list.sort((a, b) => b.price - a.price);
        let currentTotal = total;
        const adjustedList: typeof list = [];

        for (const item of list) {
          if (currentTotal - item.price * item.qty <= budgetPlan.totalBudget) {
            adjustedList.push(item);
            currentTotal -= item.price * item.qty;
          }
        }

        setShoppingList(adjustedList);
        onShoppingListComplete(adjustedList);
      } else {
        setShoppingList(list);
        onShoppingListComplete(list);
      }

      setIsLoading(false);
    };

    buildShoppingList();
  }, [productCandidates, budgetPlan, onShoppingListComplete]);

  if (isLoading) {
    return (
      <div className="flex justify-start mb-6">
        <div className="max-w-[85%] rounded-[16px] px-6 py-5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)]">
          <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
            Building a final shopping list that stays within your total budget…
          </div>
        </div>
      </div>
    );
  }

  // Shopping list will be shown in conversation timeline
  return null;
};
