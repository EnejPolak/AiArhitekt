"use client";

import * as React from "react";
import { ProductShoppingSections } from "../ProductShoppingSections";
import type { ProjectProductShoppingState } from "@/lib/discovery/shoppingState";
import { wizardPanelClass } from "../wizardUi";

export interface Step9cShoppingListProps {
  shoppingState: ProjectProductShoppingState;
  onContinue: () => void;
  onRetryRequirement?: (requirementKey: string) => void;
  onChangeConstraints?: (requirementKey: string) => void;
  onIncreaseBudget?: (requirementKey: string) => void;
  onRemoveRequirement?: (requirementKey: string) => void;
  retryBusyKey?: string | null;
}

export const Step9cShoppingList: React.FC<Step9cShoppingListProps> = ({
  shoppingState,
  onContinue,
  onRetryRequirement,
  onChangeConstraints,
  onIncreaseBudget,
  onRemoveRequirement,
  retryBusyKey,
}) => {
  return (
    <div className="flex justify-start mb-6">
      <div className={`${wizardPanelClass} space-y-5`}>
        <div className="text-[15px] text-[rgba(255,255,255,0.85)] leading-relaxed">
          Shopping list from your saved product search.
        </div>
        <ProductShoppingSections
          state={shoppingState}
          onRetryRequirement={onRetryRequirement}
          onChangeConstraints={onChangeConstraints}
          onIncreaseBudget={onIncreaseBudget}
          onRemoveRequirement={onRemoveRequirement}
          retryBusyKey={retryBusyKey}
        />
        <button
          type="button"
          onClick={onContinue}
          className="text-[14px] text-[rgba(0,230,204,0.85)] hover:text-[rgba(0,230,204,1)]"
        >
          Continue
        </button>
      </div>
    </div>
  );
};
