import type { FoodCommodity, FoodProperties, PackagingMaterial, ShelfLifeEstimate, SustainabilityBreakdown, WasteEconomics } from '../domain/types';
import { clamp, round } from './util';
import { recyclabilityScore } from './scoring';

/**
 * SUSTAINABILITY ENGINE + FOOD-WASTE ECONOMICS.
 * Comparative, simplified estimates — explicitly NOT an ISO LCA or measured
 * carbon footprint. All results labelled "estimated" in the UI.
 */

export function assessSustainability(
  material: PackagingMaterial,
  packageSizeGrams: number,
  shelfLife: ShelfLifeEstimate,
  commodity: FoodCommodity,
): SustainabilityBreakdown {
  // Film area for the given pack size (~0.06 m² per kg as demo assumption)
  const areaM2 = Math.max(0.02, (packageSizeGrams / 1000) * 0.06);

  // Material impact: carbon per pack vs 0.5 kg CO2e worst-case anchor
  const carbonPerPack = material.carbonKgCo2ePerM2.value * areaM2;
  const materialImpact = clamp(1 - Math.log10(Math.max(carbonPerPack, 0.005) / 0.01) / Math.log10(25), 0.02, 1);

  const recyclability = recyclabilityScore(material);

  const bioBonus = material.category === 'paper' || material.category === 'bioplastic' || material.category === 'compostable' ? 0.3 : 0;
  const recycledContent = clamp(material.recycledContentPct / 100 + bioBonus);

  // Food-waste reduction: longer modelled shelf life vs baseline → less spoilage
  const baseline = Math.max(1.5, commodity.indicativeShelfLifeDays.value);
  const wasteReduction = clamp((shelfLife.daysLow / baseline - 0.8) / 0.8);

  // Transport efficiency: lighter/lower-carbon materials score better
  const transportEfficiency = clamp(1 - Math.log10(Math.max(material.carbonKgCo2ePerM2.value, 0.05) / 0.2) / Math.log10(6));

  const endOfLife = clamp(0.5 * recyclability + 0.3 * recycledContent + (material.category === 'paper' ? 0.2 : 0.1));

  const total = round(
    100 * clamp(0.25 * materialImpact + 0.2 * recyclability + 0.1 * recycledContent + 0.25 * wasteReduction + 0.1 * transportEfficiency + 0.1 * endOfLife),
    0,
  );

  return {
    materialImpact: round(materialImpact * 100, 0),
    recyclability: round(recyclability * 100, 0),
    recycledContent: round(recycledContent * 100, 0),
    foodWasteReduction: round(wasteReduction * 100, 0),
    transportEfficiency: round(transportEfficiency * 100, 0),
    endOfLife: round(endOfLife * 100, 0),
    total,
    label: 'estimated',
    notes: 'Simplified comparative model (material, recyclability, food-waste potential, end-of-life). Not an ISO 14040 LCA; not a measured carbon footprint.',
  };
}

export function estimateWasteEconomics(
  commodity: FoodCommodity,
  packageSizeGrams: number,
  shelfLife: ShelfLifeEstimate,
  packagingCostInr: number,
): WasteEconomics {
  // Demo loss model: baseline loss 18% without optimized packaging, reduced in
  // proportion to shelf-life extension (capped at 70% reduction). ESTIMATES ONLY.
  const baselineLoss = 18;
  const baseline = Math.max(1.5, commodity.indicativeShelfLifeDays.value);
  const extension = clamp(shelfLife.daysLow / baseline - 1, 0, 1);
  const lossWith = baselineLoss * (1 - 0.7 * extension);

  const foodValuePerPack = (packageSizeGrams / 1000) * commodity.valuePerKgInr.value;
  const foodValueLost = round(foodValuePerPack * (baselineLoss / 100), 2);
  const foodValueSaved = round(foodValuePerPack * ((baselineLoss - lossWith) / 100), 2);
  const additionalCost = round(packagingCostInr * 0.35, 2); // vs conventional baseline pack

  return {
    packageSizeGrams,
    lossRateWithoutPct: round(baselineLoss, 1),
    lossRateWithPct: round(lossWith, 1),
    foodValueLostInr: foodValueLost,
    foodValueSavedInr: foodValueSaved,
    additionalPackagingCostInr: additionalCost,
    netEconomicImpactInr: round(foodValueSaved - additionalCost, 2),
    label: 'estimated',
  };
}
